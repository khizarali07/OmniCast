"""
main.py  —  OmniCast FastAPI entry point
"""

from __future__ import annotations

from contextlib import asynccontextmanager

import torch
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import tts, clone, voices, converse, active_call
from app.core.config import get_settings
from app.core.logger import get_logger
from app.services.model_manager import load_model
from app.utils.vram import log_vram

logger = get_logger("omnicast")
settings = get_settings()


# ── startup / shutdown ────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("=" * 60)
    logger.info("  OmniCast API  —  starting up")
    logger.info(f"  CUDA available : {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        logger.info(f"  GPU            : {torch.cuda.get_device_name(0)}")
    logger.info("=" * 60)

    # Pre-load model at startup so the first request is fast
    load_model()
    log_vram("STARTUP")

    yield  # ── server is running ─────────────────────────────────────────────

    logger.info("[SHUTDOWN] OmniCast API shutting down — releasing VRAM.")
    log_vram("SHUTDOWN")


# ── app factory ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="OmniCast API",
    description="High-performance AI Voice synthesis & cloning backend.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — tighten in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=(
        ["http://localhost:3000", "http://127.0.0.1:3000"]
        if settings.environment == "development"
        else ["https://yourproductiondomain.com"]
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── routers ───────────────────────────────────────────────────────────────────
app.include_router(tts.router, prefix="/api/v1")
app.include_router(clone.router, prefix="/api/v1")
app.include_router(voices.router, prefix="/api/v1")
app.include_router(converse.router, prefix="/api/v1")
app.include_router(active_call.router, prefix="/api/v1")


@app.get("/health", tags=["Health"])
async def health():
    cuda = torch.cuda.is_available()
    return {
        "status": "ok",
        "cuda": cuda,
        "gpu": torch.cuda.get_device_name(0) if cuda else None,
        "vram_gb": round(torch.cuda.memory_allocated() / 1024**3, 2) if cuda else 0,
    }


# ── dev runner ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.environment == "development",
        log_level="info",
    )
