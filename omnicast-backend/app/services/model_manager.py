"""
model_manager.py
----------------
Handles downloading and lazy-loading the OmniVoice model weights.

Architecture decisions:
  - float16 on CUDA  →  halves VRAM footprint (~4 GB instead of ~8 GB)
  - Singleton pattern  →  model is loaded once at startup and reused
  - IdleGuard monitors idle time and offloads to CPU automatically
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

import torch
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
from app.core.config import get_settings
from app.core.logger import get_logger
from app.utils.vram import IdleGuard, clear_cache, log_vram

logger   = get_logger(__name__)
settings = get_settings()

# ── module-level singletons ──────────────────────────────────────────────────
_model:      Optional[object]    = None
_idle_guard: Optional[IdleGuard] = None


def _get_model_ref():
    """Closure used by IdleGuard to always get the current model object."""
    return _model


# ── weight downloader ────────────────────────────────────────────────────────
def _ensure_weights_exist(model_dir: Path) -> None:
    """
    Check whether model weights are present in *model_dir*.
    If not, attempt to download them from HuggingFace.
    """
    model_dir.mkdir(parents=True, exist_ok=True)
    
    # Check for a specific file that indicates the model is downloaded
    indicator_file = model_dir / ".download_complete"
    
    if indicator_file.exists():
        logger.info(f"[MODEL] Weights verified in {model_dir}")
        return

    logger.warning("[MODEL] Weights not found — downloading from k2-fsa/OmniVoice...")
    try:
        from huggingface_hub import snapshot_download
        # 1. Download main OmniVoice weights
        snapshot_download(
            repo_id="k2-fsa/OmniVoice",
            local_dir=model_dir,
            local_dir_use_symlinks=False
        )
        
        # 2. Pre-download Whisper model used for alignment/cloning
        # This prevents the "stuck" feeling during first inference
        logger.info("[MODEL] Pre-downloading Whisper large-v3-turbo (1.6GB) for cloning...")
        snapshot_download(
            repo_id="openai/whisper-large-v3-turbo",
            local_dir_use_symlinks=False
        )
        
        # Create indicator file
        indicator_file.touch()
        logger.info("[MODEL] ✓ All weights and dependencies ready.")
    except Exception as exc:
        logger.error(f"[MODEL] Download failed: {exc}")
        raise


# ── model initializer ────────────────────────────────────────────────────────
def load_model():
    """
    Load OmniVoice with float16 on CUDA (RTX 3070 optimised).
    Falls back to CPU if no GPU is detected.

    Returns the loaded model object.
    """
    global _model, _idle_guard

    if _model is not None:
        logger.debug("[MODEL] Already loaded — returning cached instance.")
        return _model

    model_dir = settings.weights_dir
    _ensure_weights_exist(model_dir)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype  = torch.float16 if device == "cuda" else torch.float32

    logger.info(f"[MODEL] Loading OmniVoice on device={device}, dtype={dtype} …")
    log_vram("BEFORE LOAD")

    try:
        from omnivoice import OmniVoice
        
        # Load the model from the local weights directory
        _model = OmniVoice.from_pretrained(
            str(model_dir),
            device_map=device if device == "cuda" else None,
            torch_dtype=dtype
        )
        
        if device == "cuda":
            _model = _model.to(device)
            
        _model.eval()
        
        # Load the ASR model for auto-transcription during cloning
        logger.info("[MODEL] Loading internal ASR engine...")
        _model.load_asr_model()
        
        logger.info("[MODEL] OmniVoice engine successfully initialized.")

    except Exception as exc:
        logger.error(f"[MODEL] Load failed: {exc}")
        raise

    log_vram("AFTER LOAD")
    logger.info(f"[MODEL] ✓ OmniVoice ready on {device}.")

    # Start the idle-offload watchdog
    _idle_guard = IdleGuard(get_model_fn=_get_model_ref)

    return _model


def get_model():
    """
    FastAPI dependency / service helper.
    Ensures the model is on GPU before returning it.
    """
    global _model, _idle_guard

    if _model is None:
        load_model()

    if _idle_guard is not None:
        _idle_guard.reload_to_gpu(_model)
        _idle_guard.touch()

    return _model
