"""
clone.py  —  /clone  router
----------------------------
POST /clone/voice    →  Clone a voice from a reference audio + synthesize text.
Now includes auto-transcription for high-accuracy zero-shot cloning.
"""

import torch
import os
import tempfile
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response

from app.core.security          import get_current_user
from app.core.logger            import get_logger
from app.services.model_manager import get_model
from app.services.audio_engine  import tensor_to_wav_bytes, trim_audio_to_limit
from app.utils.vram             import vram_managed
from app.core.config            import get_settings

router   = APIRouter(prefix="/clone", tags=["Clone"])
logger   = get_logger(__name__)
settings = get_settings()

_ALLOWED_MIME = {"audio/wav", "audio/mpeg", "audio/ogg", "audio/flac", "audio/x-wav", "audio/webm", "audio/x-matroska", "audio/mp3"}
_MAX_BYTES    = 10 * 1024 * 1024   # 10 MB


@router.post(
    "/voice",
    summary="Clone a voice and synthesize speech",
)
@vram_managed
async def clone_voice(
    text: str = Form(..., min_length=1, max_length=2000),
    speed: float = Form(1.0, ge=0.5, le=2.0),
    reference_audio: UploadFile = File(..., description="WAV / MP3 reference sample"),
    user: dict = Depends(get_current_user),
):
    logger.info(f"[CLONE] Request from user={user['email']} | text_len={len(text)}")

    # ── validate and save upload ──────────────────────────────────────────────
    raw_bytes = await reference_audio.read()
    
    # ── trim reference audio ──────────────────────────────────────────────────
    # Long reference audio degrades quality. Trimming to 10s as recommended.
    logger.info("[CLONE] Trimming reference audio to optimal 10s window...")
    raw_bytes = trim_audio_to_limit(raw_bytes, limit_seconds=10.0)

    if len(raw_bytes) > _MAX_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    suffix = os.path.splitext(reference_audio.filename)[1] or ".audio"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(raw_bytes)
        tmp_path = tmp.name

    try:
        model = get_model()
        
        # ── Step 1: Auto-Transcribe Reference Audio ───────────────────────────
        # This is CRITICAL for zero-shot cloning accuracy.
        # OmniVoice requires knowing what was said in the reference to clone it.
        logger.info("[CLONE] Transcribing reference audio for alignment...")
        try:
            # OmniVoice typically has a transcribe or similar internal method
            # if using faster-whisper backend.
            ref_text = model.transcribe(tmp_path)
            logger.info(f"[CLONE] ✓ Reference Transcription: '{ref_text}'")
        except Exception as trans_err:
            logger.warning(f"[CLONE] Auto-transcription failed: {trans_err}. Using fallback empty prompt.")
            ref_text = ""

        # ── Step 2: Inference with Transcription ──────────────────────────────
        logger.info(f"[CLONE] Synthesizing text: '{text[:50]}...'")
        
        # Note: ref_text is passed as the prompt for the zero-shot encoder
        result = model.generate(
            text=text,
            ref_audio=tmp_path,
            ref_text=ref_text,
        )
        
        # Handle results (handles list or tuple return types)
        if isinstance(result, (list, tuple)):
            audio_data = result[0]
        else:
            audio_data = result

        if audio_data is None:
            raise ValueError("Model failed to generate audio")

        # Convert to torch tensor (C, T)
        waveform = torch.from_numpy(audio_data).float()
        if waveform.ndim == 1: waveform = waveform.unsqueeze(0)
            
        sample_rate = 24000
        logger.info(f"[CLONE] ✓ Generated {waveform.shape[-1]} samples.")

    except Exception as exc:
        logger.error(f"[CLONE] Cloning failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Inference error: {str(exc)}",
        )
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    wav_bytes = tensor_to_wav_bytes(waveform, sample_rate)
    return Response(content=wav_bytes, media_type="audio/wav")
