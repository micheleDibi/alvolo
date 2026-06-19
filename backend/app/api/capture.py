"""The 'al volo' capture endpoint.

POST /api/capture accepts BOTH multipart/form-data (used by the iOS Shortcut) and
application/json (used by the in-app composer). It detects the content type, persists
the raw input instantly (image bytes to disk), inserts an item in CAPTURING state and
returns 202 immediately. No Claude call happens in the request path — the in-process
worker drains CAPTURING rows in the background.
"""

from __future__ import annotations

import base64
import binascii

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import limiter, require_auth
from ..config import settings
from ..db import get_session
from ..models import ContentType, Item, ItemStatus, new_id
from ..schemas import CaptureResponse
from .. import storage

router = APIRouter(prefix="/api", tags=["capture"])


def _sniff_mime(data: bytes) -> str | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def _decode_base64(value: str) -> bytes:
    # Tolerate data-URI prefixes and whitespace/newlines (the Shortcut 'Standard'
    # encoding wraps lines; we accept it but document 'None' as the correct setting).
    if value.startswith("data:") and "," in value:
        value = value.split(",", 1)[1]
    value = "".join(value.split())
    try:
        return base64.b64decode(value, validate=False)
    except (binascii.Error, ValueError) as exc:  # pragma: no cover - defensive
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not decode base64 image.",
        ) from exc


def _validate_image(data: bytes, mime: str | None) -> str:
    if len(data) > settings.max_image_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image too large (max {settings.max_image_bytes // (1024 * 1024)}MB).",
        )
    resolved = mime or _sniff_mime(data)
    if resolved not in settings.allowed_image_mimes:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported image type: {resolved or 'unknown'}.",
        )
    return resolved


@router.post("/capture", status_code=status.HTTP_202_ACCEPTED, response_model=CaptureResponse)
@limiter.limit("60/minute")
async def capture(
    request: Request,
    session: AsyncSession = Depends(get_session),
    _: None = Depends(require_auth),
) -> CaptureResponse:
    text: str | None = None
    url: str | None = None
    title: str | None = None
    source = "app"
    image_data: bytes | None = None
    image_mime: str | None = None

    ctype = request.headers.get("content-type", "")

    if "application/json" in ctype:
        body = await request.json()
        if not isinstance(body, dict):
            raise HTTPException(status_code=422, detail="JSON body must be an object.")
        text = (body.get("text") or None)
        url = (body.get("url") or None)
        title = (body.get("title") or None)
        source = body.get("source") or "app"
        b64 = body.get("image")
        if b64:
            image_data = _decode_base64(str(b64))
            image_mime = body.get("image_mime")
    else:
        form = await request.form()
        text = (form.get("text") or None)
        url = (form.get("url") or None)
        title = (form.get("title") or None)
        source = form.get("source") or "app"
        image_field = form.get("image")
        if image_field is not None and hasattr(image_field, "read"):
            # UploadFile (preferred path: the Shortcut sends the file directly)
            image_data = await image_field.read()
            image_mime = getattr(image_field, "content_type", None)
        elif isinstance(image_field, str) and image_field.strip():
            # base64 string fallback
            image_data = _decode_base64(image_field)

    # Normalise empty strings.
    text = text.strip() if isinstance(text, str) else None
    url = url.strip() if isinstance(url, str) else None
    title = title.strip() if isinstance(title, str) else None

    # Determine content type with precedence image > pdf > link > text. An uploaded
    # file arrives in `image_data`; we sniff PDFs so the same field carries either.
    item_id = new_id()
    image_filename: str | None = None
    file_filename: str | None = None
    file_mime: str | None = None
    is_pdf = bool(image_data) and (image_data[:5] == b"%PDF-" or image_mime == "application/pdf")
    is_audio = bool(image_data) and bool(image_mime) and image_mime.split(";")[0].startswith("audio/")

    if image_data and is_pdf:
        if len(image_data) > settings.max_image_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File too large (max {settings.max_image_bytes // (1024 * 1024)}MB).",
            )
        file_mime = "application/pdf"
        file_filename = storage.save_file(item_id, image_data, file_mime)
        content_type = ContentType.PDF
    elif image_data and is_audio:
        if len(image_data) > settings.max_image_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File too large (max {settings.max_image_bytes // (1024 * 1024)}MB).",
            )
        file_mime = image_mime.split(";")[0]
        file_filename = storage.save_file(item_id, image_data, file_mime)
        content_type = ContentType.AUDIO
    elif image_data:
        image_mime = _validate_image(image_data, image_mime)
        image_filename = storage.save_image(item_id, image_data, image_mime)
        content_type = ContentType.IMAGE
    elif url:
        content_type = ContentType.LINK
    elif text:
        content_type = ContentType.TEXT
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide at least one of: text, url, image, pdf.",
        )

    item = Item(
        id=item_id,
        content_type=content_type.value,
        status=ItemStatus.CAPTURING.value,
        source=source if source in ("app", "shortcut", "extension") else "app",
        raw_text=text,
        source_url=url,
        title=title,  # optional hint; the enricher will overwrite with a better title
        image_filename=image_filename,
        image_mime=image_mime,
        file_filename=file_filename,
        file_mime=file_mime,
    )
    session.add(item)
    await session.commit()

    return CaptureResponse(id=item.id, status=ItemStatus.CAPTURING, content_type=content_type)
