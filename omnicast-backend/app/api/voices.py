"""
voices.py  —  /voices  router
------------------------------
Supabase-only persistence for user voice library.
"""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
import uuid
import json
from datetime import datetime

from app.core.security import get_current_user
from app.core.logger import get_logger
from app.core.supabase import get_supabase
from app.services.model_manager import get_model
from app.services.audio_engine import (
    trim_audio_to_limit,
    load_audio_to_file,
    extract_speaker_embedding,
    cache_speaker_embedding,
)

router = APIRouter(prefix="/voices", tags=["Library"])
logger = get_logger(__name__)

_ALLOWED_MIME = {
    "audio/wav",
    "audio/mpeg",
    "audio/ogg",
    "audio/flac",
    "audio/x-wav",
    "audio/webm",
    "audio/x-matroska",
    "audio/mp3",
}
_MAX_BYTES = 10 * 1024 * 1024
_BUCKET = "reference-audio"


def _normalize_mime(mime: str | None) -> str:
    if not mime:
        return ""
    return mime.split(";")[0].strip().lower()


class SaveVoiceRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    voice_type: str = Field(..., pattern="^(designed|cloned)$")
    metadata: dict = Field(default_factory=dict)


def _require_supabase():
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase client not configured",
        )
    return supabase


def _ensure_reference_bucket(supabase) -> None:
    try:
        buckets = supabase.storage.list_buckets()
        exists = False
        for bucket in buckets:
            if isinstance(bucket, dict) and bucket.get("name") == _BUCKET:
                exists = True
            elif getattr(bucket, "name", None) == _BUCKET:
                exists = True
        if not exists:
            supabase.storage.create_bucket(_BUCKET, public=False)
            logger.info(f"[LIBRARY] Created storage bucket '{_BUCKET}'.")
    except Exception as exc:
        logger.warning(f"[LIBRARY] Bucket check failed: {exc}")


@router.post("/save")
async def save_voice(
    body: SaveVoiceRequest,
    user: dict = Depends(get_current_user),
):
    if body.voice_type == "cloned":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use /voices/clone for cloned voices (requires reference audio).",
        )

    user_id = user["user_id"]
    logger.info(f"[LIBRARY] Saving voice '{body.name}' for user_id={user_id}")

    supabase = _require_supabase()

    new_voice = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "name": body.name,
        "type": body.voice_type,
        "created_at": datetime.utcnow().isoformat(),
        "metadata": body.metadata,
    }

    try:
        supabase.table("voices").insert(new_voice).execute()
        logger.info(f"[LIBRARY] ✓ Voice '{body.name}' saved to Supabase.")
        return {"status": "success", "voice_id": new_voice["id"]}
    except Exception as exc:
        logger.error(f"[LIBRARY] Supabase insert failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase insert failed",
        )


