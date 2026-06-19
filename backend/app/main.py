"""FastAPI application entrypoint.

Wires the lifespan (DB init, boot recovery, background worker), the API routers, rate
limiting, a health check, and — in production — serves the built React PWA as static
files with an SPA catch-all so client-side routes resolve to index.html.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from .api import ask, capture, items
from .auth import limiter
from .config import settings
from .db import engine, init_db
from .worker.queue import worker

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("alvolo")

# Directory holding the built frontend (populated at Docker build time).
STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await worker.start()
    if not settings.auth_enabled:
        logger.warning("AUTH DISABLED (CAPTURE_TOKEN is empty) — fine for local dev only.")
    if not settings.anthropic_enabled:
        logger.warning("ANTHROPIC_API_KEY unset — using MOCK enrichment.")
    try:
        yield
    finally:
        await worker.stop()
        # Drop pooled DB connections so a fresh lifespan (e.g. in tests) rebinds cleanly.
        await engine.dispose()


app = FastAPI(title="AlVolo", version="0.1.0", lifespan=lifespan)

# Rate limiting (slowapi).
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS: needed only for local dev (Vite dev server on a different port). Auth is via a
# bearer token in a header (not cookies), so a permissive origin policy is acceptable.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(capture.router)
app.include_router(items.router)
app.include_router(ask.router)


@app.get("/api/health", tags=["health"])
async def health() -> dict:
    return {"ok": True, "version": app.version, "enrichment": "mock" if not settings.anthropic_enabled else "anthropic"}


# --- static frontend (production) ----------------------------------------- #
if STATIC_DIR.exists():
    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str) -> FileResponse:
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found.")
        candidate = STATIC_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(STATIC_DIR / "index.html")
else:
    logger.info("static dir %s not found — serving API only (dev mode).", STATIC_DIR)
