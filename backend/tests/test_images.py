"""Unit tests for the vision-limit image preparation (worker/images.py)."""

import base64
import io
import random

import pytest
from PIL import Image

from app.worker.images import (
    MAX_BASE64_BYTES,
    MAX_LONG_EDGE,
    MAX_RAW_BYTES,
    prepare_for_vision,
)

_RNG = random.Random(0)  # deterministic noise (incompressible, so sizes are stable)


def _png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _noise(mode: str, size: tuple[int, int]) -> Image.Image:
    channels = len(mode)
    return Image.frombytes(mode, size, bytes(_RNG.randbytes(size[0] * size[1] * channels)))


def test_small_image_passes_through_untouched():
    data = _png_bytes(Image.new("RGB", (100, 80), (10, 200, 30)))
    out, mime = prepare_for_vision(data, "image/png")
    assert out == data
    assert mime == "image/png"


def test_passthrough_normalises_lying_client_mime():
    # JPEG bytes declared as PNG: the API rejects mismatched media_type, so the
    # pass-through must return what the bytes actually are.
    buf = io.BytesIO()
    Image.new("RGB", (100, 80), (10, 200, 30)).save(buf, format="JPEG")
    out, mime = prepare_for_vision(buf.getvalue(), "image/png")
    assert out == buf.getvalue()
    assert mime == "image/jpeg"


def test_oversized_dimensions_resized_to_long_edge():
    data = _png_bytes(Image.new("RGB", (4000, 1000), (10, 200, 30)))
    out, mime = prepare_for_vision(data, "image/png")
    assert mime == "image/jpeg"
    with Image.open(io.BytesIO(out)) as img:
        assert max(img.size) <= MAX_LONG_EDGE
        # Aspect ratio preserved (4:1).
        assert abs(img.width / img.height - 4.0) < 0.05


def test_default_budget_fits_base64_limit():
    # Regression for the production bug: the 10 MiB API limit applies to the
    # BASE64 payload. This noise PNG is ~9.8MB raw (under 10 MiB, within the
    # 1568px edge) but its base64 is ~13MB — with a naive 10 MiB raw budget it
    # would pass through untouched and the API would reject it again.
    data = _png_bytes(_noise("RGBA", (MAX_LONG_EDGE, MAX_LONG_EDGE)))
    assert len(data) > MAX_RAW_BYTES  # premise: over the raw budget
    out, mime = prepare_for_vision(data, "image/png")
    assert mime == "image/jpeg"
    assert len(base64.standard_b64encode(out)) <= MAX_BASE64_BYTES


def test_byte_budget_enforced_by_stepping_down():
    # Random noise compresses poorly, forcing the quality/dimension loop to work.
    data = _png_bytes(_noise("RGB", (1200, 900)))
    budget = 60_000
    out, mime = prepare_for_vision(data, "image/png", max_raw_bytes=budget)
    assert mime == "image/jpeg"
    assert len(out) <= budget


def test_tiny_long_edge_over_budget_still_encoded():
    # A <64px image over the byte budget must still get its one encode attempt
    # at native size (the 64px floor bounds the halving, it must not skip
    # encoding entirely).
    data = _png_bytes(_noise("RGB", (60, 60)))
    budget = 5_000
    assert len(data) > budget
    out, mime = prepare_for_vision(data, "image/png", max_raw_bytes=budget)
    assert mime == "image/jpeg"
    assert len(out) <= budget
    with Image.open(io.BytesIO(out)) as img:
        assert img.size == (60, 60)  # never upscaled


def test_loop_exhaustion_on_valid_image_raises():
    # Budget below the minimum JPEG container size: every quality/dimension
    # step fails and the terminal "could not be shrunk" error must fire.
    data = _png_bytes(_noise("RGB", (64, 48)))
    with pytest.raises(ValueError):
        prepare_for_vision(data, "image/png", max_raw_bytes=100)


def test_pixel_bomb_rejected_before_decode():
    # Hugely-dimensioned images must be refused from the header probe alone,
    # before any pixel decode (a flat-color bomb is tiny on disk but allocates
    # gigabytes when decoded).
    data = _png_bytes(Image.new("RGB", (200, 100), (10, 200, 30)))
    with pytest.raises(ValueError, match="too large"):
        prepare_for_vision(data, "image/png", max_pixels=10_000)


def test_transparency_flattened_onto_white():
    # Fully transparent red: naive RGB conversion would leave red (or black);
    # the correct flatten composites onto white.
    rgba = Image.new("RGBA", (2000, 100), (255, 0, 0, 0))
    out, _ = prepare_for_vision(_png_bytes(rgba), "image/png")
    with Image.open(io.BytesIO(out)) as img:
        r, g, b = img.getpixel((img.width // 2, img.height // 2))
        assert min(r, g, b) > 230


def test_16bit_grayscale_rescaled_not_blown_out():
    # 16-bit grayscale loads as mode I/I;16; convert("RGB") clips at 255 and
    # yields an all-white image unless rescaled to 8-bit first.
    gray16 = Image.new("I;16", (2000, 100), 30000)  # ~46% gray in 16-bit
    out, _ = prepare_for_vision(_png_bytes(gray16), "image/png")
    with Image.open(io.BytesIO(out)) as img:
        r, g, b = img.getpixel((img.width // 2, img.height // 2))
        assert 100 < r < 140  # 30000 // 256 ≈ 117, not 255
        assert abs(r - g) < 10 and abs(g - b) < 10


def test_garbage_within_budget_passes_through():
    data = b"not really an image"
    out, mime = prepare_for_vision(data, "image/png")
    assert (out, mime) == (data, "image/png")


def test_undecodable_garbage_over_budget_raises():
    data = bytes(_RNG.randbytes(2048))
    with pytest.raises(ValueError):
        prepare_for_vision(data, "image/png", max_raw_bytes=1024)
