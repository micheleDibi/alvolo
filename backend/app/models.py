"""Database models.

A single `item` table doubles as the work queue: a row with status=CAPTURING is the
backlog the in-process worker drains. JSON-typed enrichment fields (tags, key_points,
related_ideas, token_usage) are stored as TEXT and (de)serialised in the schema layer.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return uuid.uuid4().hex


class ContentType(str, enum.Enum):
    TEXT = "text"
    LINK = "link"
    IMAGE = "image"


class ItemStatus(str, enum.Enum):
    CAPTURING = "capturing"    # created, waiting for the worker
    PROCESSING = "processing"  # worker claimed it, Claude call in flight
    DONE = "done"              # enrichment complete
    FAILED = "failed"          # attempts exhausted or fatal error
    ARCHIVED = "archived"      # reserved for a future "archive" UI (not used yet)


class Item(SQLModel, table=True):
    __tablename__ = "item"

    id: str = Field(default_factory=new_id, primary_key=True)
    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow)

    # Stored as plain strings holding the *values* of ContentType / ItemStatus
    # (e.g. "text", "capturing"). This keeps DB representation obvious and lets the
    # worker do raw/ORM status comparisons without enum-encoding surprises. The API
    # layer (schemas.py) re-types these into the enums for responses.
    content_type: str
    status: str = Field(default=ItemStatus.CAPTURING.value, index=True)
    source: str = "app"  # 'app' | 'shortcut'

    # --- raw captured input (one populated per content_type) ---
    raw_text: str | None = None
    source_url: str | None = None
    image_filename: str | None = None
    image_mime: str | None = None

    # --- enrichment output (NULL until DONE); JSON arrays stored as TEXT ---
    title: str | None = None
    summary: str | None = None
    category: str | None = None
    tags: str | None = None           # JSON: list[str]
    key_points: str | None = None     # JSON: list[str]
    related_ideas: str | None = None  # JSON: list[str]
    deep_analysis: str | None = None
    extracted_text: str | None = None  # OCR (images) / cleaned body (links)

    # --- observability / cost (future-proof) ---
    model_used: str | None = None
    token_usage: str | None = None  # JSON: {input, output, cache_read, ...}
    enriched_at: datetime | None = None

    # --- worker bookkeeping ---
    error_message: str | None = None  # user-facing
    attempts: int = 0
    last_error_at: datetime | None = None
