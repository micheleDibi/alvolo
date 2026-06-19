"""Conversational Q&A over the inbox ('Chiedi ad AlVolo') and per-item deepen."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_auth
from ..db import get_session
from ..models import Item
from ..schemas import _loads_list
from .. import retrieval
from ..worker import claude

router = APIRouter(prefix="/api", tags=["ask"], dependencies=[Depends(require_auth)])


class AskRequest(BaseModel):
    question: str


class ItemAskRequest(BaseModel):
    question: str | None = None


class AskSource(BaseModel):
    id: str
    title: str


class AskResponse(BaseModel):
    answer: str
    sources: list[AskSource] = []


def _title(item: Item) -> str:
    return item.title or item.source_url or "Senza titolo"


async def _get_or_404(session: AsyncSession, item_id: str) -> Item:
    item = await session.get(Item, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found.")
    return item


@router.post("/ask", response_model=AskResponse)
async def ask(body: AskRequest, session: AsyncSession = Depends(get_session)) -> AskResponse:
    question = (body.question or "").strip()
    if not question:
        raise HTTPException(status_code=422, detail="Question is required.")

    items = await retrieval.search(session, question, limit=8)
    blocks = []
    for n, it in enumerate(items, 1):
        body_text = it.summary or it.raw_text or it.extracted_text or ""
        points = _loads_list(it.key_points)
        if points:
            body_text += "\n- " + "\n- ".join(points[:4])
        blocks.append(f"[{n}] (id={it.id}) {_title(it)}\n{body_text}".strip())
    context = "Captured items:\n\n" + "\n\n".join(blocks) if blocks else "No captured items yet."

    try:
        text, _usage = await claude.answer(question, context)
    except claude.EnrichmentError as exc:
        raise HTTPException(status_code=502, detail=f"Assistente non disponibile: {exc}")

    return AskResponse(
        answer=text,
        sources=[AskSource(id=it.id, title=_title(it)) for it in items],
    )


@router.post("/items/{item_id}/ask", response_model=AskResponse)
async def ask_item(
    item_id: str,
    body: ItemAskRequest,
    session: AsyncSession = Depends(get_session),
) -> AskResponse:
    item = await _get_or_404(session, item_id)
    question = (body.question or "").strip() or "Approfondisci questo elemento e spiega perché è rilevante."

    parts = [f"Title: {_title(item)}"]
    if item.summary:
        parts.append(f"Summary: {item.summary}")
    if item.deep_analysis:
        parts.append(f"Analysis: {item.deep_analysis}")
    body_text = item.raw_text or item.extracted_text
    if body_text:
        parts.append(f"Content:\n{body_text[:4000]}")
    context = "Captured item:\n\n[1] (id=" + item.id + ")\n" + "\n".join(parts)

    try:
        text, _usage = await claude.answer(question, context)
    except claude.EnrichmentError as exc:
        raise HTTPException(status_code=502, detail=f"Assistente non disponibile: {exc}")

    return AskResponse(answer=text, sources=[AskSource(id=item.id, title=_title(item))])
