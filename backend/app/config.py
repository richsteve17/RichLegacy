"""Application configuration."""
from __future__ import annotations

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="APP_")

    # Storage
    upload_dir: Path = Path("uploads")
    max_upload_mb: int = 200

    # CORS — Vite default + local network testing from iPhone
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    # When True, allow any LAN origin (handy for iPhone-on-same-wifi testing)
    cors_allow_lan: bool = True

    # Audio
    target_sample_rate: int = 22050


settings = Settings()
settings.upload_dir.mkdir(parents=True, exist_ok=True)
