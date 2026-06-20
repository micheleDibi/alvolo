"""Server-Sent Events stream: pushes item changes so the UI can drop polling.

EventSource can't send an Authorization header, so the token is passed as a query
param (acceptable for a single-user, self-hosted app).
"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse

from ..config import settings
from ..events import broker

router = APIRouter(prefix="/api", tags=["events"])


@router.get("/events")
async def events(request: Request, token: str | None = Query(default=None)) -> StreamingResponse:
    if settings.auth_enabled and token != settings.capture_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid token."
        )

    async def gen():
        yield ": connected\n\n"
        q = broker.add()
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    data = await asyncio.wait_for(q.get(), timeout=20)
                    yield f"data: {data}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"  # keep the connection (and proxies) alive
        finally:
            broker.remove(q)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
