"""
model_manager.py
----------------
Handles downloading, lazy-loading, and VRAM hot-swapping for multiple models.

Architecture decisions:
  - float16 on CUDA  →  halves VRAM footprint
  - Multi-model Registry → Support for OmniVoice and MuseTalk
  - VRAM Hot-Swapping → Moves models to CPU when inactive to free GPU space.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional, Dict, Any

import torch
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
from app.core.config import get_settings
from app.core.logger import get_logger
from app.utils.vram import IdleGuard, clear_cache, log_vram

logger   = get_logger(__name__)
settings = get_settings()

# ── Registry for loaded models ───────────────────────────────────────────────
_REGISTRY: Dict[str, Any] = {
    "omnivoice": None,
    "musetalk": None
}
_IDLE_GUARDS: Dict[str, IdleGuard] = {}


# ── weight downloader ────────────────────────────────────────────────────────
def _ensure_omnivoice_weights(model_dir: Path) -> None:
    model_dir.mkdir(parents=True, exist_ok=True)
    indicator_file = model_dir / ".download_complete"
    
    if indicator_file.exists():
        return

    logger.warning("[MODEL] OmniVoice weights not found — downloading...")
    try:
        from huggingface_hub import snapshot_download
        snapshot_download(
            repo_id="k2-fsa/OmniVoice",
            local_dir=model_dir,
            local_dir_use_symlinks=False
        )
        indicator_file.touch()
        logger.info("[MODEL] ✓ OmniVoice weights ready.")
    except Exception as exc:
        logger.error(f"[MODEL] Download failed: {exc}")
        raise


# ── Model Loaders ───────────────────────────────────────────────────────────
def load_omnivoice():
    global _REGISTRY
    if _REGISTRY["omnivoice"] is not None:
        return _REGISTRY["omnivoice"]

    model_dir = settings.weights_dir / "omnivoice"
    _ensure_omnivoice_weights(model_dir)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype  = torch.float16 if device == "cuda" else torch.float32

    logger.info(f"[MODEL] Loading OmniVoice on {device}...")
    try:
        from omnivoice import OmniVoice
        model = OmniVoice.from_pretrained(
            str(model_dir),
            device_map=device if device == "cuda" else None,
            torch_dtype=dtype
        )
        if device == "cuda":
            model = model.to(device)
        model.eval()
        model.load_asr_model()
        
        _REGISTRY["omnivoice"] = model
        
        # Start IdleGuard for OmniVoice
        _IDLE_GUARDS["omnivoice"] = IdleGuard(get_model_fn=lambda: _REGISTRY["omnivoice"])
        
        return model
    except Exception as exc:
        logger.error(f"[MODEL] OmniVoice load failed: {exc}")
        raise


def load_musetalk():
    global _REGISTRY
    if _REGISTRY["musetalk"] is not None:
        return _REGISTRY["musetalk"]

    logger.info("[MODEL] Initializing MuseTalk engine...")
    try:
        from app.services.musetalk_engine import MuseTalkEngine
        engine = MuseTalkEngine()
        # MuseTalk logic handles its own loading but we manage it here
        engine.load()
        _REGISTRY["musetalk"] = engine
        
        # IdleGuard for MuseTalk
        _IDLE_GUARDS["musetalk"] = IdleGuard(get_model_fn=lambda: _REGISTRY["musetalk"])
        
        return engine
    except Exception as exc:
        logger.error(f"[MODEL] MuseTalk load failed: {exc}")
        raise


# ── Dependency Helpers ──────────────────────────────────────────────────────
def get_model(name: str = "omnivoice"):
    """
    Ensures the requested model is on GPU and touches its IdleGuard.
    """
    global _REGISTRY, _IDLE_GUARDS

    if name == "omnivoice":
        model = _REGISTRY["omnivoice"] or load_omnivoice()
    elif name == "musetalk":
        model = _REGISTRY["musetalk"] or load_musetalk()
    else:
        raise ValueError(f"Unknown model: {name}")

    # Hot-swap check: if it's an object with to(), move to GPU
    # If it's a wrapper class (like MuseTalkEngine), it should handle internal move
    if hasattr(model, "to") and torch.cuda.is_available():
        device = next(model.parameters()).device if hasattr(model, "parameters") else None
        if device and device.type != "cuda":
            logger.info(f"[VRAM] Swapping {name} back to CUDA.")
            model.to("cuda")

    if name in _IDLE_GUARDS:
        _IDLE_GUARDS[name].touch()

    return model


def get_musetalk():
    return get_model("musetalk")

