"""In-process background worker.

The `item` table IS the queue: rows with status=CAPTURING are the backlog. A single
asyncio task (started in the FastAPI lifespan) claims rows atomically, runs enrichment
under a concurrency semaphore with a per-item timeout, and writes the result back.

Durability without a broker: status lives in the DB, and on startup any row left in
PROCESSING (a crash mid-flight) is reset to CAPTURING (boot recovery).

IMPORTANT: this assumes exactly ONE worker, i.e. uvicorn --workers 1 and a single
replica. Running multiple processes would double-drain the queue.
"""

from __future__ import annotations

import asyncio
import json
import logging

from sqlalchemy import update
from sqlmodel import select

from ..config import settings
from ..db import SessionFactory
from ..models import Item, ItemStatus, utcnow
from ..schemas import EnrichmentResult, dumps_list
from . import claude
from .enrich import enrich_item
from .relate import find_related

logger = logging.getLogger("alvolo.worker")


class Worker:
    def __init__(self) -> None:
        # asyncio primitives are created in start() so they bind to the loop that is
        # actually running the app (not whatever loop happened to import this module).
        self._task: asyncio.Task | None = None
        self._stop: asyncio.Event | None = None
        self._sem: asyncio.Semaphore | None = None
        self._inflight: set[asyncio.Task] = set()

    async def start(self) -> None:
        self._stop = asyncio.Event()
        self._sem = asyncio.Semaphore(settings.worker_concurrency)
        self._inflight = set()
        await self._boot_recovery()
        self._task = asyncio.create_task(self._run(), name="alvolo-worker")
        logger.info("worker started (concurrency=%s)", settings.worker_concurrency)

    async def stop(self) -> None:
        if self._stop is not None:
            self._stop.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self._inflight:
            await asyncio.gather(*self._inflight, return_exceptions=True)
        logger.info("worker stopped")

    # --- internals ---------------------------------------------------------- #
    async def _boot_recovery(self) -> None:
        async with SessionFactory() as session:
            res = await session.execute(
                update(Item)
                .where(Item.status == ItemStatus.PROCESSING.value)
                .values(status=ItemStatus.CAPTURING.value, updated_at=utcnow())
            )
            await session.commit()
            if res.rowcount:
                logger.info("boot recovery: requeued %s stuck item(s)", res.rowcount)

    async def _sleep(self, seconds: float) -> None:
        """Sleep, but wake immediately if a stop was requested."""
        try:
            await asyncio.wait_for(self._stop.wait(), timeout=seconds)
        except asyncio.TimeoutError:
            pass

    async def _claim_next(self) -> str | None:
        async with SessionFactory() as session:
            oldest = (
                await session.execute(
                    select(Item.id)
                    .where(Item.status == ItemStatus.CAPTURING.value)
                    .order_by(Item.created_at)
                    .limit(1)
                )
            ).scalars().first()
            if oldest is None:
                return None
            res = await session.execute(
                update(Item)
                .where(Item.id == oldest, Item.status == ItemStatus.CAPTURING.value)
                .values(
                    status=ItemStatus.PROCESSING.value,
                    attempts=Item.attempts + 1,
                    updated_at=utcnow(),
                )
            )
            await session.commit()
            return oldest if res.rowcount == 1 else None

    async def _run(self) -> None:
        while not self._stop.is_set():
            await self._sem.acquire()
            if self._stop.is_set():
                self._sem.release()
                break
            try:
                item_id = await self._claim_next()
            except Exception:  # noqa: BLE001 - never let the loop die
                logger.exception("error while claiming next item")
                self._sem.release()
                await self._sleep(settings.worker_poll_seconds)
                continue

            if item_id is None:
                self._sem.release()
                await self._sleep(settings.worker_poll_seconds)
                continue

            task = asyncio.create_task(self._process(item_id))
            self._inflight.add(task)
            task.add_done_callback(self._on_done)

    def _on_done(self, task: asyncio.Task) -> None:
        self._inflight.discard(task)
        self._sem.release()
        if (exc := task.exception()) is not None and not isinstance(exc, asyncio.CancelledError):
            logger.error("process task crashed: %r", exc)

    async def _process(self, item_id: str) -> None:
        async with SessionFactory() as session:
            item = await session.get(Item, item_id)
            if item is None or item.status != ItemStatus.PROCESSING.value:
                return
            attempts = item.attempts

            try:
                enrichment, usage, model = await asyncio.wait_for(
                    enrich_item(item), timeout=settings.enrich_timeout_seconds
                )
                validated = EnrichmentResult(**enrichment)
            except asyncio.TimeoutError:
                await self._fail_or_retry(
                    session, item, attempts, transient=True, message="Enrichment timed out."
                )
                return
            except claude.FatalEnrichmentError as exc:
                await self._fail_or_retry(
                    session, item, attempts, transient=False, message=str(exc)
                )
                return
            except claude.TransientEnrichmentError as exc:
                await self._fail_or_retry(
                    session, item, attempts, transient=True, message=str(exc)
                )
                return
            except Exception as exc:  # noqa: BLE001 - unexpected -> treat as transient
                logger.exception("unexpected enrichment error for %s", item_id)
                await self._fail_or_retry(
                    session, item, attempts, transient=True, message=f"Unexpected error: {exc}"
                )
                return

            now = utcnow()
            item.status = ItemStatus.DONE.value
            item.title = validated.title
            item.summary = validated.summary
            item.category = validated.category
            item.tags = dumps_list(validated.tags)
            item.key_points = dumps_list(validated.key_points)
            item.related_ideas = dumps_list(validated.related_ideas)
            item.deep_analysis = validated.deep_analysis
            item.action_items = dumps_list(validated.action_items)
            if validated.extracted_text is not None:
                item.extracted_text = validated.extracted_text
            # Link to semantically-related items (tag/category overlap).
            related = await find_related(
                session, item.id, validated.tags, validated.category
            )
            item.related_item_ids = dumps_list(related)
            item.model_used = model
            item.token_usage = json.dumps(usage) if usage else None
            item.error_message = None
            item.enriched_at = now
            item.updated_at = now
            session.add(item)
            await session.commit()
            logger.info("enriched %s (%s) via %s", item_id, item.content_type, model)

    async def _fail_or_retry(
        self,
        session,
        item: Item,
        attempts: int,
        *,
        transient: bool,
        message: str,
    ) -> None:
        now = utcnow()
        item.last_error_at = now
        item.updated_at = now
        if transient and attempts < settings.max_attempts:
            # Back to the queue; a later tick will pick it up again.
            item.status = ItemStatus.CAPTURING.value
            logger.warning(
                "retry %s (attempt %s/%s): %s", item.id, attempts, settings.max_attempts, message
            )
        else:
            item.status = ItemStatus.FAILED.value
            item.error_message = message
            logger.warning("failed %s: %s", item.id, message)
        session.add(item)
        await session.commit()


# Module-level singleton used by the FastAPI lifespan.
worker = Worker()
