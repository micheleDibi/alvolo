"""Web Push delivery (VAPID + pywebpush).

Degrades cleanly: if VAPID keys are unset or pywebpush isn't installed, notify() is a
no-op so the rest of the app is unaffected. Dead subscriptions (404/410) are pruned.
"""

from __future__ import annotations

import asyncio
import json
import logging

from sqlmodel import select

from .config import settings
from .db import SessionFactory
from .models import PushSubscription

logger = logging.getLogger("alvolo.push")


async def notify(title: str, body: str, url: str = "/") -> None:
    if not settings.push_enabled:
        return
    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        logger.info("pywebpush not installed — skipping push")
        return

    payload = json.dumps({"title": title, "body": body, "url": url})
    async with SessionFactory() as session:
        subs = (await session.execute(select(PushSubscription))).scalars().all()
        dead: list[PushSubscription] = []
        for s in subs:
            try:
                await asyncio.to_thread(
                    webpush,
                    subscription_info=json.loads(s.subscription),
                    data=payload,
                    vapid_private_key=settings.vapid_private_key,
                    vapid_claims={"sub": settings.vapid_subject},
                )
            except WebPushException as exc:  # noqa: PERF203
                code = getattr(getattr(exc, "response", None), "status_code", None)
                if code in (404, 410):
                    dead.append(s)
                else:
                    logger.warning("push failed: %s", exc)
            except Exception as exc:  # noqa: BLE001
                logger.warning("push error: %s", exc)
        for s in dead:
            await session.delete(s)
        if dead:
            await session.commit()
