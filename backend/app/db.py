"""Async database engine, session factory and initialisation.

SQLite is used in WAL mode with a busy timeout. The single-writer assumption holds
because the app runs as one process (uvicorn --workers 1) and the only writer is the
request handlers + the single in-process worker task.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel

from .config import settings

_is_sqlite = settings.resolved_database_url.startswith("sqlite")

# WAL mode lets many readers coexist with the single writer, so the default
# connection pool is fine. For non-sqlite (future Postgres) the default pool is used too.
_engine_kwargs: dict = {"echo": False}
if _is_sqlite:
    _engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_async_engine(settings.resolved_database_url, **_engine_kwargs)


if _is_sqlite:

    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, _record):  # noqa: ANN001
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionFactory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db() -> None:
    """Ensure data dir + uploads exist and create tables if missing.

    Schema management is owned by Alembic in real deployments; create_all here is a
    convenience for local/dev and is idempotent (it never drops or alters).
    """
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)

    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionFactory() as session:
        yield session
