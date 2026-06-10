"""Fetch + extract readable content from a link before sending it to Claude.

Uses trafilatura (sync, run in a thread) to pull the main article text, falling back to
the page <title>/meta description via httpx when extraction fails (paywalls, JS-heavy
sites). Never raises for network/parse problems — returns a best-effort result.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

import httpx

from ..config import settings


@dataclass
class ExtractResult:
    text: str | None          # cleaned main content (None if extraction failed)
    title: str | None
    description: str | None
    ok: bool                  # True if we got substantial body text


def _extract_sync(url: str) -> ExtractResult:
    import trafilatura
    from trafilatura.metadata import extract_metadata

    title = description = None
    body = None
    try:
        downloaded = trafilatura.fetch_url(url)
    except Exception:  # noqa: BLE001 - any network/url error -> fallback
        downloaded = None

    if downloaded:
        try:
            body = trafilatura.extract(
                downloaded, include_comments=False, include_tables=False, favor_recall=True
            )
        except Exception:  # noqa: BLE001
            body = None
        try:
            meta = extract_metadata(downloaded)
            if meta is not None:
                title = meta.title
                description = meta.description
        except Exception:  # noqa: BLE001
            pass

    ok = bool(body and len(body.strip()) >= 100)
    return ExtractResult(text=body if ok else None, title=title, description=description, ok=ok)


async def _fallback_title(url: str) -> ExtractResult:
    """Last-resort fetch of <title> + meta description when trafilatura got nothing."""
    try:
        async with httpx.AsyncClient(
            timeout=settings.fetch_timeout_seconds, follow_redirects=True
        ) as client:
            resp = await client.get(url, headers={"User-Agent": "AlVoloBot/0.1"})
            html = resp.text
    except Exception:  # noqa: BLE001
        return ExtractResult(text=None, title=None, description=None, ok=False)

    import re

    title = None
    m = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
    if m:
        title = re.sub(r"\s+", " ", m.group(1)).strip()[:300]
    desc = None
    m = re.search(
        r'<meta[^>]+name=["\']description["\'][^>]+content=["\'](.*?)["\']',
        html,
        re.IGNORECASE | re.DOTALL,
    )
    if m:
        desc = re.sub(r"\s+", " ", m.group(1)).strip()[:500]
    return ExtractResult(text=None, title=title, description=desc, ok=False)


async def fetch_and_extract(url: str) -> ExtractResult:
    result = await asyncio.to_thread(_extract_sync, url)
    if result.ok or result.title:
        return result
    return await _fallback_title(url)
