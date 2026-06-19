"""End-to-end API tests against the real ASGI app (lifespan + in-process worker).

Runs with mock enrichment (no ANTHROPIC_API_KEY) so the full capture -> worker -> done
pipeline is exercised without network/cost. Everything lives in one TestClient block so
the async SQLite engine stays bound to a single event loop.
"""

import base64
import os
import tempfile
import time

# Configure the environment BEFORE importing the app (settings is read at import).
_TMP = tempfile.mkdtemp(prefix="alvolo-test-")
os.environ["DATA_DIR"] = _TMP
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["CAPTURE_TOKEN"] = ""
os.environ["WORKER_POLL_SECONDS"] = "0.2"

from fastapi.testclient import TestClient  # noqa: E402
from app.config import settings  # noqa: E402
from app.main import app  # noqa: E402

# 1x1 PNG
_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


def _wait_done(client: TestClient, item_id: str, timeout: float = 15.0) -> dict:
    deadline = time.time() + timeout
    data = {}
    while time.time() < deadline:
        data = client.get(f"/api/items/{item_id}").json()
        if data["status"] in ("done", "failed"):
            return data
        time.sleep(0.2)
    return data


def test_full_flow():
    with TestClient(app) as client:
        # health
        assert client.get("/api/health").status_code == 200

        # capture text (JSON)
        r = client.post("/api/capture", json={"text": "un'idea al volo"})
        assert r.status_code == 202
        text_id = r.json()["id"]
        assert r.json()["content_type"] == "text"

        # capture link (multipart form)
        r = client.post("/api/capture", data={"url": "https://example.com"})
        assert r.status_code == 202
        assert r.json()["content_type"] == "link"

        # capture image (multipart file)
        r = client.post(
            "/api/capture", files={"image": ("x.png", _PNG, "image/png")}
        )
        assert r.status_code == 202
        img_id = r.json()["id"]
        assert r.json()["content_type"] == "image"

        # empty -> 422
        assert client.post("/api/capture", json={}).status_code == 422

        # enrichment completes (mock)
        text_item = _wait_done(client, text_id)
        assert text_item["status"] == "done"
        assert text_item["title"]
        assert text_item["model_used"] == "mock"

        img_item = _wait_done(client, img_id)
        assert img_item["status"] == "done"
        assert img_item["image_url"] == f"/api/items/{img_id}/image"

        # image bytes served
        ir = client.get(f"/api/items/{img_id}/image")
        assert ir.status_code == 200
        assert ir.headers["content-type"].startswith("image/")

        # list contains our items
        lst = client.get("/api/items").json()
        assert lst["total"] >= 3

        # delete one
        assert client.delete(f"/api/items/{text_id}").status_code == 204
        assert client.get(f"/api/items/{text_id}").status_code == 404


def test_meta_filters_and_archive():
    with TestClient(app) as client:
        a = client.post("/api/capture", json={"text": "nota uno"}).json()["id"]
        b = client.post("/api/capture", json={"text": "nota due"}).json()["id"]
        _wait_done(client, a)
        _wait_done(client, b)

        # meta aggregations
        meta = client.get("/api/items/meta").json()
        assert {"tags", "categories", "counts_by_status"} <= meta.keys()
        assert "mock" in {c["name"] for c in meta["categories"]}

        # search / category / tag filters (mock enrichment tags everything "mock")
        assert client.get("/api/items", params={"q": "mock"}).json()["total"] >= 2
        assert client.get("/api/items", params={"category": "mock"}).json()["total"] >= 2
        assert client.get("/api/items", params={"tag": "mock"}).json()["total"] >= 2
        assert client.get("/api/items", params={"q": "zzzznotfound"}).json()["total"] == 0

        # archive `a`: excluded from default + status=done, included in status=archived
        r = client.patch(f"/api/items/{a}", json={"status": "archived"})
        assert r.status_code == 200 and r.json()["status"] == "archived"
        default_ids = {i["id"] for i in client.get("/api/items").json()["items"]}
        assert a not in default_ids and b in default_ids
        archived_ids = {
            i["id"] for i in client.get("/api/items", params={"status": "archived"}).json()["items"]
        }
        assert a in archived_ids

        # restore
        assert client.patch(f"/api/items/{a}", json={"status": "done"}).json()["status"] == "done"
        assert a in {i["id"] for i in client.get("/api/items").json()["items"]}


