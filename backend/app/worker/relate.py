"""Find related items by tag/category overlap.

Cheap and dependency-free: score candidate DONE items by how many tags they share
with the freshly enriched item (plus a small bonus for the same category). This is the
v1 of the "second brain" graph; embeddings-based similarity is the planned upgrade.
"""

from __future__ import annotations

import json

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..models import Item, ItemStatus


def _tagset(value: str | None) -> set[str]:
    if not value:
        return set()
    try:
        return {str(t).lower() for t in json.loads(value)}
    except (json.JSONDecodeError, TypeError):
        return set()


async def find_related(
    session: AsyncSession,
    item_id: str,
    tags: list[str],
    category: str | None,
    limit: int = 5,
) -> list[str]:
    want = {t.lower() for t in tags}
    if not want and not category:
        return []
    rows = (
        await session.execute(
            select(Item.id, Item.tags, Item.category)
            .where(Item.id != item_id, Item.status == ItemStatus.DONE.value)
            .order_by(Item.created_at.desc())
            .limit(500)
        )
    ).all()
    scored: list[tuple[int, str]] = []
    for rid, rtags, rcat in rows:
        score = len(want & _tagset(rtags)) + (1 if category and rcat == category else 0)
        if score:
            scored.append((score, rid))
    scored.sort(key=lambda s: -s[0])
    return [rid for _, rid in scored[:limit]]
