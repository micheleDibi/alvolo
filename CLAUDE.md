# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

AlVolo is a self-hosted "quick-capture inbox": the API ingests text/links/images instantly (HTTP 202), and an in-process worker enriches them with Claude in the background. Backend is Python/FastAPI + SQLite; frontend is a React/Vite PWA. The README (Italian) covers product/deploy; this file covers how the code fits together.

## Regole di design
Per ogni task di UI: consulta sempre la skill ui-ux-pro-max per
definire/usare il design system del progetto, e usa il Magic MCP
per generare i componenti concreti. Mantieni coerenza di palette,
font e spacing su tutte le pagine. Default stack: Backend

  - Python 3.12
  - FastAPI (uvicorn[standard] come server ASGI)
  - SQLModel su SQLite in modalità WAL — la tabella Item fa anche da coda di lavoro (niente broker)
  - aiosqlite + greenlet per l'accesso async al DB
  - Alembic per le migrazioni dello schema
  - Pydantic v2 + pydantic-settings per config/validazione
  - Worker asyncio in-process (nessun Celery/Redis): arricchimento in background con semaforo di
  concorrenza
  - python-multipart (upload immagini), slowapi (rate limiting), httpx + trafilatura (fetch + estrazione
  testo dai link)

  AI

  - Anthropic Claude (SDK anthropic) con output strutturato via forced tool call
    - claude-opus-4-8 → immagini (vision / OCR)
    - claude-sonnet-4-6 → testo e link
  - Fallback mock automatico se manca ANTHROPIC_API_KEY

  Frontend

  - React 18 + TypeScript + Vite 5
  - TanStack Query v5 (React Query) — polling dinamico dello stato
  - React Router v6
  - PWA via vite-plugin-pwa (installabile su iPhone, service worker con caching)

  Infra / Deploy

  - Docker multi-stage (build del frontend → bundle dentro l'immagine backend, servito come SPA statica)
  - Docker Compose, single-container / single-worker, volume persistente alvolo_data
  - Reverse proxy + HTTPS esterno (Caddy consigliato, o nginx+certbot)
  - iOS Shortcut per la cattura dal menu Condividi

  Tooling

  - Test: pytest + pytest-asyncio
  - Type-check: tsc (dentro npm run build) — nessun linter/formatter configurato
.
Evita output generici: preferisci gradienti, glassmorphism e
micro-animazioni dove sensato, senza sacrificare accessibilità
e performance.

## Commands

All backend commands run from `backend/`. Most need `DATA_DIR` set (DB + uploads live there).

```bash
# Backend setup — NOTE: the [dev] extra is required for tests (README's bare
# `pip install -e .` does NOT install pytest).
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

# Migrate (env.py injects the URL from DATA_DIR; sqlalchemy.url in alembic.ini is blank by design)
DATA_DIR=./data alembic upgrade head

# Run dev server (must stay single-worker — see invariants)
DATA_DIR=./data uvicorn app.main:app --reload --port 8000

# Tests (pytest config lives in pyproject.toml: asyncio_mode=auto, testpaths=["tests"])
pytest                                         # all
pytest tests/test_api.py::test_full_flow -xvs  # a single test, verbose
DATA_DIR=./data alembic revision --autogenerate -m "msg"  # new migration after model changes
```

```bash
# Frontend (from frontend/)
npm install
npm run dev      # :5173, proxies /api -> http://127.0.0.1:8000 (override VITE_API_PROXY)
npm run build    # `tsc -b && vite build`; outputs to ../backend/app/static so uvicorn serves the SPA
```

```bash
# Full app in one container (builds frontend into the backend image)
docker compose up -d --build
docker compose logs -f app
```

**There is no linter/formatter** (no ruff, eslint, or prettier). Type-checking is the only static gate and runs via `tsc -b` inside `npm run build`. Don't suggest a lint step that doesn't exist.

## Architecture

### The Item table *is* the queue — there is no broker
This is the single most important design fact and it spans `models.py`, `db.py`, `worker/queue.py`, and `api/capture.py`. An `Item` row carries a `status` that doubles as queue state:

```
capturing ──(worker claims)──▶ processing ──(enrich ok)──▶ done
    ▲                              │
    └──── (transient error) ───────┴──(fatal error / attempts exhausted)──▶ failed
```

- **Claiming is an atomic CAS**: `Worker._claim_next()` does `UPDATE item SET status='processing', attempts=attempts+1 WHERE id=? AND status='capturing'` and only proceeds if `rowcount == 1`. That `WHERE status='capturing'` *is* the lock — it is the entire concurrency-safety story, and it only holds because there is exactly one writer.
- **Crash recovery**: on startup the worker resets any `processing` rows back to `capturing` (boot recovery), so an item being enriched when the process died gets retried. This is unguarded by any lock — it assumes single-writer too.
- **Durability over latency in the request path**: `capture.py` saves the image to disk *and* inserts the row before returning 202; enrichment is fully deferred to the worker.

### The enrichment pipeline (`worker/`)
`queue.py` (loop, semaphore, retry) → `enrich.py` (branch by content type) → `claude.py` (API call) / `extract.py` (link fetch).

- **Per-type model + handling**: images → `OPUS_MODEL` (vision/OCR); text & links → `SONNET_MODEL`. Links are fetched first via `extract.fetch_and_extract()` (trafilatura in a thread, httpx fallback for title/meta); it **never raises** — returns a best-effort `ExtractResult`.
- **Structured output**: Claude is called with a single *forced* tool call (`tool_choice`) against `ENRICHMENT_TOOL_SCHEMA`; the result dict is validated with `EnrichmentResult(**...)` and merged into the Item atomically on success.
- **Concurrency & timeouts**: an `asyncio.Semaphore` (`WORKER_CONCURRENCY`, default 2) caps parallel enrichments; `asyncio.wait_for(..., enrich_timeout)` wraps the *whole* enrichment (link fetch included), not just the API call. Poll interval is ~2s.
- **Transient vs fatal**: timeouts / rate limits / 5xx requeue to `capturing` (until `max_attempts`, default 3); refusals / 4xx / decode errors fail immediately. `attempts` increments on *claim*, so a mid-flight crash still consumes a retry.

### Two env-driven behavior switches (easy to miss)
Both degrade silently — always check these first when "it captures but nothing enriches" or "auth isn't working":
- **`ANTHROPIC_API_KEY` empty ⇒ mock enrichment.** `claude._mock_enrichment()` runs instead of the real API; the full pipeline (capture → worker → done → UI) works with placeholder content. `/api/health` reports the mode.
- **`CAPTURE_TOKEN` empty ⇒ auth disabled.** `require_auth` accepts `Authorization: Bearer` *or* `X-API-Key` (timing-safe compare). Auth is gated on `bool(capture_token)`, so any non-empty string — including `"false"` or `"0"` — *enables* auth.

### Data-model conventions
`models.py` defines enums (`ItemStatus`, `ContentType`) but the DB stores their `.value` **strings** (`'capturing'`, `'image'`), not typed enums — so WHERE clauses compare against `ItemStatus.CAPTURING.value`, and `schemas.py` re-types them for the API. List-ish fields (`tags`, `key_points`, `related_ideas`, `token_usage`) are **JSON-encoded TEXT columns**, serialized/parsed only in the schema layer — never round-trip them as Python lists through the ORM. Images are abstracted behind `storage.py` (`save_image`/`image_path`/`delete_image`); deletion cascades in the route, not via a DB FK, so abnormal shutdowns can orphan files.

### Frontend ↔ backend contract
- **Live status via dynamic polling**: TanStack Query's `refetchInterval` is a *callback* that returns `3000` only while items are still `capturing`/`processing`, else `false` — polling stops once everything is `done`. Don't replace it with a static interval.
- **Token**: stored in `localStorage['alvolo_token']`, attached as `Bearer` by `authHeaders()` on every request.
- **Authed images**: a plain `<img>` can't send headers, so `AuthImage` fetches the image as a blob with the token and renders an object URL (and revokes it on unmount).
- **PWA**: `vite-plugin-pwa` with `navigateFallbackDenylist: [/^\/api\//]` (SPA fallback must not swallow API calls), `NetworkFirst` for `/api/items`, `CacheFirst` for images.

### Build & deploy topology
The frontend is **bundled into the backend image** and served as a static SPA — there is no separate frontend deployment. Locally `npm run build` writes to `../backend/app/static`; the Dockerfile overrides `VITE_OUT_DIR=dist` and copies that into `app/static`. `main.py` serves the SPA **only if `STATIC_DIR` exists** — a missing/failed frontend build silently yields an API-only server, no error. The container `CMD` runs `alembic upgrade head` then uvicorn `--workers 1`. `APP_PORT` changes the host port only; the container is always `:8000` internally. Everything persists in the `alvolo_data` volume (`/data`: SQLite DB, WAL, `uploads/`).

## Critical invariants (don't break these)

- **Single worker, single replica — non-negotiable.** `uvicorn --workers 1`, one container. SQLite + the in-process worker + the atomic-claim lock all assume exactly one writer; more processes double-drain the queue and race the DB. WAL mode does not save you here.
- **Async primitives (`Event`, `Semaphore`) are created in `Worker.start()`, not at import/`__init__`** — they must bind to the running event loop. Don't move them to module scope.
- **`get_settings()` is `@lru_cache`d** — `.env` edits require an app restart; settings won't hot-reload.
- **Keep `DATA_DIR` and any explicit `DATABASE_URL` pointing at the same place** — mismatching them silently breaks volume persistence.
