"""Application configuration loaded from environment / .env.

Single source of truth for paths, secrets and model ids. Everything is overridable
via environment variables so the same code runs locally and on the cloud host.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- storage / data ---
    # DATA_DIR holds the SQLite db file and the uploads/ directory. Locally this
    # defaults to ./data; in production it is the mounted persistent volume (e.g. /data).
    data_dir: Path = Path("./data")

    # If DATABASE_URL is unset it is derived from data_dir (sqlite+aiosqlite).
    database_url: str | None = None

    # --- auth ---
    # Shared single-user token. Empty in dev means auth is DISABLED (convenient for
    # local development); set a real value in any deployed/shared environment.
    capture_token: str = ""

    # --- Anthropic / enrichment ---
    anthropic_api_key: str = ""
    opus_model: str = "claude-opus-4-8"      # vision (images / screenshots)
    sonnet_model: str = "claude-sonnet-4-6"  # text + links
    anthropic_max_tokens: int = 4096

    # --- worker ---
    worker_poll_seconds: float = 2.0
    worker_concurrency: int = 2
    enrich_timeout_seconds: float = 120.0
    max_attempts: int = 3

    # --- uploads ---
    max_image_bytes: int = 10 * 1024 * 1024  # 10 MB
    allowed_image_mimes: tuple[str, ...] = (
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
    )

    # --- link extraction ---
    fetch_timeout_seconds: float = 10.0

    # --- misc ---
    env: str = "development"

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def sqlite_path(self) -> Path:
        return self.data_dir / "alvolo.db"

    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        # Absolute path -> 4 slashes after the scheme.
        return f"sqlite+aiosqlite:///{self.sqlite_path.resolve()}"

    @property
    def auth_enabled(self) -> bool:
        return bool(self.capture_token)

    @property
    def anthropic_enabled(self) -> bool:
        return bool(self.anthropic_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
