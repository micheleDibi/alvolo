"""In-process pub/sub for Server-Sent Events.

Single-writer/single-worker assumption (uvicorn --workers 1): subscribers are plain
asyncio queues living in this one process; publishers push synchronously. This replaces
client polling with push updates (with the client falling back to polling if the stream
is unavailable).
"""

from __future__ import annotations

import asyncio
import json


class _Broker:
    def __init__(self) -> None:
        self._subs: set[asyncio.Queue[str]] = set()

    def add(self) -> "asyncio.Queue[str]":
        q: asyncio.Queue[str] = asyncio.Queue(maxsize=100)
        self._subs.add(q)
        return q

    def remove(self, q: "asyncio.Queue[str]") -> None:
        self._subs.discard(q)

    def publish(self, data: str) -> None:
        for q in list(self._subs):
            try:
                q.put_nowait(data)
            except asyncio.QueueFull:
                pass


broker = _Broker()


def publish_item(item_id: str, status: str) -> None:
    """Notify subscribers that an item changed (created / enriched / failed / updated)."""
    broker.publish(json.dumps({"type": "item", "id": item_id, "status": status}))
