"""Backend tests for AURAL / MP3 converter API."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://mp3-grabber-12.preview.emergentagent.com").rstrip("/")
DIRECT_AUDIO_URL = "https://www.kozco.com/tech/piano2.wav"


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def conversion(api):
    """Create one conversion shared across tests; clean up afterwards."""
    r = api.post(f"{BASE_URL}/api/convert", json={"url": DIRECT_AUDIO_URL}, timeout=180)
    assert r.status_code == 200, f"convert failed: {r.status_code} {r.text}"
    data = r.json()
    yield data
    # Teardown
    try:
        api.delete(f"{BASE_URL}/api/conversions/{data['id']}", timeout=30)
    except Exception:
        pass


# -------- Health --------
class TestHealth:
    def test_root(self, api):
        r = api.get(f"{BASE_URL}/api/", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body.get("status") == "ok"


# -------- Convert validation --------
class TestConvertValidation:
    def test_empty_url(self, api):
        r = api.post(f"{BASE_URL}/api/convert", json={"url": ""}, timeout=15)
        assert r.status_code == 400, r.text

    def test_invalid_url(self, api):
        r = api.post(f"{BASE_URL}/api/convert", json={"url": "notaurl"}, timeout=15)
        assert r.status_code == 400, r.text


# -------- Convert + persistence --------
class TestConvertFlow:
    def test_convert_direct_audio(self, conversion):
        d = conversion
        for k in ("id", "title", "filename", "size_bytes", "created_at"):
            assert k in d, f"missing key {k} in {d}"
        assert d["filename"].endswith(".mp3")
        assert d["filename"].startswith(d["id"])
        assert d["size_bytes"] > 1000
        # keys that may be None but must be present
        assert "artist" in d and "duration" in d and "thumbnail" in d
        # Regression: title derived from filename (piano2)
        assert "piano2" in (d["title"] or "").lower()
        # Regression: duration probe now reads ffmpeg stderr — must be > 0
        assert d["duration"] is not None and float(d["duration"]) > 0, (
            f"duration not probed: {d['duration']}"
        )


# -------- Code-level regression: constants & storage --------
class TestServerConstants:
    def test_constants_and_storage(self):
        import sys
        sys.path.insert(0, "/app/backend")
        import server  # noqa: E402
        # 50 MB cap
        assert server.MAX_DIRECT_DOWNLOAD_BYTES == 50 * 1024 * 1024
        # Storage dir is persistent
        assert str(server.STORAGE_DIR) == "/app/backend/storage/conversions"
        assert server.STORAGE_DIR.exists()
        # ffmpeg binary resolved
        assert server.FFMPEG_BIN and os.path.exists(server.FFMPEG_BIN)

    def test_file_lands_in_storage_dir(self, conversion):
        from pathlib import Path
        p = Path("/app/backend/storage/conversions") / conversion["filename"]
        assert p.exists(), f"MP3 not in persistent STORAGE_DIR: {p}"
        assert p.stat().st_size == conversion["size_bytes"]

    def test_list_excludes_object_id(self, api, conversion):
        r = api.get(f"{BASE_URL}/api/conversions", timeout=30)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert any(i["id"] == conversion["id"] for i in items)
        for i in items:
            assert "_id" not in i, "Mongo _id leaked into response"

    def test_get_file_streams_mp3(self, api, conversion):
        r = api.get(f"{BASE_URL}/api/file/{conversion['id']}", timeout=60, stream=True)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("audio/mpeg")
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower()
        assert ".mp3" in cd.lower()
        chunk = next(r.iter_content(chunk_size=4), b"")
        # MP3 framing: either ID3 tag or 0xFF sync byte
        assert chunk[:3] == b"ID3" or chunk[:1] == b"\xff", f"unexpected MP3 prefix: {chunk!r}"

    def test_get_file_unknown_404(self, api):
        r = api.get(f"{BASE_URL}/api/file/nonexistent-id-12345", timeout=15)
        assert r.status_code == 404


# -------- Delete flow (independent conversion) --------
class TestDelete:
    def test_delete_removes_record_and_file(self, api):
        r = api.post(f"{BASE_URL}/api/convert", json={"url": DIRECT_AUDIO_URL}, timeout=180)
        assert r.status_code == 200, r.text
        cid = r.json()["id"]

        # confirm file is reachable
        assert api.get(f"{BASE_URL}/api/file/{cid}", timeout=30).status_code == 200

        d = api.delete(f"{BASE_URL}/api/conversions/{cid}", timeout=30)
        assert d.status_code == 200
        assert d.json().get("ok") is True

        # Subsequent file fetch should 404
        g = api.get(f"{BASE_URL}/api/file/{cid}", timeout=15)
        assert g.status_code == 404

        # And it must not show up in history
        lst = api.get(f"{BASE_URL}/api/conversions", timeout=30).json()
        assert not any(i["id"] == cid for i in lst)
