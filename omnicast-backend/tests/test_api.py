"""
tests/test_api.py
-----------------
Pytest suite that mocks Supabase auth and exercises /generate and /clone.

Run with:
    pytest tests/ -v
"""

from __future__ import annotations

import io
import wave
import struct
from unittest.mock import AsyncMock, patch, MagicMock

import pytest
from httpx import AsyncClient, ASGITransport

from main import app
from app.core.security import get_current_user

# ── mock user injected into every protected endpoint ──────────────────────────
_MOCK_USER = {"id": "test-user-uuid-1234", "email": "test@omnicast.ai"}


def _override_auth():
    return _MOCK_USER


# ── minimal 1-second silent WAV bytes ─────────────────────────────────────────
def _silent_wav(sample_rate: int = 24000, duration_s: float = 0.5) -> bytes:
    n_samples = int(sample_rate * duration_s)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)         # 16-bit
        wf.setframerate(sample_rate)
        wf.writeframes(struct.pack(f"<{n_samples}h", *([0] * n_samples)))
    buf.seek(0)
    return buf.read()


# ── fixtures ──────────────────────────────────────────────────────────────────
@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    app.dependency_overrides[get_current_user] = _override_auth
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


# ── health ────────────────────────────────────────────────────────────────────
@pytest.mark.anyio
async def test_health(client: AsyncClient):
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "cuda" in data


# ── /tts/generate ─────────────────────────────────────────────────────────────
@pytest.mark.anyio
async def test_generate_returns_wav(client: AsyncClient):
    payload = {"text": "Hello from OmniCast!", "speed": 1.0}
    resp = await client.post("/api/v1/tts/generate", json=payload)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/wav"
    # WAV magic bytes: RIFF....WAVE
    assert resp.content[:4] == b"RIFF"
    assert resp.content[8:12] == b"WAVE"


@pytest.mark.anyio
async def test_generate_rejects_empty_text(client: AsyncClient):
    resp = await client.post("/api/v1/tts/generate", json={"text": ""})
    assert resp.status_code == 422   # FastAPI validation error


@pytest.mark.anyio
async def test_generate_rejects_unauthenticated():
    """No override — should get 403 (no credentials) from HTTPBearer."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        resp = await ac.post(
            "/api/v1/tts/generate", json={"text": "Hello"}
        )
    assert resp.status_code == 403


# ── /clone/voice ──────────────────────────────────────────────────────────────
@pytest.mark.anyio
async def test_clone_returns_wav(client: AsyncClient):
    wav_data = _silent_wav()
    resp = await client.post(
        "/api/v1/clone/voice",
        data={"text": "Clone this voice!", "speed": "1.0"},
        files={"reference_audio": ("ref.wav", wav_data, "audio/wav")},
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/wav"
    assert resp.content[:4] == b"RIFF"


@pytest.mark.anyio
async def test_clone_rejects_bad_mime(client: AsyncClient):
    resp = await client.post(
        "/api/v1/clone/voice",
        data={"text": "Test", "speed": "1.0"},
        files={"reference_audio": ("file.txt", b"not audio", "text/plain")},
    )
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_clone_rejects_unauthenticated():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        wav_data = _silent_wav()
        resp = await ac.post(
            "/api/v1/clone/voice",
            data={"text": "Test", "speed": "1.0"},
            files={"reference_audio": ("ref.wav", wav_data, "audio/wav")},
        )
    assert resp.status_code == 403
