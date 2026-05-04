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
            if age: instruct_items.append(age)
            
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
