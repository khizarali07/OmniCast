"""
supabase.py
-----------
Initializes the Supabase client for database and storage operations.
"""

import os
from supabase import create_client, Client
from app.core.config import get_settings
from app.core.logger import get_logger

logger = get_logger(__name__)
settings = get_settings()

_client: Client = None


def get_supabase() -> Client:
    """Singleton getter for Supabase client."""
    global _client
    if _client is not None:
        return _client

    url = settings.supabase_url
    key = settings.supabase_service_role_key

    if not url or not key or "your-" in url:
        logger.warning(
            "[SUPABASE] Missing or invalid credentials — Supabase client not initialized."
        )
        return None

    try:
        _client = create_client(url, key)
        logger.info("[SUPABASE] ✓ Client initialized.")
        return _client
    except Exception as exc:
        logger.error(f"[SUPABASE] ✗ Initialization failed: {exc}")
        return None
