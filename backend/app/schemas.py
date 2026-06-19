"""API request/response DTOs, the enrichment schema, and Item -> DTO mappers.

JSON-list columns (tags, key_points, related_ideas) are stored as TEXT in SQLite and
parsed here so the API always exposes real arrays.
"""

from __future__ import annotations

import json
from datetime import datetime

from pydantic import BaseModel, Field

from .models import ContentType, Item, ItemStatus


# --------------------------------------------------------------------------- #
# Enrichment contract (what we ask Claude to produce, and what we store)
# --------------------------------------------------------------------------- #
class EnrichmentResult(BaseModel):
    title: str
    summary: str
    category: str
    tags: list[str] = Field(default_factory=list)
    key_points: list[str] = Field(default_factory=list)
    related_ideas: list[str] = Field(default_factory=list)
    deep_analysis: str
    extracted_text: str | None = None  # OCR for images / cleaned article body for links
    action_items: list[str] = Field(default_factory=list)


# JSON Schema handed to Claude as a forced-tool input_schema (guarantees structured output).
ENRICHMENT_TOOL_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "Short descriptive title (max ~8 words)."},
        "summary": {"type": "string", "description": "2-4 sentence summary."},
        "category": {
            "type": "string",
            "description": "A single short category, e.g. 'tech', 'idea', 'article', 'recipe', 'finance'.",
        },
        "tags": {
            "type": "array",
            "items": {"type": "string"},
            "description": "3-6 lowercase topical tags.",
        },
        "key_points": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Bullet-style key takeaways.",
        },
        "related_ideas": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Follow-up ideas, angles to explore, or related resources to look up.",
        },
        "deep_analysis": {
            "type": "string",
            "description": "A few paragraphs of deeper analysis: context, why it matters, connections.",
        },
        "extracted_text": {
            "type": ["string", "null"],
            "description": "For images: all text read from the image (OCR). For links: the cleaned article body. Otherwise null.",
        },
        "action_items": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Concrete, actionable to-dos implied by the content (short imperative phrases). Empty array if none.",
        },
    },
    "required": [
        "title", "summary", "category", "tags", "key_points",
        "related_ideas", "deep_analysis", "action_items",
    ],
    "additionalProperties": False,
}


# --------------------------------------------------------------------------- #
# Responses
# --------------------------------------------------------------------------- #
class CaptureResponse(BaseModel):
    id: str
    status: ItemStatus
    content_type: ContentType


class ItemSummary(BaseModel):
    id: str
    created_at: datetime
    content_type: ContentType
    status: ItemStatus
    source: str
    title: str | None
    summary: str | None
    category: str | None
    tags: list[str]
    action_items: list[str]
    remind_at: datetime | None
    has_image: bool
    source_url: str | None
    error_message: str | None


class RelatedItem(BaseModel):
    id: str
    title: str
    content_type: ContentType
    status: ItemStatus


class ItemDetail(ItemSummary):
    updated_at: datetime
    enriched_at: datetime | None
    raw_text: str | None
    key_points: list[str]
    related_ideas: list[str]
    deep_analysis: str | None
    extracted_text: str | None
    model_used: str | None
    image_url: str | None
    file_url: str | None
    related: list[RelatedItem] = Field(default_factory=list)


class ItemList(BaseModel):
    items: list[ItemSummary]
    total: int


class ItemPatch(BaseModel):
    """Partial update of an item (used for archive/unarchive and light edits)."""

    status: ItemStatus | None = None
    title: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    action_items: list[str] | None = None
    remind_at: datetime | None = None


class TagCount(BaseModel):
    name: str
    count: int


class MetaResponse(BaseModel):
    """Aggregations powering the inbox filter bar."""

    tags: list[TagCount]
    categories: list[TagCount]
    counts_by_status: dict[str, int]


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _loads_list(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        data = json.loads(value)
        return [str(x) for x in data] if isinstance(data, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


def dumps_list(value: list[str] | None) -> str | None:
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False)


def item_to_summary(item: Item) -> ItemSummary:
    return ItemSummary(
        id=item.id,
        created_at=item.created_at,
        content_type=item.content_type,
        status=item.status,
        source=item.source,
        title=item.title,
        summary=item.summary,
        category=item.category,
        tags=_loads_list(item.tags),
        action_items=_loads_list(item.action_items),
        remind_at=item.remind_at,
        has_image=bool(item.image_filename),
        source_url=item.source_url,
        error_message=item.error_message,
    )


def item_to_detail(item: Item) -> ItemDetail:
    return ItemDetail(
        **item_to_summary(item).model_dump(),
        updated_at=item.updated_at,
        enriched_at=item.enriched_at,
        raw_text=item.raw_text,
        key_points=_loads_list(item.key_points),
        related_ideas=_loads_list(item.related_ideas),
        deep_analysis=item.deep_analysis,
        extracted_text=item.extracted_text,
        model_used=item.model_used,
        image_url=f"/api/items/{item.id}/image" if item.image_filename else None,
        file_url=f"/api/items/{item.id}/file" if item.file_filename else None,
    )
