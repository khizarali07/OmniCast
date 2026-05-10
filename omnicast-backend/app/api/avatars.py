import os
import uuid
import tempfile
import httpx
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import JSONResponse

from app.core.security import get_current_user
from app.core.logger import get_logger
from app.core.supabase import get_supabase
from app.services.model_manager import get_model, get_musetalk
from app.services.audio_engine import (
    tensor_to_wav_bytes,
    get_cached_speaker_embedding,
    generate_with_voice_embedding,
    load_audio_to_file,
    extract_speaker_embedding,
    cache_speaker_embedding,
)
from app.utils.vram import vram_managed, clear_cache
from app.core.config import get_settings

from pydantic import BaseModel, Field

router = APIRouter(prefix="/avatars", tags=["Avatars"])
logger = get_logger(__name__)
settings = get_settings()

@router.get("")
async def list_avatars(user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    res = supabase.table("avatars").select("*").eq("user_id", user["user_id"]).order("created_at", desc=True).execute()
    return res.data

class UpdateAvatarRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)

@router.patch("/{avatar_id}")
async def update_avatar(
    avatar_id: str,
    body: UpdateAvatarRequest,
    user: dict = Depends(get_current_user),
):
    user_id = user["user_id"]
    supabase = get_supabase()

    try:
        res = (
            supabase.table("avatars")
            .update({"name": body.name})
            .eq("id", avatar_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found or not owned by user"
            )
        return {"status": "success", "avatar_id": avatar_id, "new_name": body.name}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[AVATARS] Supabase update failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase update failed",
        )

@router.delete("/{avatar_id}")
async def delete_avatar(
    avatar_id: str,
    user: dict = Depends(get_current_user),
):
    user_id = user["user_id"]
    supabase = get_supabase()

    try:
        # Get paths from record before deleting
        res = (
            supabase.table("avatars")
            .select("*")
            .eq("id", avatar_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        avatar = res.data
    except Exception as exc:
        logger.error(f"[AVATARS] Supabase fetch failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase fetch failed",
        )

    if not avatar:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found"
        )

    # Cleanup storage
    files_to_remove = []
    # Helper to extract relative path from public URL if possible, or use IDs
    # Based on create_avatar, paths are {user_id}/{avatar_id}_base.mp4 and {user_id}/{avatar_id}_preview.mp4
    files_to_remove.append(f"{user_id}/{avatar_id}_base.mp4")
    files_to_remove.append(f"{user_id}/{avatar_id}_preview.mp4")

    try:
        supabase.storage.from_("avatars").remove(files_to_remove)
        logger.info(f"[AVATARS] ✓ Storage files removed for {avatar_id}")
    except Exception as exc:
        logger.warning(f"[AVATARS] Failed to remove storage files: {exc}")

    try:
        supabase.table("avatars").delete().eq("id", avatar_id).eq("user_id", user_id).execute()
        logger.info(f"[AVATARS] ✓ Avatar deleted: {avatar_id}")
    except Exception as exc:
        logger.error(f"[AVATARS] Supabase delete failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase delete failed",
        )

    return {"status": "success", "avatar_id": avatar_id}

@router.post("")
async def create_avatar(
    name: str = Form(...),
    video: UploadFile = File(...),
    text: str = Form(...),
    voice_id: str = Form(...),
    user: dict = Depends(get_current_user),
):
    logger.info(f"[AVATARS] Creating avatar '{name}' for user {user['email']}")
    supabase = get_supabase()
    
    avatar_id = str(uuid.uuid4())
    video_bytes = await video.read()
    
    # 1. Upload Base Video to Supabase Storage
    storage_path = f"{user['user_id']}/{avatar_id}_base.mp4"
    try:
        supabase.storage.from_("avatars").upload(storage_path, video_bytes, {"content-type": "video/mp4"})
        base_video_url = supabase.storage.from_("avatars").get_public_url(storage_path)
    except Exception as e:
        logger.error(f"[AVATARS] Failed to upload base video: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload base video")
        
    # 2. Insert into DB (so we have it even if preview fails)
    avatar_record = {
        "id": avatar_id,
        "user_id": user["user_id"],
        "name": name,
        "video_url": base_video_url,
    }
    
    try:
        supabase.table("avatars").insert(avatar_record).execute()
    except Exception as e:
        logger.error(f"[AVATARS] Database insert failed: {e}")
        raise HTTPException(status_code=500, detail="Database error")
        
    # 3. Generate Preview Video
    preview_url = None
    preview_error = None
    
    try:
        omni_model = get_model("omnivoice")
        embedding = get_cached_speaker_embedding(voice_id)
        if embedding is None:
            res = supabase.table("voices").select("*").eq("id", voice_id).execute()
            if not res or not res.data:
                raise Exception("Voice not found")
                
            ref_path = f"{user['user_id']}/{voice_id}.wav"
            ref_bytes = supabase.storage.from_("reference-audio").download(ref_path)
            tmp_path = load_audio_to_file(ref_bytes)
            try:
                embedding = extract_speaker_embedding(omni_model, tmp_path)
                cache_speaker_embedding(voice_id, embedding)
            finally:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
                    
        import torch
        audio_array = generate_with_voice_embedding(omni_model, text, embedding, speed=1.0)
        waveform = torch.from_numpy(audio_array).unsqueeze(0) if not isinstance(audio_array, torch.Tensor) else audio_array
        wav_bytes = tensor_to_wav_bytes(waveform, 24000)
        
        # Offload OmniVoice
        if hasattr(omni_model, "to"):
            omni_model.to("cpu")
        clear_cache()
        
        # Run MuseTalk
        muse_engine = get_musetalk()
        final_video_bytes = await muse_engine.generate_sync_video(video_bytes, wav_bytes)
        
        # Offload MuseTalk
        muse_engine.unload()
        clear_cache()
        
        # Upload Preview Video
        preview_path = f"{user['user_id']}/{avatar_id}_preview.mp4"
        supabase.storage.from_("avatars").upload(preview_path, final_video_bytes, {"content-type": "video/mp4"})
        preview_url = supabase.storage.from_("avatars").get_public_url(preview_path)
        
        # Update record
        supabase.table("avatars").update({"output_video_url": preview_url}).eq("id", avatar_id).execute()
        
    except Exception as e:
        logger.error(f"[AVATARS] Preview generation failed: {e}")
        preview_error = str(e)
        
    return {
        "avatar_id": avatar_id,
        "avatar_name": name,
        "video_url": base_video_url,
        "output_video_url": preview_url,
        "preview_error": preview_error,
    }
