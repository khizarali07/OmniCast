"""
audio_engine.py
---------------
Post-processes raw model output tensors into standardised WAV bytes.
"""

import io
import os
import tempfile
import inspect
from threading import Lock
from typing import Any

import torch
import soundfile as sf
import numpy as np
from app.core.config import get_settings
from app.core.logger import get_logger

logger = get_logger(__name__)
settings = get_settings()

TARGET_SR = settings.sample_rate  # 24 000 Hz
TARGET_CHANNELS = 1  # mono

# In-memory cache for speaker embeddings keyed by voice_id
_VOICE_EMBED_CACHE: dict[str, Any] = {}
_VOICE_CACHE_LOCK = Lock()


def cache_speaker_embedding(voice_id: str, embedding: Any) -> None:
    with _VOICE_CACHE_LOCK:
        _VOICE_EMBED_CACHE[voice_id] = embedding


def get_cached_speaker_embedding(voice_id: str) -> Any | None:
    with _VOICE_CACHE_LOCK:
        return _VOICE_EMBED_CACHE.get(voice_id)


def _select_param(sig: inspect.Signature, candidates: list[str]) -> str | None:
    for name in candidates:
        if name in sig.parameters:
            return name
    return None


def _supports_kwarg(sig: inspect.Signature, name: str) -> bool:
    if name in sig.parameters:
        return True
    return any(
        param.kind == inspect.Parameter.VAR_KEYWORD for param in sig.parameters.values()
    )


def _set_deterministic_seed(seed: int) -> None:
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    np.random.seed(seed)


def extract_speaker_embedding(
    model: Any,
    ref_audio_path: str,
    ref_text: str | None = None,
) -> Any:
    """
    Extract a speaker embedding once and reuse it for deterministic generation.
    Uses best-effort method discovery to support multiple OmniVoice versions.
    """
    create_prompt = getattr(model, "create_voice_clone_prompt", None)
    if callable(create_prompt):
        try:
            return create_prompt(ref_audio_path, ref_text=ref_text)
        except ValueError as exc:
            if "Reference audio is empty" in str(exc):
                try:
                    return create_prompt(
                        ref_audio_path,
                        ref_text=ref_text,
                        preprocess_prompt=False,
                    )
                except TypeError:
                    return create_prompt(ref_audio_path)
            raise
        except TypeError:
            return create_prompt(ref_audio_path)

    candidate_methods = [
        "extract_speaker_embedding",
        "get_speaker_embedding",
        "extract_spk_embedding",
        "get_spk_embedding",
        "encode_speaker",
        "encode_speaker_embedding",
        "speaker_embedding",
    ]

    for method_name in candidate_methods:
        fn = getattr(model, method_name, None)
        if not callable(fn):
            continue

        sig = inspect.signature(fn)
        kwargs: dict[str, Any] = {}
        audio_param = _select_param(
            sig,
            ["ref_audio", "ref_audio_path", "audio", "audio_path", "wav_path", "path"],
        )
        if audio_param:
            kwargs[audio_param] = ref_audio_path

        text_param = _select_param(sig, ["ref_text", "text", "prompt"])
        if text_param and ref_text is not None:
            kwargs[text_param] = ref_text

        return fn(**kwargs)

    raise RuntimeError("OmniVoice speaker embedding API not found.")


def generate_with_voice_embedding(
    model: Any,
    text: str,
    voice_embedding: Any,
    *,
    speed: float = 1.0,
    language: str | None = "English",
    instruct: str | None = None,
    seed: int = 1337,
    temperature: float = 0.15,
) -> Any:
    """
    Generate speech using a cached speaker embedding for stable voice output.
    """
    _set_deterministic_seed(seed)

    sig = inspect.signature(model.generate)
    kwargs: dict[str, Any] = {}

    if "text" in sig.parameters:
        kwargs["text"] = text
    if "language" in sig.parameters and language:
        kwargs["language"] = language
    if "speed" in sig.parameters:
        kwargs["speed"] = speed
    if "instruct" in sig.parameters and instruct:
        kwargs["instruct"] = instruct
    if "postprocess_output" in sig.parameters:
        kwargs["postprocess_output"] = False

    prompt_param = _select_param(
        sig, ["voice_clone_prompt", "voice_prompt", "clone_prompt"]
    )
    if prompt_param:
        kwargs[prompt_param] = voice_embedding
        if _supports_kwarg(sig, "class_temperature"):
            kwargs["class_temperature"] = 0.0
    else:
        embed_param = _select_param(
            sig,
            [
                "speaker_embedding",
                "speaker_emb",
                "spk_emb",
                "spk_embedding",
                "speaker_latent",
                "speaker",
            ],
        )
        if embed_param is None:
            raise RuntimeError(
                "Model generate() does not accept a voice prompt or speaker embedding parameter."
            )
        kwargs[embed_param] = voice_embedding

    if "temperature" in sig.parameters:
        kwargs["temperature"] = temperature
    if "top_p" in sig.parameters:
        kwargs["top_p"] = 0.9
    if "seed" in sig.parameters:
        kwargs["seed"] = seed

    result = model.generate(**kwargs)
    if isinstance(result, (list, tuple)):
        return result[0]
    return result


def _to_mono(waveform: torch.Tensor) -> torch.Tensor:
    """Collapse any multi-channel tensor to mono by averaging channels."""
    if waveform.ndim == 1:
        waveform = waveform.unsqueeze(0)  # (T,) → (1, T)
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)
    return waveform  # shape: (1, T)


def _resample(waveform: torch.Tensor, orig_sr: int) -> torch.Tensor:
    """Resample to TARGET_SR if needed."""
    if orig_sr == TARGET_SR:
        return waveform
    try:
        import torchaudio

        resampler = torchaudio.transforms.Resample(
            orig_freq=orig_sr, new_freq=TARGET_SR
        )
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

    # ── Normalisation with Noise-Floor Safeguard ──────────────────────────
    # If the model produces absolute silence or tiny numerical noise (e.g. < -40dB),
    # we do NOT amplify it. This prevents the "loud static" effect.
    peak = torch.abs(waveform).max().item()
    if peak > 0.01:
        waveform = waveform / peak * 0.7  # Normalize to -3dB
    else:
        logger.warning(f"[AUDIO] Peak too low ({peak:.6f}), preserving raw signal.")

    waveform = torch.clamp(waveform, -1.0, 1.0)

    data = waveform.t().numpy()
    buf = io.BytesIO()
    sf.write(buf, data, TARGET_SR, format="WAV", subtype="PCM_16")
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
        logger.debug(
            f"[AUDIO] Loaded audio via librosa path — {sr} Hz, {waveform.shape}"
        )
        return waveform, sr
    except Exception as e:
        logger.warning(f"[AUDIO] librosa load failed: {e}. Falling back to soundfile.")
        try:
            data, sr = sf.read(tmp_path, dtype="float32")
            waveform = torch.from_numpy(data).t()
            if waveform.ndim == 1:
                waveform = waveform.unsqueeze(0)
            waveform = _to_mono(waveform)
            return waveform, sr
        except Exception as sf_e:
            logger.error(f"[AUDIO] All load methods failed: {sf_e}")
            raise
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except:
                pass


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
        sf.write(buf, data, sr, format="WAV")
        buf.seek(0)
        return buf.read()
    except Exception as e:
        logger.warning(f"[AUDIO] Trimming failed: {e}. Returning original.")
        return file_bytes
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except:
                pass
