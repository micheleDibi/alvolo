"""Fit captured images into the Anthropic vision limits before the API call.

The API rejects any image whose BASE64 payload exceeds 10 MB (so ~7.8 MB of raw
bytes), and it downscales anything larger than ~1568px on the long edge server-side
anyway. Shrinking locally before the call therefore costs nothing in analysis
quality and guarantees the request is accepted — plus fewer input tokens and a
faster upload.
"""

from __future__ import annotations

import io

from PIL import Image, ImageOps

# The 10 MiB API limit applies to the base64-encoded payload; base64 encodes
# every 3 raw bytes as 4 characters, so the raw budget is 3/4 of that.
MAX_BASE64_BYTES = 10 * 1024 * 1024
MAX_RAW_BYTES = MAX_BASE64_BYTES // 4 * 3
# Claude's vision pipeline resizes to ~1568px on the long edge server-side, so
# sending anything larger only wastes bytes and tokens.
MAX_LONG_EDGE = 1568
# Decoding allocates ~3 bytes/pixel times ~3 transient copies. Without a cap, a
# tiny flat-color PNG with huge dimensions (a decompression bomb) passes the
# byte-size checks, OOM-kills the single-process app mid-decode, and the queue
# re-claims it after every restart. Pillow's own bomb threshold (~179M pixels)
# is far too high for a small VPS.
MAX_PIXELS = 50_000_000

# Formats the vision API accepts; anything else gets re-encoded as JPEG.
_API_MIMES = {"image/png", "image/jpeg", "image/gif", "image/webp"}
_JPEG_QUALITIES = (85, 75, 65, 50)
_MIN_LONG_EDGE = 64


def _flatten_to_rgb(img: Image.Image) -> Image.Image:
    """Convert to RGB, compositing any transparency onto white (screenshots with
    alpha would otherwise land on black and become unreadable)."""
    if img.mode in ("I", "I;16", "I;16B", "I;16L", "I;16N"):
        # 16-bit grayscale: convert("RGB") would clip 0-65535 at 255 and produce
        # an all-white image — rescale to 8-bit first. point() on integer modes
        # only supports linear transforms, hence the multiply (and the convert
        # to "I", since point() rejects the I;16 variants).
        return img.convert("I").point(lambda v: v * (1 / 256), mode="L").convert("RGB")
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        rgba = img.convert("RGBA")
        background = Image.new("RGB", rgba.size, (255, 255, 255))
        background.paste(rgba, mask=rgba.getchannel("A"))
        return background
    return img.convert("RGB")


def _scaled(img: Image.Image, long_edge: int) -> Image.Image:
    if max(img.size) <= long_edge:
        return img
    ratio = long_edge / max(img.size)
    size = (max(1, round(img.width * ratio)), max(1, round(img.height * ratio)))
    return img.resize(size, Image.LANCZOS)


def prepare_for_vision(
    data: bytes,
    mime: str,
    *,
    max_raw_bytes: int = MAX_RAW_BYTES,
    max_long_edge: int = MAX_LONG_EDGE,
    max_pixels: int = MAX_PIXELS,
) -> tuple[bytes, str]:
    """Return (image_bytes, mime) guaranteed to fit the vision API limits.

    Images already within both limits pass through untouched (with the mime
    normalised to what the bytes actually are). Anything else is resized to
    max_long_edge and re-encoded as JPEG, stepping quality (and, as a last
    resort, dimensions) down until it fits. Raises ValueError when the image
    cannot be processed or shrunk enough.
    """
    # Header-only probe: dimensions and real format, no pixel decode yet.
    try:
        with Image.open(io.BytesIO(data)) as probe:
            width, height = probe.size
            true_mime = Image.MIME.get(probe.format or "")
    except Exception:
        if len(data) <= max_raw_bytes:
            # Unreadable by Pillow but within the size budget: pass through and
            # let the API be the judge (capture already sniffed a known format).
            return data, mime
        raise ValueError("Image exceeds the size budget and could not be decoded.")

    if width * height > max_pixels:
        raise ValueError(
            f"Image too large to process safely ({width}x{height} = "
            f"{width * height} pixels, max {max_pixels})."
        )

    if (
        len(data) <= max_raw_bytes
        and max(width, height) <= max_long_edge
        and true_mime in _API_MIMES
    ):
        # The probe verified the real format, so don't echo a client-supplied
        # mime the API would reject as mismatched.
        return data, true_mime

    try:
        with Image.open(io.BytesIO(data)) as src:
            img = _flatten_to_rgb(ImageOps.exif_transpose(src))
            # also picks the first frame of animations
    except Exception as exc:
        raise ValueError(f"Could not process image: {exc}") from exc

    long_edge = min(max_long_edge, max(img.size))  # never upscale
    while True:
        resized = _scaled(img, long_edge)
        for quality in _JPEG_QUALITIES:
            buf = io.BytesIO()
            resized.save(buf, format="JPEG", quality=quality, optimize=True)
            if buf.tell() <= max_raw_bytes:
                return buf.getvalue(), "image/jpeg"
        if long_edge <= _MIN_LONG_EDGE:
            # Already tried at (or below) the floor — give up rather than loop.
            break
        long_edge = max(_MIN_LONG_EDGE, long_edge // 2)

    raise ValueError("Image could not be shrunk within the vision API limits.")
