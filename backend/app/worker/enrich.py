"""Per-item enrichment orchestration: branch on content type, call Claude, shape result."""

from __future__ import annotations

from ..models import ContentType, Item
from . import claude, extract


async def enrich_item(item: Item) -> tuple[dict, dict, str]:
    """Produce (enrichment_dict, usage_dict, model_used) for an item.

    Raises claude.FatalEnrichmentError / TransientEnrichmentError on failure.
    """
    if item.content_type == ContentType.TEXT.value:
        instruction = "The user captured this quick note/idea. Enrich it:"
        return await claude.enrich_text(instruction, item.raw_text or "")

    if item.content_type == ContentType.LINK.value:
        url = item.source_url or ""
        result = await extract.fetch_and_extract(url)
        if result.ok and result.text:
            body = (
                f"URL: {url}\n"
                f"Page title: {result.title or '(unknown)'}\n\n"
                f"Main content:\n{result.text}"
            )
        else:
            body = (
                f"URL: {url}\n"
                f"Page title: {result.title or '(unknown)'}\n"
                f"Meta description: {result.description or '(none)'}\n"
                "(Full page content could not be extracted — analyse based on the URL, title "
                "and description.)"
            )
        instruction = "The user saved this web link. Analyse and enrich it:"
        enrichment, usage, model = await claude.enrich_text(instruction, body)
        # Surface the cleaned article body for the reader view when we have it.
        if result.ok and result.text:
            enrichment["extracted_text"] = result.text
        return enrichment, usage, model

    if item.content_type == ContentType.PDF.value:
        if not item.file_filename:
            raise claude.FatalEnrichmentError("PDF item is missing its file.")
        from .. import storage

        try:
            pdf_bytes = storage.read_file(item.file_filename)
        except FileNotFoundError as exc:
            raise claude.FatalEnrichmentError("PDF file not found on disk.") from exc
        instruction = (
            "The user captured this PDF document. Read it, then enrich it; put a faithful "
            "excerpt of the key text into extracted_text."
        )
        return await claude.enrich_pdf(pdf_bytes, instruction)

    if item.content_type == ContentType.IMAGE.value:
        if not item.image_filename or not item.image_mime:
            raise claude.FatalEnrichmentError("Image item is missing its file.")
        from .. import storage

        try:
            image_bytes = storage.read_image(item.image_filename)
        except FileNotFoundError as exc:
            raise claude.FatalEnrichmentError("Image file not found on disk.") from exc
        instruction = (
            "The user captured this image/screenshot. First read ALL text in it (OCR) into "
            "extracted_text, then describe what it shows, then enrich it."
        )
        return await claude.enrich_image(image_bytes, item.image_mime, instruction)

    raise claude.FatalEnrichmentError(f"Unknown content type: {item.content_type}")
