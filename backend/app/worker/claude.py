"""Anthropic Claude client wrapper for enrichment.

Structured output is obtained via a single FORCED tool call (tool_choice). This is the
most portable way to guarantee a valid JSON object across SDK versions — we read the
`tool_use` block's `input`, which the API validates against the tool's input_schema.

If ANTHROPIC_API_KEY is unset, a deterministic MOCK enrichment is returned instead, so
the full capture -> worker -> done pipeline can be exercised locally without a key/cost.
"""

from __future__ import annotations

import asyncio
import base64

from ..config import settings
from ..schemas import ENRICHMENT_TOOL_SCHEMA
from . import images


class EnrichmentError(Exception):
    """Base class for enrichment failures."""


class TransientEnrichmentError(EnrichmentError):
    """Temporary failure (rate limit, 5xx, timeout) — safe to retry."""


class FatalEnrichmentError(EnrichmentError):
    """Permanent failure (refusal, bad request, decode) — do not retry."""


SYSTEM_PROMPT = (
    "You are the enrichment engine for 'AlVolo', a personal quick-capture inbox. "
    "The user throws in screenshots, links and quick notes 'on the fly' and you turn each "
    "one into a useful, well-organised entry they can review later.\n\n"
    "For every item produce, by calling the save_enrichment tool:\n"
    "- title: a short, specific title.\n"
    "- summary: 2-4 sentences capturing the essence.\n"
    "- category: one short lowercase category (e.g. tech, idea, article, recipe, finance, travel, work, health).\n"
    "- tags: 3-6 lowercase topical tags.\n"
    "- key_points: the main takeaways as short bullet strings.\n"
    "- related_ideas: follow-up angles, questions worth exploring, or related resources to look up.\n"
    "- deep_analysis: a few paragraphs of genuinely useful deeper analysis — context, why it "
    "matters, connections, and what the user might do next.\n"
    "- extracted_text: for images, ALL text you can read from the image (OCR); for links, the "
    "cleaned main content if provided; otherwise null.\n"
    "- action_items: concrete to-dos the user might act on, as short imperative strings "
    "(e.g. 'Comprare il caffè', 'Leggere l'articolo'); empty array if there is nothing actionable.\n\n"
    "Be concise but substantive. Always write in the same language as the captured content. "
    "Never invent facts you cannot infer from the content; if information is missing, say so."
)

_TOOL = {
    "name": "save_enrichment",
    "description": "Save the structured enrichment for the captured item.",
    "input_schema": ENRICHMENT_TOOL_SCHEMA,
}

_client = None  # lazy AsyncAnthropic


def _get_client():
    global _client
    if _client is None:
        from anthropic import AsyncAnthropic

        _client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


def _mock_enrichment(kind: str, hint: str) -> dict:
    snippet = (hint or "").strip().replace("\n", " ")
    snippet = (snippet[:120] + "…") if len(snippet) > 120 else snippet
    return {
        "title": f"[mock] {snippet or kind.capitalize() + ' capture'}",
        "summary": (
            "Mock enrichment (no ANTHROPIC_API_KEY set). This placeholder lets you test the "
            "full capture and background pipeline without calling the API."
        ),
        "category": "mock",
        "tags": ["mock", kind],
        "key_points": ["Set ANTHROPIC_API_KEY to enable real enrichment."],
        "related_ideas": ["Wire up a real Anthropic key in the environment."],
        "deep_analysis": (
            "This item was processed by the mock enricher. The worker, queue, status "
            "transitions and the UI all behave exactly as in production — only the AI output is "
            "synthetic. Provide an API key to get real titles, summaries and analysis."
        ),
        "extracted_text": hint or None,
        "action_items": ["[mock] Configura ANTHROPIC_API_KEY", "[mock] Rivedi questo elemento"],
    }


ASK_SYSTEM = (
    "You are the assistant of 'AlVolo', a personal quick-capture inbox. Answer the user's "
    "question using ONLY the captured items provided as context. Be concise and genuinely "
    "useful. Always answer in the same language as the question. Cite the items you rely on "
    "inline as [n], using their number in the context. If the captures do not contain enough "
    "to answer, say so plainly instead of inventing facts."
)


def _mock_answer(question: str) -> str:
    return (
        "[mock] Senza ANTHROPIC_API_KEY rispondo in modalità demo: ho recuperato dalla tua "
        f"inbox gli elementi più pertinenti alla domanda «{question.strip()}» e te li mostro "
        "qui sotto come fonti. Configura la chiave Anthropic per ottenere risposte reali."
    )


