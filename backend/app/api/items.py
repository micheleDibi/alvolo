"""Browse / manage captured items: list (filter/search), meta, detail, image, patch, retry, delete."""

from __future__ import annotations

import json
import re

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..auth import require_auth
from ..db import get_session
from ..models import Item, ItemStatus, utcnow
from ..schemas import (
    CaptureResponse,
    ItemDetail,
    ItemList,
    ItemPatch,
    MetaResponse,
    RelatedItem,
    TagCount,
    dumps_list,
    item_to_detail,
    item_to_summary,
)
from .. import storage

router = APIRouter(prefix="/api/items", tags=["items"], dependencies=[Depends(require_auth)])

_ARCHIVED = ItemStatus.ARCHIVED.value


async def _get_or_404(session: AsyncSession, item_id: str) -> Item:
    item = await session.get(Item, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found.")
    return item


@router.get("", response_model=ItemList)
async def list_items(
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    status_filter: str | None = Query(default=None, alias="status"),
    category: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    q: str | None = Query(default=None, description="Free-text search across title/summary/body/tags."),
    has_todo: bool = Query(default=False, description="Only items with open action items (to-dos)."),
    sort: str = Query(default="newest", pattern="^(newest|oldest)$"),
) -> ItemList:
    where = []

    if has_todo:
        where.append(Item.action_items.is_not(None))
        where.append(Item.action_items.not_in(("", "[]")))

    # Default view hides archived items; an explicit ?status= shows that bucket.
    if status_filter:
        where.append(Item.status == status_filter)
    else:
        where.append(Item.status != _ARCHIVED)

    if category:
        where.append(Item.category == category)

    if tag:
        # tags are a JSON array stored as TEXT; match exact membership via json_each.
        where.append(Item.tags.is_not(None))
        where.append(
            text(
                "EXISTS (SELECT 1 FROM json_each(item.tags) WHERE json_each.value = :tag)"
            ).bindparams(tag=tag)
        )

    if q:
        # Simple, dependency-free search: every token must appear in some text field.
        # (FTS5/bm25 ranking and semantic search are the planned follow-up.)
        for token in re.findall(r"\w+", q)[:8]:
            like = f"%{token}%"
            where.append(
                or_(
                    Item.title.ilike(like),
                    Item.summary.ilike(like),
                    Item.category.ilike(like),
                    Item.tags.ilike(like),
                    Item.raw_text.ilike(like),
                    Item.extracted_text.ilike(like),
                )
            )

    order = Item.created_at.asc() if sort == "oldest" else Item.created_at.desc()
    total_stmt = select(func.count()).select_from(Item)
    list_stmt = select(Item).order_by(order).limit(limit).offset(offset)
    for clause in where:
        total_stmt = total_stmt.where(clause)
        list_stmt = list_stmt.where(clause)

    total = (await session.execute(total_stmt)).scalar_one()
    rows = (await session.execute(list_stmt)).scalars().all()
    return ItemList(items=[item_to_summary(i) for i in rows], total=total)


@router.get("/meta", response_model=MetaResponse)
async def items_meta(session: AsyncSession = Depends(get_session)) -> MetaResponse:
    """Tag/category/status aggregations that power the inbox filter bar."""
    tag_rows = (
        await session.execute(
            text(
                """
                SELECT je.value AS name, COUNT(*) AS count
                FROM item, json_each(item.tags) je
                WHERE item.tags IS NOT NULL AND item.status != :archived
                GROUP BY je.value
                ORDER BY count DESC, name ASC
                LIMIT 50
                """
            ).bindparams(archived=_ARCHIVED)
        )
    ).all()
    cat_rows = (
        await session.execute(
            text(
                """
                SELECT category AS name, COUNT(*) AS count
                FROM item
                WHERE category IS NOT NULL AND status != :archived
                GROUP BY category
                ORDER BY count DESC, name ASC
                """
            ).bindparams(archived=_ARCHIVED)
        )
    ).all()
    status_rows = (
        await session.execute(text("SELECT status, COUNT(*) FROM item GROUP BY status"))
    ).all()
    return MetaResponse(
        tags=[TagCount(name=r[0], count=r[1]) for r in tag_rows],
        categories=[TagCount(name=r[0], count=r[1]) for r in cat_rows],
        counts_by_status={r[0]: r[1] for r in status_rows},
    )


@router.get("/{item_id}", response_model=ItemDetail)
async def get_item(item_id: str, session: AsyncSession = Depends(get_session)) -> ItemDetail:
    item = await _get_or_404(session, item_id)
    detail = item_to_detail(item)
    try:
        rel_ids = json.loads(item.related_item_ids) if item.related_item_ids else []
    except (json.JSONDecodeError, TypeError):
        rel_ids = []
    if rel_ids:
        rows = (
            await session.execute(
                select(Item).where(Item.id.in_(rel_ids), Item.status != _ARCHIVED)
            )
        ).scalars().all()
        order = {rid: n for n, rid in enumerate(rel_ids)}
        rows.sort(key=lambda r: order.get(r.id, 999))
        detail.related = [
            RelatedItem(
                id=r.id,
                title=r.title or r.source_url or "Senza titolo",
                content_type=r.content_type,  # type: ignore[arg-type]
                status=r.status,  # type: ignore[arg-type]
            )
            for r in rows
        ]
    return detail


@router.get("/{item_id}/image")
async def get_item_image(item_id: str, session: AsyncSession = Depends(get_session)) -> FileResponse:
    item = await _get_or_404(session, item_id)
    if not item.image_filename:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item has no image.")
    path = storage.image_path(item.image_filename)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image file missing.")
    return FileResponse(path, media_type=item.image_mime or "application/octet-stream")


@router.get("/{item_id}/file")
async def get_item_file(item_id: str, session: AsyncSession = Depends(get_session)) -> FileResponse:
    item = await _get_or_404(session, item_id)
    if not item.file_filename:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item has no file.")
    path = storage.file_path(item.file_filename)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File missing.")
    return FileResponse(path, media_type=item.file_mime or "application/octet-stream")


@router.patch("/{item_id}", response_model=ItemDetail)
async def patch_item(
    item_id: str, body: ItemPatch, session: AsyncSession = Depends(get_session)
) -> ItemDetail:
    """Partial update — used for archive/unarchive and light edits (title/category/tags)."""
    item = await _get_or_404(session, item_id)
    fields = body.model_dump(exclude_unset=True)
    if "status" in fields and body.status is not None:
        item.status = body.status.value
    if "title" in fields:
        item.title = body.title
    if "category" in fields:
        item.category = body.category
    if "tags" in fields:
        item.tags = dumps_list(body.tags)
    if "action_items" in fields:
        item.action_items = dumps_list(body.action_items)
    item.updated_at = utcnow()
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return item_to_detail(item)


@router.post("/{item_id}/retry", response_model=CaptureResponse)
async def retry_item(item_id: str, session: AsyncSession = Depends(get_session)) -> CaptureResponse:
    item = await _get_or_404(session, item_id)
    if item.status != ItemStatus.FAILED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only failed items can be retried.",
        )
    item.status = ItemStatus.CAPTURING.value
    item.attempts = 0
    item.error_message = None
    item.last_error_at = None
    item.updated_at = utcnow()
    session.add(item)
    await session.commit()
    return CaptureResponse(
        id=item.id, status=ItemStatus.CAPTURING, content_type=item.content_type  # type: ignore[arg-type]
    )


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(item_id: str, session: AsyncSession = Depends(get_session)) -> Response:
    item = await _get_or_404(session, item_id)
    storage.delete_image(item.image_filename)
    storage.delete_file(item.file_filename)
    await session.delete(item)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
