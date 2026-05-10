"""
video.py  —  /video router
---------------------------
POST /video/generate-avatar → Generate a lip-synced video from a reference mp4 and text.
"""

import os
import torch
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

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

router = APIRouter(prefix="/video", tags=["Video"])
logger = get_logger(__name__)
settings = get_settings()

_BUCKET = "reference-audio"

def _is_uuid(val: str) -> bool:
    try:
        uuid.UUID(str(val))
        return True
    except Exception:
        return False

@router.post(
    "/generate-avatar",
    summary="Generate Lip-Synced Avatar",
)
async def generate_avatar(
    text: str = Form(...),
    video: UploadFile = File(None),
    avatar_id: str = Form(None),
    voice_id: str = Form(None),
    speed: float = Form(1.0),
    user: dict = Depends(get_current_user),
):
    logger.info(f"[VIDEO] Generating avatar for user={user['email']} | voice={voice_id} | avatar={avatar_id}")

    if not video and not avatar_id:
        raise HTTPException(status_code=400, detail="Must provide either video file or avatar_id")

    supabase = get_supabase()

    # ── Step 0: Resolve Video ────────────────────────────────────────────────
    video_bytes = None
    if video:
        video_bytes = await video.read()
    else:
        # Fetch avatar from Supabase
        res = supabase.table("avatars").select("*").eq("id", avatar_id).eq("user_id", user["user_id"]).execute()
        if not res or not res.data:
            raise HTTPException(status_code=404, detail="Avatar not found")
        
        avatar_record = res.data[0]
        video_url = avatar_record.get("video_url")
        if not video_url:
            raise HTTPException(status_code=400, detail="Avatar has no video_url")
        
        import httpx
        async with httpx.AsyncClient() as client:
            resp = await client.get(video_url)
            if resp.status_code != 200:
                raise HTTPException(status_code=500, detail="Failed to download avatar video")
            video_bytes = resp.content

    # ── Step 1: Generate Audio (OmniVoice) ───────────────────────────────────
    # We load OmniVoice first
    omni_model = get_model("omnivoice")
    
    try:
        embedding = None
        
        if voice_id and _is_uuid(voice_id):
            embedding = get_cached_speaker_embedding(voice_id)
            if embedding is None:
                res = supabase.table("voices").select("id,user_id,metadata,type").eq("id", voice_id).eq("user_id", user["user_id"]).execute()
                if not res or not res.data:
                    raise HTTPException(status_code=404, detail="Voice not found")
                
                storage_path = f"{user['user_id']}/{voice_id}.wav"
                ref_bytes = supabase.storage.from_(_BUCKET).download(storage_path)
                tmp_path = load_audio_to_file(ref_bytes)
                try:
                    embedding = extract_speaker_embedding(omni_model, tmp_path)
                    cache_speaker_embedding(voice_id, embedding)
                finally:
                    if os.path.exists(tmp_path):
                        os.remove(tmp_path)
        elif avatar_id:
            # "Use Original Voice" was selected (no voice_id provided, but avatar_id is). 
            # We use the avatar's reference_audio_url to clone its original voice.
            ref_url = avatar_record.get("reference_audio_url")
            if ref_url:
                import httpx
                async with httpx.AsyncClient() as client:
                    resp = await client.get(ref_url)
                    if resp.status_code == 200:
                        tmp_path = load_audio_to_file(resp.content)
                        try:
                            embedding = extract_speaker_embedding(omni_model, tmp_path)
                        finally:
                            if os.path.exists(tmp_path):
                                os.remove(tmp_path)

        if embedding is not None:
            audio_array = generate_with_voice_embedding(omni_model, text, embedding, speed=speed)
            waveform = torch.from_numpy(audio_array).unsqueeze(0) if not isinstance(audio_array, torch.Tensor) else audio_array
        else:
            audio_list = omni_model.generate(text=text, speed=speed, language="English")
            waveform = torch.from_numpy(audio_list[0]).unsqueeze(0)

        wav_bytes = tensor_to_wav_bytes(waveform, 24000)
        
    except Exception as exc:
        logger.error(f"[VIDEO] Audio generation failed: {exc}")
        raise HTTPException(status_code=500, detail=f"Audio generation failed: {exc}")

    # ── Step 2: Hot-Swap VRAM (OmniVoice -> MuseTalk) ────────────────────────
    # Force offload OmniVoice
    if hasattr(omni_model, "to"):
        omni_model.to("cpu")
    clear_cache()
    
    # ── Step 3: Generate Video (MuseTalk) ────────────────────────────────────
    muse_engine = get_musetalk()
    
    try:
        final_video_bytes = await muse_engine.generate_sync_video(video_bytes, wav_bytes)
        
        import io
        return StreamingResponse(
            io.BytesIO(final_video_bytes),
            media_type="video/mp4",
            headers={
                "Content-Disposition": "inline",
                "Content-Length": str(len(final_video_bytes)),
                "Cache-Control": "no-cache",
            },
        )
        
    except Exception as exc:
        logger.error(f"[VIDEO] MuseTalk inference failed: {exc}")
        raise HTTPException(status_code=500, detail=f"Video generation failed: {exc}")
    finally:
        # Offload MuseTalk
        muse_engine.unload()
        clear_cache()
