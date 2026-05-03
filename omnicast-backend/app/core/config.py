from pydantic_settings import BaseSettings
from pydantic import ConfigDict
from functools import lru_cache
from pathlib import Path


class Settings(BaseSettings):
    model_config = ConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        protected_namespaces=("settings_",),
        extra="ignore",
    )

    # Supabase
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    jwt_secret: str

    # Model
    weights_dir: Path = Path("./models")
    sample_rate: int = 24000

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    environment: str = "development"

    # VRAM
    vram_idle_timeout_seconds: int = 300


@lru_cache()
def get_settings() -> Settings:
    return Settings()
