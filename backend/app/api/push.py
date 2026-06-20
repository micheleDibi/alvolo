"""Web Push subscription management."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_auth
from ..config import settings
from ..db import get_session
from ..models import PushSubscription

router = APIRouter(prefix="/api/push", tags=["push"], dependencies=[Depends(require_auth)])


class SubscribeRequest(BaseModel):
    subscription: dict


class UnsubscribeRequest(BaseModel):
    endpoint: str


@router.get("/key")
async def key() -> dict:
    return {"enabled": settings.push_enabled, "key": settings.vapid_public_key}


@router.post("/subscribe")
async def subscribe(
    body: SubscribeRequest, session: AsyncSession = Depends(get_session)
) -> dict:
    endpoint = body.subscription.get("endpoint")
    if not endpoint:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid subscription.")
    existing = await session.get(PushSubscription, endpoint)
    if existing:
        existing.subscription = json.dumps(body.subscription)
        session.add(existing)
    else:
        session.add(
            PushSubscription(endpoint=endpoint, subscription=json.dumps(body.subscription))
        )
    await session.commit()
    return {"ok": True}


@router.post("/unsubscribe")
async def unsubscribe(
    body: UnsubscribeRequest, session: AsyncSession = Depends(get_session)
) -> dict:
    sub = await session.get(PushSubscription, body.endpoint)
    if sub:
        await session.delete(sub)
        await session.commit()
    return {"ok": True}
