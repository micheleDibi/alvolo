"""Local speech-to-text via faster-whisper.

The model is loaded lazily on first use and cached. faster-whisper is an optional
dependency: if it (or its model) is unavailable, transcription degrades to an empty
string and the capture still flows through enrichment — consistent with the app's
mock-friendly philosophy.
"""

from __future__ import annotations

import asyncio
import logging
import os
import tempfile

from ..config import settings

logger = logging.getLogger("alvolo.audio")

_model = None
_unavailable = False


def _load():
    global _model, _unavailable
    if _model is not None or _unavailable:
        return _model
    try:
        from faster_whisper import WhisperModel

        _model = WhisperModel(settings.whisper_model, device="cpu", compute_type="int8")
        logger.info("faster-whisper model '%s' loaded", settings.whisper_model)
    except Exception as exc:  # noqa: BLE001 - any failure -> degrade, don't crash the worker
        logger.warning("faster-whisper unavailable (%s) — audio will not be transcribed", exc)
        _unavailable = True
        _model = None
    return _model


def _transcribe_sync(data: bytes, suffix: str) -> str:
    model = _load()
    if model is None:
        return ""
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as fh:
        fh.write(data)
        path = fh.name
    try:
        segments, _info = model.transcribe(path, vad_filter=True)
        return " ".join(seg.text.strip() for seg in segments).strip()
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


async def transcribe(data: bytes, mime: str) -> str:
    """Transcribe audio bytes to text (CPU-bound work runs off the event loop)."""
    ext = (mime.split("/")[-1].split(";")[0] or "webm").strip()
    return await asyncio.to_thread(_transcribe_sync, data, f".{ext}")