def test_action_items_related_and_todo_filter():
    with TestClient(app) as client:
        a = client.post("/api/capture", json={"text": "primo appunto"}).json()["id"]
        _wait_done(client, a)
        b = client.post("/api/capture", json={"text": "secondo appunto"}).json()["id"]
        _wait_done(client, b)

        bd = client.get(f"/api/items/{b}").json()
        # mock enrichment emits a couple of action items
        assert len(bd["action_items"]) >= 1
        # b links to a (both done, sharing the mock/text tags; a finished first)
        assert a in [r["id"] for r in bd["related"]]

        # has_todo filter returns items with open to-dos
        assert client.get("/api/items", params={"has_todo": "true"}).json()["total"] >= 2

        # checking off all to-dos via PATCH
        r = client.patch(f"/api/items/{b}", json={"action_items": []})
        assert r.status_code == 200 and r.json()["action_items"] == []


def test_ask():
    with TestClient(app) as client:
        a = client.post(
            "/api/capture", json={"text": "nota sul caffè arabica e il basilico fresco"}
        ).json()["id"]
        _wait_done(client, a)

        r = client.post("/api/ask", json={"question": "cosa ho salvato sul caffè?"})
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body["answer"], str) and body["answer"]
        assert any(s["id"] == a for s in body["sources"])  # retrieved the caffè note

        # per-item deepen
        r2 = client.post(f"/api/items/{a}/ask", json={})
        assert r2.status_code == 200 and r2.json()["answer"]

        # empty question -> 422
        assert client.post("/api/ask", json={"question": "  "}).status_code == 422


def test_digest():
    with TestClient(app) as client:
        a = client.post("/api/capture", json={"text": "qualcosa di recente da ricapitolare"}).json()["id"]
        _wait_done(client, a)
        r = client.get("/api/digest", params={"days": 7})
        assert r.status_code == 200
        d = r.json()
        assert d["item_count"] >= 1
        assert isinstance(d["recap"], str) and d["recap"]


def test_pdf_capture():
    pdf = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
    with TestClient(app) as client:
        r = client.post("/api/capture", files={"image": ("doc.pdf", pdf, "application/pdf")})
        assert r.status_code == 202
        assert r.json()["content_type"] == "pdf"
        pid = r.json()["id"]

        item = _wait_done(client, pid)
        assert item["status"] == "done"
        assert item["file_url"] == f"/api/items/{pid}/file"

        fr = client.get(f"/api/items/{pid}/file")
        assert fr.status_code == 200
        assert fr.headers["content-type"].startswith("application/pdf")


def test_audio_capture():
    # faster-whisper isn't installed in CI, so transcription degrades to a placeholder;
    # the capture -> enrich -> done flow must still complete.
    clip = b"OggS\x00\x02-fake-audio-bytes"
    with TestClient(app) as client:
        r = client.post("/api/capture", files={"image": ("nota.webm", clip, "audio/webm")})
        assert r.status_code == 202
        assert r.json()["content_type"] == "audio"
        aid = r.json()["id"]

        item = _wait_done(client, aid)
        assert item["status"] == "done"
        assert item["extracted_text"]  # transcript (or degraded placeholder) is stored
        assert item["file_url"] == f"/api/items/{aid}/file"


def test_stats_and_export():
    with TestClient(app) as client:
        a = client.post("/api/capture", json={"text": "elemento per le statistiche"}).json()["id"]
        _wait_done(client, a)

        s = client.get("/api/stats").json()
        assert s["total"] >= 1
        assert "by_status" in s and "tokens_input" in s
        assert len(s["per_day"]) == 14

        ej = client.get("/api/export", params={"format": "json"})
        assert ej.status_code == 200 and isinstance(ej.json(), list) and len(ej.json()) >= 1

        em = client.get("/api/export", params={"format": "markdown"})
        assert em.status_code == 200 and em.text.startswith("# AlVolo")


def test_auth_enforced():
    # Toggle auth on for this test (require_auth reads settings live).
    settings.capture_token = "secret-token"
    try:
        with TestClient(app) as client:
            assert client.post("/api/capture", json={"text": "x"}).status_code == 401
            assert client.get("/api/items").status_code == 401
            ok = client.post(
                "/api/capture",
                json={"text": "x"},
                headers={"Authorization": "Bearer secret-token"},
            )
            assert ok.status_code == 202
            ok2 = client.post(
                "/api/capture",
                data={"text": "y"},
                headers={"X-API-Key": "secret-token"},
            )
            assert ok2.status_code == 202
    finally:
        settings.capture_token = ""
