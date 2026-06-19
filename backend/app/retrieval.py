"""Lightweight retrieval over captured items (powers 'Chiedi ad AlVolo').

v1 uses the same dependency-free token LIKE search as the list endpoint; FTS5/bm25 and
embedding-based semantic retrieval are the planned upgrade.
"""

from __future__ import annotations

import re

from sqlalchemy import or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from .models import Item, ItemStatus

_ARCHIVED = ItemStatus.ARCHIVED.value


async def search(session: AsyncSession, q: str, limit: int = 8) -> list[Item]:
    """Return up to `limit` non-archived items matching the query tokens.

    Falls back to the most recent items when the query has no usable tokens or
    nothing matches, so the assistant always has some grounding context.
    """
    tokens = re.findall(r"\w+", q or "")[:8]
    where = [Item.status != _ARCHIVED]
    for token in tokens:
        like = f"%{token}%"
        where.append(
            or_(
                Item.title.ilike(like),
                Item.summary.ilike(like),
                Item.category.ilike(like),
                Item.tags.ilike(like),
                Item.raw_text.ilike(like),
                Item.extracted_text.ilike(like),
                Item.deep_analysis.ilike(like),
            )
        )

    stmt = select(Item).order_by(Item.created_at.desc()).limit(limit)
    for clause in where:
        stmt = stmt.where(clause)
    rows = (await session.execute(stmt)).scalars().all()

    if not rows:  # nothing matched -> ground on the most recent items instead
        recent = (
            select(Item)
            .where(Item.status != _ARCHIVED)
            .order_by(Item.created_at.desc())
            .limit(limit)
        )
        rows = (await session.execute(recent)).scalars().all()
    return rows
