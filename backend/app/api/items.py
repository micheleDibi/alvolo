"""Browse / manage captured items: list, detail, image, retry, delete."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..auth import require_auth
from ..db import get_session
from ..models import Item, ItemStatus, utcnow
from ..schemas import CaptureResponse, ItemDetail, ItemList, item_to_detail, item_to_summary
from .. import storage

router = APIRouter(prefix="/api/items", tags=["items"], dependencies=[Depends(require_auth)])


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
) -> ItemList:
    where = []
    if status_filter:
        where.append(Item.status == status_filter)

    total_stmt = select(func.count()).select_from(Item)
    list_stmt = select(Item).order_by(Item.created_at.desc()).limit(limit).offset(offset)
    for clause in where:
        total_stmt = total_stmt.where(clause)
        list_stmt = list_stmt.where(clause)

    total = (await session.execute(total_stmt)).scalar_one()
    rows = (await session.execute(list_stmt)).scalars().all()
    return ItemList(items=[item_to_summary(i) for i in rows], total=total)


@router.get("/{item_id}", response_model=ItemDetail)
async def get_item(item_id: str, session: AsyncSession = Depends(get_session)) -> ItemDetail:
    item = await _get_or_404(session, item_id)
    return item_to_detail(item)


@router.get("/{item_id}/image")
async def get_item_image(item_id: str, session: AsyncSession = Depends(get_session)) -> FileResponse:
    item = await _get_or_404(session, item_id)
    if not item.image_filename:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item has no image.")
    path = storage.image_path(item.image_filename)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image file missing.")
    return FileResponse(path, media_type=item.image_mime or "application/octet-stream")


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
    await session.delete(item)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
