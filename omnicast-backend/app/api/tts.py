"""
tts.py  —  /tts  router
------------------------
POST /tts/generate   →  Generate speech from text using a preset voice.
"""

import torch
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.core.security import get_current_user
from app.core.logger  import get_logger
from app.services.model_manager import get_model
from app.services.audio_engine  import tensor_to_wav_bytes
from app.utils.vram             import vram_managed
from app.core.config            import get_settings

router   = APIRouter(prefix="/tts",  tags=["TTS"])
logger   = get_logger(__name__)
settings = get_settings()


# ── request schema ────────────────────────────────────────────────────────────
class GenerateRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000, description="Text to synthesize")
    voice_id: str | None = Field(None, description="Optional preset voice ID")
    speed: float = Field(1.0, ge=0.5, le=2.0, description="Speech speed multiplier")
    metadata: dict | None = Field(None, description="Optional voice design metadata (gender, age, style)")


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
        # Global attributes go into the 'instruct' parameter as comma-separated keywords.
        instruct_items = []
        
        if body.metadata:
            # 1. Gender Mapping
            gender = body.metadata.get("gender")
            if gender == "female": instruct_items.append("female")
            elif gender == "male": instruct_items.append("male")
            
            # 2. Age Mapping
            age = body.metadata.get("age")
            if age: instruct_items.append(age) # Matches child, teenager, young adult, etc.
            
            # 3. Pitch Mapping (New)
            pitch = body.metadata.get("pitch")
            if pitch: instruct_items.append(pitch)
            
            # 4. Accent Mapping (New)
            accent = body.metadata.get("accent")
            if accent: instruct_items.append(accent)
            
            # 5. Vocal Style (Hints for 'instruct')
            style = body.metadata.get("style")
            if style == "whisper": instruct_items.append("whisper")
            elif style == "energetic": instruct_items.append("high pitch, fast")
            elif style == "soft":      instruct_items.append("low pitch, slow")

        # 6. Speed (from slider)
        if body.speed < 0.8: instruct_items.append("very slow")
        elif body.speed < 0.95: instruct_items.append("slow")
        elif body.speed > 1.2: instruct_items.append("fast")
        elif body.speed > 1.5: instruct_items.append("very fast")

        instruct_str = ", ".join(instruct_items)
        logger.info(f"[TTS] Instruct: '{instruct_str}' | Text: '{body.text[:50]}...'")

        # ── Step 2: Inference ────────────────────────────────────────────────
        audio_list = model.generate(
            text=body.text,
            instruct=instruct_str if instruct_str else None,
        )
        
        if not audio_list:
            raise ValueError("Model returned empty audio list")
            
        # Convert numpy array (T,) to torch tensor (1, T)
        waveform = torch.from_numpy(audio_list[0]).unsqueeze(0)
        sample_rate = 24000
        
        logger.info(f"[TTS] Generated {waveform.shape[-1]} samples.")

    except Exception as exc:
        logger.error(f"[TTS] Inference error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Inference failed: {str(exc)}",
        )

    wav_bytes = tensor_to_wav_bytes(waveform, sample_rate)
    return Response(content=wav_bytes, media_type="audio/wav")