@router.post("/clone")
async def create_cloned_voice(
    voice_name: str = Form(..., min_length=1, max_length=100),
    reference_audio: UploadFile = File(..., description="WAV / MP3 reference sample"),
    metadata: str | None = Form(None, description="JSON string of voice metadata"),
    user: dict = Depends(get_current_user),
):
    user_id = user["user_id"]
    logger.info(f"[LIBRARY] Cloning voice '{voice_name}' for user_id={user_id}")

    normalized_mime = _normalize_mime(reference_audio.content_type)
    if normalized_mime not in _ALLOWED_MIME:
        raise HTTPException(
            status_code=400, detail=f"Invalid MIME type: {reference_audio.content_type}"
        )

    raw_bytes = await reference_audio.read()
    if len(raw_bytes) > _MAX_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    trimmed_bytes = trim_audio_to_limit(raw_bytes, limit_seconds=10.0)
    voice_id = str(uuid.uuid4())

    supabase = _require_supabase()
    _ensure_reference_bucket(supabase)

    # Extract and cache speaker embedding once
    tmp_path = load_audio_to_file(trimmed_bytes)
    try:
        model = get_model()
        embedding = extract_speaker_embedding(model, tmp_path)
        cache_speaker_embedding(voice_id, embedding)
    finally:
        try:
            import os

            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass

    # Upload to Supabase Storage
    storage_path = f"{user_id}/{voice_id}.wav"
    try:
        supabase.storage.from_(_BUCKET).upload(
            storage_path,
            trimmed_bytes,
            {"content-type": "audio/wav", "upsert": "true"},
        )
        file_url = supabase.storage.from_(_BUCKET).get_public_url(storage_path)
    except Exception as exc:
        logger.error(f"[LIBRARY] Storage upload failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload reference audio",
        )

    # Insert metadata in Supabase table
    meta: dict = {}
    if metadata:
        try:
            meta = json.loads(metadata)
        except Exception:
            raise HTTPException(status_code=400, detail="metadata must be valid JSON")
    meta["storage_path"] = storage_path

    new_voice = {
        "id": voice_id,
        "user_id": user_id,
        "name": voice_name,
        "type": "cloned",
        "file_url": file_url,
        "created_at": datetime.utcnow().isoformat(),
        "metadata": meta,
    }

    try:
        supabase.table("voices").insert(new_voice).execute()
        logger.info(f"[LIBRARY] ✓ Voice '{voice_name}' saved to Supabase.")
    except Exception as exc:
        logger.error(f"[LIBRARY] Supabase insert failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase insert failed",
        )

    return {"status": "success", "voice_id": voice_id, "file_url": file_url}


@router.get("")
async def list_voices(
    user: dict = Depends(get_current_user),
):
    user_id = user["user_id"]
    supabase = _require_supabase()

    try:
        res = (
            supabase.table("voices")
            .select("id,name,type,file_url,created_at,metadata")
            .eq("user_id", user_id)
            .execute()
        )
        return res.data
    except Exception as exc:
        logger.error(f"[LIBRARY] Supabase fetch failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase fetch failed",
        )


class UpdateVoiceRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


@router.patch("/{voice_id}")
async def update_voice(
    voice_id: str,
    body: UpdateVoiceRequest,
    user: dict = Depends(get_current_user),
):
    user_id = user["user_id"]
    supabase = _require_supabase()

    try:
        res = (
            supabase.table("voices")
            .update({"name": body.name})
            .eq("id", voice_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Voice not found or not owned by user"
            )
        return {"status": "success", "voice_id": voice_id, "new_name": body.name}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[LIBRARY] Supabase update failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase update failed",
        )


@router.delete("/{voice_id}")
async def delete_voice(
    voice_id: str,
    user: dict = Depends(get_current_user),
):
    user_id = user["user_id"]
    supabase = _require_supabase()

    try:
        res = (
            supabase.table("voices")
            .select("id,metadata")
            .eq("id", voice_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        voice = res.data
    except Exception as exc:
        logger.error(f"[LIBRARY] Supabase fetch failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase fetch failed",
        )

    if not voice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Voice not found"
        )

    storage_path = None
    if isinstance(voice, dict):
        metadata = voice.get("metadata")
        if isinstance(metadata, dict):
            storage_path = metadata.get("storage_path")

    storage_deleted: bool | None = None
    if storage_path:
        try:
            supabase.storage.from_(_BUCKET).remove([storage_path])
            storage_deleted = True
            logger.info(f"[LIBRARY] ✓ Reference audio removed: {storage_path}")
        except Exception as exc:
            storage_deleted = False
            logger.warning(f"[LIBRARY] Failed to remove reference audio: {exc}")

    try:
        supabase.table("voices").delete().eq("id", voice_id).eq(
            "user_id", user_id
        ).execute()
        logger.info(f"[LIBRARY] ✓ Voice deleted voice_id={voice_id} user_id={user_id}")
    except Exception as exc:
        logger.error(f"[LIBRARY] Supabase delete failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase delete failed",
        )

    return {
        "status": "success",
        "voice_id": voice_id,
        "storage_deleted": storage_deleted,
    }
