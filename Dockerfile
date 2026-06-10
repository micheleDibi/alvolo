# syntax=docker/dockerfile:1

# --- Stage 1: build the React PWA ----------------------------------------- #
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Output to a local dist/ (overrides the dev default of ../backend/app/static).
RUN VITE_OUT_DIR=dist npm run build

# --- Stage 2: python runtime ---------------------------------------------- #
FROM python:3.12-slim AS runtime
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DATA_DIR=/data \
    PORT=8000

WORKDIR /app/backend
COPY backend/ ./
# Editable install so the app runs from source and picks up the static dir we
# copy in next (a non-editable install would live in site-packages instead).
RUN pip install -e .

# Drop the built frontend where FastAPI serves it (app/static).
COPY --from=frontend /app/frontend/dist ./app/static

EXPOSE 8000
# Run migrations, then the single-process server (the in-process worker requires
# exactly one worker / one replica — do not raise --workers).
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers 1"]
