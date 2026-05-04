"""
tts.py  —  /tts  router
------------------------
POST /tts/generate   →  Generate speech from text using a preset voice.
"""

import json
import os

import torch
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
import uuid

from app.core.security import get_current_user
from app.core.logger import get_logger
from app.core.supabase import get_supabase
from app.services.model_manager import get_model
from app.services.audio_engine import (
    tensor_to_wav_bytes,
    get_cached_speaker_embedding,
    generate_with_voice_embedding,
    load_audio_to_file,
    extract_speaker_embedding,
    cache_speaker_embedding,
)
from app.utils.vram import vram_managed
from app.core.config import get_settings

router = APIRouter(prefix="/tts", tags=["TTS"])
logger = get_logger(__name__)
settings = get_settings()

_BUCKET = "reference-audio"


def _resolve_storage_path(record: dict, user_id: str, voice_id: str) -> str:
    meta = record.get("metadata") or {}
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except Exception:
            meta = {}
    storage_path = meta.get("storage_path")
    if storage_path:
        return storage_path
    return f"{user_id}/{voice_id}.wav"


def _is_uuid(val: str) -> bool:
    """Return True if val is a valid UUID string."""
    try:
        uuid.UUID(str(val))
        return True
    except Exception:
        return False


# ── request schema ────────────────────────────────────────────────────────────
class GenerateRequest(BaseModel):
    text: str = Field(
        ..., min_length=1, max_length=2000, description="Text to synthesize"
    )
    voice_id: str | None = Field(None, description="Optional preset voice ID")
    speed: float = Field(1.0, ge=0.5, le=2.0, description="Speech speed multiplier")
    metadata: dict | None = Field(
        None, description="Optional voice design metadata (gender, age, style)"
    )


# ── endpoint ──────────────────────────────────────────────────────────────────
@router.post(
    "/generate",
    summary="Generate speech (TTS)",
    response_class=Response,
    responses={
        200: {"content": {"audio/wav": {}}, "description": "WAV audio stream"},
        401: {"description": "Unauthorized"},
        500: {"description": "Inference error"},
    },
)
@vram_managed
async def generate(
    body: GenerateRequest,
    user: dict = Depends(get_current_user),
):
    logger.info(
        f"[TTS] Generating for user={user['email']} | "
        f"chars={len(body.text)} | voice={body.voice_id}"
    )

    model = get_model()

    try:
        # ── Step 1: Voice Design Mapping (OmniVoice 2604.00688 Protocol) ──────
        # Global attributes go into the 'instruct' parameter.
        # Research shows that 2-3 high-quality keywords are more stable than long lists.
        instruct_items = []

        if body.metadata:
            # 1. Gender (Highest priority)
            gender = body.metadata.get("gender")
            if gender in ["male", "female"]:
                instruct_items.append(gender)

            # 2. Age
            age = body.metadata.get("age")
            if age:
                instruct_items.append(age)

            # 3. Vocal Style Hint (Highest priority after demographic)
            style = body.metadata.get("style")
            style_active = False
            if style == "whisper":
                instruct_items.append("whisper")
                style_active = True
            elif style == "energetic":
                instruct_items.append("high pitch")
                style_active = True
            elif style == "soft":
                instruct_items.append("low pitch")
                style_active = True

            # 4. Accent (Only if NOT american, or if no complex style is active)
            accent = body.metadata.get("accent")
            if accent and "american" not in accent:
                instruct_items.append(accent)
            elif accent and not style_active:
                instruct_items.append(accent)

            # 5. Pitch (Only if not already handled by style)
            pitch = body.metadata.get("pitch")
            if pitch and "moderate" not in pitch and not style_active:
                instruct_items.append(pitch)

        instruct_str = ", ".join(instruct_items)
        logger.info(f"[TTS] Instruct: '{instruct_str}' | Speed: {body.speed}")

        # ── Step 2: Inference ────────────────────────────────────────────────
        # Only treat voice_id as a stored voice when it is a valid UUID
        if body.voice_id and _is_uuid(body.voice_id):
            embedding = get_cached_speaker_embedding(body.voice_id)
            if embedding is None:
                supabase = get_supabase()
                if not supabase:
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail="Supabase client not configured",
                    )

                try:
                    res = (
                        supabase.table("voices")
                        .select("id,user_id,metadata,type")
                        .eq("id", body.voice_id)
                        .eq("user_id", user["user_id"])
                        .execute()
                    )
                except Exception as exc:
                    # Defensive: catch any DB type errors (e.g., invalid uuid syntax)
                    logger.warning(f"[TTS] Skipping voice lookup due to invalid voice_id: {body.voice_id} ({exc})")
                    res = None
                if not res or not getattr(res, 'data', None):
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Voice not found",
                    )

                record = res.data[0]
                if record.get("type") != "cloned":
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="voice_id must reference a cloned voice",
                    )

                storage_path = _resolve_storage_path(
                    record, user["user_id"], body.voice_id
                )
                try:
                    ref_bytes = supabase.storage.from_(_BUCKET).download(storage_path)
                except Exception as exc:
                    logger.error(f"[TTS] Storage download failed: {exc}")
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Failed to download reference audio",
                    )

                tmp_path = load_audio_to_file(ref_bytes)
                try:
                    embedding = extract_speaker_embedding(model, tmp_path)
                    cache_speaker_embedding(body.voice_id, embedding)
                finally:
                    if os.path.exists(tmp_path):
                        os.remove(tmp_path)

            audio_array = generate_with_voice_embedding(
                model,
                body.text,
                embedding,
                speed=body.speed,
                language="English",
                instruct=instruct_str if instruct_str else None,
            )
            if isinstance(audio_array, torch.Tensor):
                waveform = audio_array
            else:
                waveform = torch.from_numpy(audio_array)
            waveform = waveform.unsqueeze(0) if waveform.ndim == 1 else waveform
        else:
            # Explicitly passing language='English' helps stabilize the embeddings.
            audio_list = model.generate(
                text=body.text,
                language="English",
                instruct=instruct_str if instruct_str else None,
                speed=body.speed,
                postprocess_output=False,
            )

            if not audio_list:
                raise ValueError("Model returned empty audio list")

            # Convert numpy array (T,) to torch tensor (1, T)
            waveform = torch.from_numpy(audio_list[0]).unsqueeze(0)
        sample_rate = 24000

        # Debug audio stats
        p_min, p_max = waveform.min().item(), waveform.max().item()
        logger.info(f"[TTS] Waveform stats: min={p_min:.4f}, max={p_max:.4f}")

    except Exception as exc:
        logger.error(f"[TTS] Inference error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Inference failed: {str(exc)}",
        )

    wav_bytes = tensor_to_wav_bytes(waveform, sample_rate)
    return Response(content=wav_bytes, media_type="audio/wav")
