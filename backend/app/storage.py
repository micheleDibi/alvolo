"""Image storage abstraction.

MVP stores uploaded images on the local filesystem under DATA_DIR/uploads. The
interface (save_image / image_path / delete_image) is deliberately small so it can be
re-implemented against object storage (e.g. Cloudflare R2) later without touching callers.
"""

from __future__ import annotations

from pathlib import Path

from .config import settings

# Map common image mime types to a file extension.
_MIME_EXT = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
}


def ext_for_mime(mime: str) -> str:
    return _MIME_EXT.get(mime, ".bin")


def save_image(item_id: str, data: bytes, mime: str) -> str:
    """Persist image bytes and return the stored filename (basename only)."""
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{item_id}{ext_for_mime(mime)}"
    (settings.uploads_dir / filename).write_bytes(data)
    return filename


def image_path(filename: str) -> Path:
    return settings.uploads_dir / filename


def read_image(filename: str) -> bytes:
    return image_path(filename).read_bytes()


def delete_image(filename: str | None) -> None:
    if not filename:
        return
    path = image_path(filename)
    if path.exists():
        path.unlink()
