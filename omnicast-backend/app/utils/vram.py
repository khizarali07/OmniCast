import gc
import time
import threading
import functools
import torch
from app.core.logger import get_logger
from app.core.config import get_settings

logger = get_logger(__name__)
settings = get_settings()


def log_vram(tag: str = "") -> None:
    """Log current VRAM usage to the console."""
    if not torch.cuda.is_available():
        return
    allocated = torch.cuda.memory_allocated() / 1024 ** 3
    reserved  = torch.cuda.memory_reserved()  / 1024 ** 3
    logger.info(
        f"[VRAM{' ' + tag if tag else ''}] "
        f"Allocated: {allocated:.2f} GB | Reserved: {reserved:.2f} GB"
    )


def clear_cache() -> None:
    """Force Python GC and empty the CUDA memory cache."""
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    logger.debug("[VRAM] Cache cleared.")


def vram_managed(func):
    """
    Decorator that clears VRAM cache before and after every inference call.
    Drop it on any function that runs model inference.
    """
    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        log_vram("PRE ")
        clear_cache()
        try:
            result = await func(*args, **kwargs)
        finally:
            clear_cache()
            log_vram("POST")
        return result
    return wrapper


class IdleGuard:
    """
    Monitors a model object and moves it to CPU when idle for longer than
    `timeout_seconds`.  Call `touch()` on every inference to reset the timer.
    """

    def __init__(self, get_model_fn, timeout_seconds: int | None = None):
        self._get_model = get_model_fn
        self._timeout   = timeout_seconds or settings.vram_idle_timeout_seconds
        self._last_used = time.monotonic()
        self._lock      = threading.Lock()
        self._thread    = threading.Thread(target=self._watch, daemon=True)
        self._thread.start()
        logger.info(
            f"[VRAM] IdleGuard started (timeout={self._timeout}s)."
        )

    def touch(self) -> None:
        with self._lock:
            self._last_used = time.monotonic()

    def _watch(self) -> None:
        while True:
            time.sleep(30)  # check every 30 s
            with self._lock:
                idle_for = time.monotonic() - self._last_used
            if idle_for >= self._timeout:
                self._offload()

    def _offload(self) -> None:
        model = self._get_model()
        if model is None:
            return
        try:
            # Support custom engine objects with unload() (e.g. MuseTalkEngine)
            if hasattr(model, 'unload'):
                model.unload()
                clear_cache()
                log_vram("AFTER OFFLOAD")
                return
            # Fallback for standard nn.Module objects
            device = next(model.parameters()).device
            if device.type == "cuda":
                logger.warning("[VRAM] Model idle — offloading to CPU to free VRAM.")
                model.to("cpu")
                clear_cache()
                log_vram("AFTER OFFLOAD")
        except StopIteration:
            pass  # model has no parameters

    def reload_to_gpu(self, model) -> None:
        """Call this before inference to move the model back to CUDA."""
        try:
            # Support custom engine objects with load() (e.g. MuseTalkEngine)
            if hasattr(model, 'load'):
                model.load()
                log_vram("AFTER RELOAD")
                return
            device = next(model.parameters()).device
            if device.type != "cuda" and torch.cuda.is_available():
                logger.info("[VRAM] Reloading model to CUDA for inference.")
                model.to("cuda")
                log_vram("AFTER RELOAD")
        except StopIteration:
            pass

