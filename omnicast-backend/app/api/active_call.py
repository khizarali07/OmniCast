"""
active_call.py  —  /active_call router
--------------------------------------
Continuous call pipeline: Groq ASR + transcript logging + LLM + OmniVoice TTS.
"""

import gc
import io
import json
import os
import base64

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


def _parse_metadata(record: dict) -> dict:
    meta = record.get("metadata") or {}
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except Exception:
            meta = {}
    return meta if isinstance(meta, dict) else {}


def _sanitize_speed(value: object) -> float:
    try:
        speed = float(value)
    except Exception:
        return 1.0
    return min(2.0, max(0.5, speed))


def _build_instruct(meta: dict) -> str:
    instruct_items: list[str] = []

    gender = meta.get("gender")
    if gender in ["male", "female"]:
        instruct_items.append(gender)

    age = meta.get("age")
    if age:
        instruct_items.append(age)

    style = meta.get("style")
    style_active = False
    if style == "whisper":
        instruct_items.append("whisper")
        style_active = True
    elif style == "energetic":
        instruct_items.append("high pitch")
        style_active = True
    elif style == "soft":
        instruct_items.append("low pitch")
        style_active = True

    accent = meta.get("accent")
    if accent and "american" not in accent:
        instruct_items.append(accent)
    elif accent and not style_active:
        instruct_items.append(accent)

    pitch = meta.get("pitch")
    if pitch and "moderate" not in pitch and not style_active:
        instruct_items.append(pitch)

    return ", ".join(instruct_items)


def _get_voice_record(supabase, voice_id: str, user_id: str) -> dict:
    try:
        res = (
            supabase.table("voices")
            .select("id,user_id,metadata,type")
            .eq("id", voice_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=404, detail="Voice not found")
        return res.data
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[CALL] Supabase voice lookup failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase voice lookup failed",
        )


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

    # FETCH HISTORY BEFORE THE CURRENT MESSAGE OR JUST FETCH ALL
    # To be safe, we fetch the last 50 and ensure our current message is included or appended.
    history = _fetch_recent_messages(supabase, call_id, limit=50)

    system_prompt = (
        "You are a helpful, friendly, and concise voice assistant. "
        "CRITICAL: You MUST remember the user's name and any details they share with you. "
        "Refer to the conversation history to stay in context. "
        "Keep answers brief (1-3 sentences) for natural spoken dialogue."
    )

    messages = [{"role": "system", "content": system_prompt}]

    # Build history list
    for item in history:
        role = item.get("role")
        content = item.get("message")
        if role in {"user", "assistant"} and content:
            messages.append({"role": role, "content": content})

    # Ensure the CURRENT message is the last user message in the list
    # (If Supabase was fast, it's already there; if not, we append it if it's missing)
    if not messages or messages[-1].get("content") != transcript_text:
        messages.append({"role": "user", "content": transcript_text})

    completion = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=messages,
        temperature=0.4,  # Slightly higher temperature for more natural flow
    )
    reply_text = completion.choices[0].message.content.strip()

    if not reply_text:
        raise HTTPException(status_code=500, detail="LLM returned empty response")

    # Step D: Log assistant transcript
    _insert_transcript(supabase, call_id, "assistant", reply_text)

    # Step E: TTS (OmniVoice) with strict VRAM cleanup
    model = get_model()
    voice_record = _get_voice_record(supabase, voice_id, user["user_id"])
    metadata = _parse_metadata(voice_record)
    voice_type = voice_record.get("type")

    if voice_type == "cloned":
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
    else:
        instruct = _build_instruct(metadata)
        speed = _sanitize_speed(metadata.get("speed", 1.0))

        _hard_clear_cache()
        audio_list = model.generate(
            text=reply_text,
            language="English",
            instruct=instruct if instruct else None,
            speed=speed,
            postprocess_output=False,
        )
        _hard_clear_cache()

        if not audio_list:
            raise HTTPException(
                status_code=500, detail="Model returned empty audio list"
            )

        waveform = torch.from_numpy(audio_list[0]).float()
        if waveform.ndim == 1:
            waveform = waveform.unsqueeze(0)

    wav_bytes = tensor_to_wav_bytes(waveform, 24000)

    # Prepare headers with base64 encoded transcripts for the frontend
    headers = {
        "X-User-Transcript": base64.b64encode(transcript_text.encode("utf-8")).decode(
            "utf-8"
        ),
        "X-Assistant-Reply": base64.b64encode(reply_text.encode("utf-8")).decode(
            "utf-8"
        ),
        "Access-Control-Expose-Headers": "X-User-Transcript, X-Assistant-Reply",
    }

    return StreamingResponse(
        io.BytesIO(wav_bytes), media_type="audio/wav", headers=headers
    )
