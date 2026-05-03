"""
voices.py  —  /voices  router
------------------------------
Handles persistence of generated and cloned voices to the user library.
Now includes local JSON fallback to ensure saving always works.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
import uuid
import json
import os
from pathlib import Path
from datetime import datetime

from app.core.security import get_current_user
from app.core.logger  import get_logger
from app.core.supabase import get_supabase

router   = APIRouter(prefix="/voices", tags=["Library"])
logger   = get_logger(__name__)

# ── Local Storage Fallback ──────────────────────────────────────────────────
DB_FILE = Path("storage/voices_db.json")
DB_FILE.parent.mkdir(exist_ok=True)

def _load_local_db():
    if not DB_FILE.exists(): return []
    try:
        with open(DB_FILE, "r") as f: return json.load(f)
    except: return []

def _save_local_db(data):
    with open(DB_FILE, "w") as f: json.dump(data, f, indent=2)

# ── schemas ───────────────────────────────────────────────────────────────────
class SaveVoiceRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    voice_type: str = Field(..., pattern="^(designed|cloned)$")
    metadata: dict = Field(default_factory=dict)

# ── endpoints ──────────────────────────────────────────────────────────────────
@router.post("/save")
async def save_voice(
    body: SaveVoiceRequest,
    user: dict = Depends(get_current_user),
):
    user_id = user["user_id"]
    logger.info(f"[LIBRARY] Saving voice '{body.name}' for user_id={user_id}")
    
    new_voice = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "name": body.name,
        "type": body.voice_type,
        "created_at": datetime.utcnow().isoformat(),
        "metadata": body.metadata
    }

    # 1. Try Supabase
    supabase = get_supabase()
    if supabase:
        try:
            supabase.table("voices").insert(new_voice).execute()
            logger.info(f"[LIBRARY] ✓ Voice '{body.name}' saved to Supabase.")
            return {"status": "success", "voice_id": new_voice["id"]}
        except Exception as exc:
            logger.error(f"[LIBRARY] Supabase insert failed: {exc}")
            # Fall through to local save

    # 2. Local Fallback
    db = _load_local_db()
    db.append(new_voice)
    _save_local_db(db)
    logger.info(f"[LIBRARY] ✓ Voice '{body.name}' saved to local storage.")
    
    return {
        "status": "success",
        "message": "Saved to local storage (Supabase unavailable).",
        "voice_id": new_voice["id"]
    }

@router.get("")
async def list_voices(
    user: dict = Depends(get_current_user),
):
    user_id = user["user_id"]
    
    # 1. Try Supabase
    supabase = get_supabase()
    if supabase:
        try:
            res = supabase.table("voices").select("*").eq("user_id", user_id).execute()
            return res.data
        except Exception as exc:
            logger.error(f"[LIBRARY] Supabase fetch failed: {exc}")

    # 2. Local Fallback
    db = _load_local_db()
    user_voices = [v for v in db if v["user_id"] == user_id]
    return user_voices
