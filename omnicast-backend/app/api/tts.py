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
        # Prepend voice design attributes to the text if provided
        # OmniVoice uses [attribute:value] tags for design
        prompt_prefix = ""
        # For now we'll use a default reference if we had one, but let's try pure text-to-speech
        # If OmniVoice requires a ref_audio, we'll need to provide a default sample.
        # However, it supports 'voice design' via text prompts.
        
        # Example: "Hello" -> "[gender:male][age:young] Hello"
        # Since our schema doesn't have these yet, we'll stick to basic text for now
        # but the model will use its default base voice.
        
        audio_list = model.generate(
            text=body.text,
            # If no ref_audio is provided, it uses the default designed voice characteristics
            # speed=body.speed # Some versions use 'speed' in generate, some don't
        )
        
        if not audio_list:
            raise ValueError("Model returned empty audio list")
            
        # Convert numpy array (T,) to torch tensor (1, T) for our engine
        waveform = torch.from_numpy(audio_list[0]).unsqueeze(0)
        sample_rate = 24000  # OmniVoice native rate
        
        logger.info(f"[TTS] Generated {waveform.shape[-1]} samples.")

    except Exception as exc:
        logger.error(f"[TTS] Inference error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Inference failed: {str(exc)}",
        )

    wav_bytes = tensor_to_wav_bytes(waveform, sample_rate)
    return Response(content=wav_bytes, media_type="audio/wav")
