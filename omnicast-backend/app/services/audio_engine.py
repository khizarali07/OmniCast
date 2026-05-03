"""
audio_engine.py
---------------
Post-processes raw model output tensors into standardised WAV bytes.
"""

import io
import os
import tempfile
import torch
import soundfile as sf
import numpy as np
from app.core.config import get_settings
from app.core.logger import get_logger

logger   = get_logger(__name__)
settings = get_settings()

TARGET_SR       = settings.sample_rate      # 24 000 Hz
TARGET_CHANNELS = 1                          # mono


def _to_mono(waveform: torch.Tensor) -> torch.Tensor:
    """Collapse any multi-channel tensor to mono by averaging channels."""
    if waveform.ndim == 1:
        waveform = waveform.unsqueeze(0)   # (T,) → (1, T)
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)
    return waveform                         # shape: (1, T)


def _resample(waveform: torch.Tensor, orig_sr: int) -> torch.Tensor:
    """Resample to TARGET_SR if needed."""
    if orig_sr == TARGET_SR:
        return waveform
    try:
        import torchaudio
        resampler = torchaudio.transforms.Resample(orig_freq=orig_sr, new_freq=TARGET_SR)
        return resampler(waveform)
    except Exception:
        logger.warning("[AUDIO] torchaudio resampling failed, using naive slicing")
        return waveform


def tensor_to_wav_bytes(
    waveform: torch.Tensor,
    sample_rate: int,
) -> bytes:
    """
    Convert a raw inference waveform tensor to in-memory WAV bytes.
    """
    waveform = waveform.detach().cpu().float()
    waveform = _to_mono(waveform)
    waveform = _resample(waveform, orig_sr=sample_rate)
    waveform = torch.clamp(waveform, -1.0, 1.0)
    
    data = waveform.t().numpy()
    buf = io.BytesIO()
    sf.write(buf, data, TARGET_SR, format='WAV', subtype='PCM_16')
    buf.seek(0)
    raw = buf.read()
    return raw


def load_audio_to_file(file_bytes: bytes) -> str:
    """
    Save bytes to a temporary file and return the path.
    Useful for libraries that require a physical file path (like ffmpeg/librosa for webm).
    """
    # Use a unique suffix based on the actual header if possible, or just .tmp
    with tempfile.NamedTemporaryFile(delete=False, suffix=".audio_tmp") as tmp:
        tmp.write(file_bytes)
        return tmp.name


def load_wav_tensor(file_bytes: bytes) -> tuple[torch.Tensor, int]:
    """
    Load an uploaded audio file into a float32 tensor.
    Uses a temporary file to ensure broad format support (webm, mp3, etc).
    """
    tmp_path = load_audio_to_file(file_bytes)
    try:
        import librosa
        # librosa.load with a path is much more robust for webm/mp3
        data, sr = librosa.load(tmp_path, sr=None, mono=True)
        waveform = torch.from_numpy(data).unsqueeze(0)
        logger.debug(f"[AUDIO] Loaded audio via librosa path — {sr} Hz, {waveform.shape}")
        return waveform, sr
    except Exception as e:
        logger.warning(f"[AUDIO] librosa load failed: {e}. Falling back to soundfile.")
        try:
            data, sr = sf.read(tmp_path, dtype='float32')
            waveform = torch.from_numpy(data).t()
            if waveform.ndim == 1: waveform = waveform.unsqueeze(0)
            waveform = _to_mono(waveform)
            return waveform, sr
        except Exception as sf_e:
            logger.error(f"[AUDIO] All load methods failed: {sf_e}")
            raise
    finally:
        if os.path.exists(tmp_path):
            try: os.remove(tmp_path)
            except: pass
def trim_audio_to_limit(file_bytes: bytes, limit_seconds: float = 10.0) -> bytes:
    """
    Trims the beginning of the audio to the first N seconds.
    This is recommended by the model for better cloning quality and memory efficiency.
    """
    tmp_path = load_audio_to_file(file_bytes)
    try:
        import librosa
        import soundfile as sf
        # Load only the first N seconds
        data, sr = librosa.load(tmp_path, sr=None, duration=limit_seconds)
        
        # Save back to bytes
        buf = io.BytesIO()
        sf.write(buf, data, sr, format='WAV')
        buf.seek(0)
        return buf.read()
    except Exception as e:
        logger.warning(f"[AUDIO] Trimming failed: {e}. Returning original.")
        return file_bytes
    finally:
        if os.path.exists(tmp_path):
            try: os.remove(tmp_path)
            except: pass
