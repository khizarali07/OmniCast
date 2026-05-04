"""
active_call.py  —  /active_call router
--------------------------------------
Continuous call pipeline: Groq ASR + transcript logging + LLM + OmniVoice TTS.
"""

import gc
import io
import json
import os

import torch
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from groq import Groq

from app.core.config import get_settings
from app.core.logger import get_logger
from app.core.security import get_current_user
from app.core.supabase import get_supabase
from app.services.audio_engine import (
    cache_speaker_embedding,
    extract_speaker_embedding,
    generate_with_voice_embedding,
    get_cached_speaker_embedding,
    load_audio_to_file,
    tensor_to_wav_bytes,
)
from app.services.model_manager import get_model

router = APIRouter(prefix="/active_call", tags=["Active Call"])
logger = get_logger(__name__)
settings = get_settings()

_BUCKET = "reference-audio"
_ALLOWED_MIME = {
    "audio/wav",
    "audio/mpeg",
    "audio/ogg",
    "audio/webm",
    "audio/mp3",
    "audio/x-wav",
}
_MAX_BYTES = 10 * 1024 * 1024


def _normalize_mime(mime: str | None) -> str:
    if not mime:
        return ""
    return mime.split(";")[0].strip().lower()


def _require_supabase():
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase client not configured",
        )
    return supabase


def _hard_clear_cache() -> None:
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def _resolve_storage_path(record: dict, user_id: str, voice_id: str) -> str:
    meta = record.get("metadata") or {}
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except Exception:
            meta = {}
    storage_path = meta.get("storage_path")
    if storage_path:
        return storage_path
    return f"{user_id}/{voice_id}.wav"


def _get_call_or_404(supabase, call_id: str, user_id: str) -> dict:
    try:
        res = (
            supabase.table("calls")
            .select("id,user_id,voice_id")
            .eq("id", call_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Call not found"
            )
        return res.data
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[CALL] Supabase call lookup failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase call lookup failed",
        )


def _insert_transcript(supabase, call_id: str, role: str, message: str) -> None:
    try:
        supabase.table("transcripts").insert(
            {"call_id": call_id, "role": role, "message": message}
        ).execute()
    except Exception as exc:
        logger.error(f"[CALL] Transcript insert failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Transcript insert failed",
        )


def _fetch_recent_messages(supabase, call_id: str, limit: int = 50) -> list[dict]:
    try:
        res = (
            supabase.table("transcripts")
            .select("role,message,created_at")
            .eq("call_id", call_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        items = res.data or []
        items.reverse()
        return items
    except Exception as exc:
        logger.error(f"[CALL] Transcript fetch failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Transcript fetch failed",
        )


def _load_voice_embedding(
    supabase,
    voice_id: str,
    user_id: str,
):
    embedding = get_cached_speaker_embedding(voice_id)
    if embedding is not None:
        return embedding

    res = (
        supabase.table("voices")
        .select("id,user_id,metadata")
        .eq("id", voice_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Voice not found")

    record = res.data[0]
    storage_path = _resolve_storage_path(record, user_id, voice_id)

    try:
        ref_bytes = supabase.storage.from_(_BUCKET).download(storage_path)
    except Exception as exc:
        logger.error(f"[CALL] Storage download failed: {exc}")
        raise HTTPException(
            status_code=500, detail="Failed to download reference audio"
        )

    tmp_path = load_audio_to_file(ref_bytes)
    try:
        model = get_model()
        embedding = extract_speaker_embedding(model, tmp_path)
        cache_speaker_embedding(voice_id, embedding)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    return embedding


@router.post("")
async def active_call(
    call_id: str = Form(...),
    voice_id: str = Form(...),
    user_audio: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    if not settings.groq_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GROQ_API_KEY not configured",
        )

    normalized_mime = _normalize_mime(user_audio.content_type)
    if normalized_mime not in _ALLOWED_MIME:
        raise HTTPException(
            status_code=400, detail=f"Invalid MIME type: {user_audio.content_type}"
        )

    audio_bytes = await user_audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio upload")
    if len(audio_bytes) > _MAX_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    supabase = _require_supabase()
    call_record = _get_call_or_404(supabase, call_id, user["user_id"])

    if call_record.get("voice_id") and call_record.get("voice_id") != voice_id:
        raise HTTPException(
            status_code=400, detail="voice_id does not match active call"
        )

    client = Groq(api_key=settings.groq_api_key)

    # Step A: Whisper transcription
    logger.info("[CALL] Transcribing audio via Groq Whisper...")
    transcription = client.audio.transcriptions.create(
        file=("user_audio.wav", audio_bytes),
        model="whisper-large-v3",
    )
    transcript_text = getattr(transcription, "text", None) or ""
    transcript_text = transcript_text.strip()

    if not transcript_text:
        raise HTTPException(status_code=400, detail="Transcription returned empty text")

    # Step B: Log user transcript
    _insert_transcript(supabase, call_id, "user", transcript_text)

    # Step C: LLM response with recent call context
    logger.info("[CALL] Generating assistant reply via Groq LLM...")
    system_prompt = (
        "You are a concise, helpful voice assistant. "
        "Use the conversation history to remember names and prior details. "
        "Keep answers brief (1-3 sentences) for spoken dialogue."
    )
    history = _fetch_recent_messages(supabase, call_id, limit=50)
    messages = [{"role": "system", "content": system_prompt}]
    for item in history:
        role = item.get("role")
        content = item.get("message")
        if role in {"user", "assistant"} and content:
            messages.append({"role": role, "content": content})

    completion = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=messages,
        temperature=0.2,
    )
    reply_text = completion.choices[0].message.content.strip()

    if not reply_text:
        raise HTTPException(status_code=500, detail="LLM returned empty response")

    # Step D: Log assistant transcript
    _insert_transcript(supabase, call_id, "assistant", reply_text)

    # Step E: TTS (OmniVoice) with strict VRAM cleanup
    model = get_model()
    embedding = _load_voice_embedding(supabase, voice_id, user["user_id"])

    _hard_clear_cache()
    audio_array = generate_with_voice_embedding(
        model,
        reply_text,
        embedding,
        speed=1.0,
        language="English",
    )
    _hard_clear_cache()

    if isinstance(audio_array, torch.Tensor):
        waveform = audio_array.float()
    else:
        waveform = torch.from_numpy(audio_array).float()
    if waveform.ndim == 1:
        waveform = waveform.unsqueeze(0)

    wav_bytes = tensor_to_wav_bytes(waveform, 24000)
    return StreamingResponse(io.BytesIO(wav_bytes), media_type="audio/wav")
