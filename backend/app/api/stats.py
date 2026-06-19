"""Inbox statistics + a labelled AI-cost estimate (from the stored token_usage)."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..auth import require_auth
from ..db import get_session
from ..models import Item, utcnow
from ..schemas import TagCount

router = APIRouter(prefix="/api", tags=["stats"], dependencies=[Depends(require_auth)])

# Rough public Claude pricing (USD per 1M tokens). Used ONLY for a labelled estimate.
_RATES = {"opus": (15.0, 75.0), "sonnet": (3.0, 15.0)}


def _rate(model: str | None) -> tuple[float, float]:
    if not model:
        return (0.0, 0.0)
    m = model.lower()
    if "opus" in m:
        return _RATES["opus"]
    if "sonnet" in m:
        return _RATES["sonnet"]
    return (0.0, 0.0)


class DayCount(BaseModel):
    date: str
    count: int


class StatsResponse(BaseModel):
    total: int
    by_status: dict[str, int]
    by_type: dict[str, int]
    by_source: dict[str, int]
    top_categories: list[TagCount]
    tokens_input: int
    tokens_output: int
    estimated_cost_usd: float
    per_day: list[DayCount]


@router.get("/stats", response_model=StatsResponse)
async def stats(session: AsyncSession = Depends(get_session)) -> StatsResponse:
    rows = (await session.execute(select(Item))).scalars().all()
    by_status: dict[str, int] = defaultdict(int)
    by_type: dict[str, int] = defaultdict(int)
    by_source: dict[str, int] = defaultdict(int)
    by_cat: dict[str, int] = defaultdict(int)
    per_day_raw: dict[str, int] = defaultdict(int)
    tokens_in = tokens_out = 0
    cost = 0.0
    today = utcnow().date()

    for it in rows:
        by_status[it.status] += 1
        by_type[it.content_type] += 1
        by_source[it.source] += 1
        if it.category:
            by_cat[it.category] += 1
        delta = (today - it.created_at.date()).days
        if 0 <= delta < 14:
            per_day_raw[it.created_at.date().isoformat()] += 1
        if it.token_usage:
            try:
                u = json.loads(it.token_usage)
                i = int(u.get("input_tokens") or 0)
                o = int(u.get("output_tokens") or 0)
                tokens_in += i
                tokens_out += o
                ri, ro = _rate(it.model_used)
                cost += i / 1e6 * ri + o / 1e6 * ro
            except (json.JSONDecodeError, TypeError, ValueError):
                pass

    top = sorted(by_cat.items(), key=lambda kv: (-kv[1], kv[0]))[:8]
    per_day = [
        DayCount(
            date=(today - timedelta(days=k)).isoformat(),
            count=per_day_raw.get((today - timedelta(days=k)).isoformat(), 0),
        )
        for k in range(13, -1, -1)
    ]

    return StatsResponse(
        total=len(rows),
        by_status=dict(by_status),
        by_type=dict(by_type),
        by_source=dict(by_source),
        top_categories=[TagCount(name=n, count=c) for n, c in top],
        tokens_input=tokens_in,
        tokens_output=tokens_out,
        estimated_cost_usd=round(cost, 4),
        per_day=per_day,
    )