async def answer(question: str, context: str) -> tuple[str, dict]:
    """Free-form Q&A grounded on captured items. Returns (answer_text, usage_dict)."""
    if not settings.anthropic_enabled:
        return _mock_answer(question), {}

    client = _get_client()
    try:
        import anthropic
    except ImportError as exc:  # pragma: no cover
        raise FatalEnrichmentError("anthropic SDK not installed") from exc

    try:
        message = await client.messages.create(
            model=settings.sonnet_model,
            max_tokens=settings.anthropic_max_tokens,
            system=[{"type": "text", "text": ASK_SYSTEM, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": f"{context}\n\nQuestion: {question}"}],
        )
    except (anthropic.RateLimitError, anthropic.APIConnectionError, anthropic.APITimeoutError) as exc:
        raise TransientEnrichmentError(str(exc)) from exc
    except anthropic.APIStatusError as exc:
        if exc.status_code and exc.status_code >= 500:
            raise TransientEnrichmentError(str(exc)) from exc
        raise FatalEnrichmentError(f"API error {exc.status_code}: {exc}") from exc
    except anthropic.APIError as exc:
        raise TransientEnrichmentError(str(exc)) from exc

    text = "".join(
        getattr(b, "text", "") for b in message.content if getattr(b, "type", None) == "text"
    ).strip()
    usage = {
        "input_tokens": getattr(message.usage, "input_tokens", None),
        "output_tokens": getattr(message.usage, "output_tokens", None),
    }
    return text or "(nessuna risposta)", usage


async def _run(model: str, content: list | str) -> tuple[dict, dict]:
    """Call Claude with a forced tool and return (enrichment_dict, usage_dict)."""
    client = _get_client()

    # Map the SDK's typed exceptions onto our transient/fatal taxonomy.
    try:
        import anthropic
    except ImportError as exc:  # pragma: no cover
        raise FatalEnrichmentError("anthropic SDK not installed") from exc

    try:
        message = await client.messages.create(
            model=model,
            max_tokens=settings.anthropic_max_tokens,
            system=[
                {"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}
            ],
            tools=[_TOOL],
            tool_choice={"type": "tool", "name": "save_enrichment"},
            messages=[{"role": "user", "content": content}],
        )
    except (anthropic.RateLimitError, anthropic.APIConnectionError, anthropic.APITimeoutError) as exc:
        raise TransientEnrichmentError(str(exc)) from exc
    except anthropic.APIStatusError as exc:
        if exc.status_code and exc.status_code >= 500:
            raise TransientEnrichmentError(str(exc)) from exc
        raise FatalEnrichmentError(f"API error {exc.status_code}: {exc}") from exc
    except anthropic.APIError as exc:  # catch-all for SDK errors
        raise TransientEnrichmentError(str(exc)) from exc

    if getattr(message, "stop_reason", None) == "refusal":
        raise FatalEnrichmentError("The model refused to process this content.")

    enrichment = None
    for block in message.content:
        if getattr(block, "type", None) == "tool_use" and block.name == "save_enrichment":
            enrichment = block.input
            break
    if enrichment is None:
        raise TransientEnrichmentError("Model did not return a save_enrichment tool call.")

    usage = {
        "input_tokens": getattr(message.usage, "input_tokens", None),
        "output_tokens": getattr(message.usage, "output_tokens", None),
        "cache_read_input_tokens": getattr(message.usage, "cache_read_input_tokens", None),
        "cache_creation_input_tokens": getattr(message.usage, "cache_creation_input_tokens", None),
    }
    return enrichment, usage


async def enrich_text(instruction: str, body: str) -> tuple[dict, dict, str]:
    """Text/link enrichment with Sonnet. Returns (enrichment, usage, model_used)."""
    model = settings.sonnet_model
    if not settings.anthropic_enabled:
        return _mock_enrichment("text", body), {}, "mock"
    enrichment, usage = await _run(model, f"{instruction}\n\n{body}")
    return enrichment, usage, model


async def enrich_image(image_bytes: bytes, mime: str, instruction: str) -> tuple[dict, dict, str]:
    """Image/screenshot enrichment with Opus vision. Returns (enrichment, usage, model_used)."""
    model = settings.opus_model
    if not settings.anthropic_enabled:
        return _mock_enrichment("image", instruction), {}, "mock"
    try:
        # Pillow work is CPU-bound: keep it off the event loop.
        image_bytes, mime = await asyncio.to_thread(
            images.prepare_for_vision, image_bytes, mime
        )
    except ValueError as exc:
        raise FatalEnrichmentError(str(exc)) from exc
    b64 = base64.standard_b64encode(image_bytes).decode("ascii")
    content = [
        {"type": "image", "source": {"type": "base64", "media_type": mime, "data": b64}},
        {"type": "text", "text": instruction},
    ]
    enrichment, usage = await _run(model, content)
    return enrichment, usage, model
