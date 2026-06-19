"""Export the whole inbox as a JSON backup or a Markdown document."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..auth import require_auth
from ..db import get_session
from ..models import Item
from ..schemas import item_to_detail

router = APIRouter(prefix="/api", tags=["export"], dependencies=[Depends(require_auth)])


@router.get("/export")
async def export(
    format: str = Query(default="json", pattern="^(json|markdown)$"),
    session: AsyncSession = Depends(get_session),
):
    rows = (
        await session.execute(select(Item).order_by(Item.created_at.desc()))
    ).scalars().all()
    items = [item_to_detail(it) for it in rows]

    if format == "markdown":
        lines = ["# AlVolo — Export\n"]
        for it in items:
            lines.append(f"## {it.title or it.source_url or 'Senza titolo'}")
            lines.append(
                f"_{it.created_at.isoformat()} · {it.content_type.value} · {it.status.value}_\n"
            )
            if it.summary:
                lines.append(it.summary + "\n")
            if it.key_points:
                lines.extend(f"- {k}" for k in it.key_points)
                lines.append("")
            if it.action_items:
                lines.append("**Da fare:**")
                lines.extend(f"- [ ] {a}" for a in it.action_items)
                lines.append("")
            if it.tags:
                lines.append("Tag: " + ", ".join(f"#{t}" for t in it.tags) + "\n")
            if it.source_url:
                lines.append(f"<{it.source_url}>\n")
            lines.append("---\n")
        md = "\n".join(lines)
        return PlainTextResponse(
            md,
            media_type="text/markdown; charset=utf-8",
            headers={"Content-Disposition": "attachment; filename=alvolo-export.md"},
        )

    payload = [it.model_dump(mode="json") for it in items]
    return JSONResponse(
        payload,
        headers={"Content-Disposition": "attachment; filename=alvolo-export.json"},
    )
