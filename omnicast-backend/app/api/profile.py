"""
profile.py  —  /profile  router
--------------------------------
User profile and account settings management.
"""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
import bcrypt

from app.core.security import get_current_user
from app.core.logger import get_logger
from app.core.supabase import get_supabase

router = APIRouter(prefix="/profile", tags=["Profile"])
logger = get_logger(__name__)

_AVATAR_BUCKET = "avatars"
_ALLOWED_IMAGE_MIME = {"image/jpeg", "image/png", "image/webp"}
_MAX_BYTES = 2 * 1024 * 1024  # 2MB


def _require_supabase():
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase client not configured",
        )
    return supabase


def _ensure_avatar_bucket(supabase) -> None:
    try:
        buckets = supabase.storage.list_buckets()
        exists = False
        for bucket in buckets:
            if isinstance(bucket, dict) and bucket.get("name") == _AVATAR_BUCKET:
                exists = True
            elif getattr(bucket, "name", None) == _AVATAR_BUCKET:
                exists = True
        if not exists:
            supabase.storage.create_bucket(_AVATAR_BUCKET)
            logger.info(f"[PROFILE] Created storage bucket '{_AVATAR_BUCKET}'.")
    except Exception as exc:
        logger.warning(f"[PROFILE] Bucket check failed: {exc}")


def _get_user_record(supabase, user_id: str) -> dict:
    res = (
        supabase.table("users")
        .select("id,email,full_name,avatar_url")
        .eq("id", user_id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="User not found")
    return res.data


class UpdateNameRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=100)


@router.get("")
async def get_profile(
    user: dict = Depends(get_current_user),
):
    supabase = _require_supabase()
    user_id = user["user_id"]

    try:
        user_row = _get_user_record(supabase, user_id)

        return {
            "user_id": user_id,
            "email": user_row.get("email", user.get("email")),
            "full_name": user_row.get("full_name", ""),
            "avatar_url": user_row.get("avatar_url", ""),
        }
    except Exception as exc:
        logger.error(f"[PROFILE] Failed to fetch profile: {exc}")
        return {
            "user_id": user_id,
            "email": user.get("email"),
            "full_name": "",
            "avatar_url": "",
        }


@router.patch("/name")
async def update_name(
    body: UpdateNameRequest,
    user: dict = Depends(get_current_user),
):
    supabase = _require_supabase()
    user_id = user["user_id"]
    try:
        res = (
            supabase.table("users")
            .update({"full_name": body.full_name})
            .eq("id", user_id)
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=404, detail="User not found")
        logger.info(f"[PROFILE] Name updated for {user_id}: {body.full_name}")
        return {"status": "success", "full_name": body.full_name}
    except Exception as exc:
        logger.error(f"[PROFILE] Failed to update name: {exc}")
        raise HTTPException(status_code=500, detail=f"Update failed: {str(exc)}")


@router.post("/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    supabase = _require_supabase()
    user_id = user["user_id"]

    if file.content_type not in _ALLOWED_IMAGE_MIME:
        raise HTTPException(status_code=400, detail="Invalid image type")

    content = await file.read()
    if len(content) > _MAX_BYTES:
        raise HTTPException(status_code=400, detail="Image too large (max 2MB)")

    ext = file.filename.split(".")[-1] if "." in file.filename else "png"
    storage_path = f"{user_id}/avatar.{ext}"

    try:
        _ensure_avatar_bucket(supabase)

        # Use upsert to overwrite old avatar
        supabase.storage.from_(_AVATAR_BUCKET).upload(
            storage_path, content, {"content-type": file.content_type, "upsert": "true"}
        )
        avatar_url = supabase.storage.from_(_AVATAR_BUCKET).get_public_url(storage_path)

        res = (
            supabase.table("users")
            .update({"avatar_url": avatar_url})
            .eq("id", user_id)
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=404, detail="User not found")

        return {"status": "success", "avatar_url": avatar_url}
    except Exception as exc:
        logger.error(f"[PROFILE] Failed to upload avatar: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


class ChangePasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=8)


@router.post("/password")
async def change_password(
    body: ChangePasswordRequest,
    user: dict = Depends(get_current_user),
):
    supabase = _require_supabase()
    user_id = user["user_id"]
    try:
        password_hash = bcrypt.hashpw(
            body.new_password.encode("utf-8"),
            bcrypt.gensalt(),
        ).decode("utf-8")
        res = (
            supabase.table("users")
            .update({"password_hash": password_hash})
            .eq("id", user_id)
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=404, detail="User not found")
        logger.info(f"[PROFILE] Password updated for {user_id}")
        return {"status": "success", "message": "Password updated"}
    except Exception as exc:
        logger.error(f"[PROFILE] Failed to update password: {exc}")
        raise HTTPException(
            status_code=500, detail=f"Password update failed: {str(exc)}"
        )
