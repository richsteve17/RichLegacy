"""End-to-end backend tests for drum transcription, Songbook library, and caching."""
from pathlib import Path
import numpy as np
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.analysis.drums import classify_drums
from backend.app.schemas import OnsetInfo
from backend.app.config import settings

client = TestClient(app)


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_drum_classification_real_track():
    from backend.app.analysis.pipeline import analyze_file
    p = Path(r"C:\Users\richs\Music\DJ Playlists\We Lose Every Week (Sugo Mix)\09 - Rancid - Ruby Soho.mp3")
    if p.exists():
        res = analyze_file("test_ruby", p)
        assert res.duration_sec > 100
        assert res.tempo.bpm > 140
        assert res.pattern.kick_count > 100
        assert res.pattern.snare_count > 100
        assert res.pattern.hihat_count > 100
        assert len(res.drum_hits) > 200
        # Check that simultaneous hits (e.g. snare + hihat) are present
        multi_hits = [h for h in res.drum_hits if len(h.drums) > 1]
        assert len(multi_hits) > 20



def test_songbook_playlists_endpoint():
    res = client.get("/api/songbook/playlists")
    assert res.status_code == 200
    playlists = res.json()
    assert isinstance(playlists, list)
    assert len(playlists) > 0

    # Ensure "We Lose Every Week (Sugo Mix)" is present
    names = [p["name"] for p in playlists]
    assert any("We Lose Every Week" in n for n in names)


def test_songbook_detail_endpoint():
    res = client.get("/api/songbook/playlists")
    playlists = res.json()
    assert len(playlists) > 0

    sugo = next((p for p in playlists if "We Lose Every Week" in p["name"]), playlists[0])
    res_det = client.get(f"/api/songbook/playlists/{sugo['id']}")
    assert res_det.status_code == 200
    detail = res_det.json()
    assert detail["id"] == sugo["id"]
    assert len(detail["tracks"]) > 0

    track0 = detail["tracks"][0]
    assert "file_path" in track0
    assert "title" in track0
    assert Path(track0["file_path"]).exists()


def test_songbook_load_and_cache():
    # Load first track from Sugo Mix
    res = client.get("/api/songbook/playlists")
    sugo = next(p for p in res.json() if "We Lose Every Week" in p["name"])
    res_det = client.get(f"/api/songbook/playlists/{sugo['id']}")
    track0 = res_det.json()["tracks"][0]

    # Test 1-click load
    load_res = client.post(
        "/api/songbook/load",
        json={"file_path": track0["file_path"], "title": track0["title"]},
    )
    assert load_res.status_code == 200
    data = load_res.json()
    assert "upload" in data
    assert "analysis" in data
    assert len(data["analysis"]["drum_hits"]) > 0
    assert data["analysis"]["tempo"]["bpm"] > 0

    # Verify cached file is created
    file_id = data["upload"]["file_id"]
    cache_file = settings.cache_dir / f"{file_id}.analysis.json"
    assert cache_file.exists()

    # Second load should return quickly from cache
    load_res_2 = client.post(
        "/api/songbook/load",
        json={"file_path": track0["file_path"], "title": track0["title"]},
    )
    assert load_res_2.status_code == 200
    data2 = load_res_2.json()
    assert data2["upload"]["file_id"] == file_id
    assert len(data2["analysis"]["drum_hits"]) == len(data["analysis"]["drum_hits"])


def test_songbook_search():
    res = client.get("/api/songbook/search?q=rancid")
    assert res.status_code == 200
    results = res.json()
    assert isinstance(results, list)
    # If Rancid exists in playlists, it returns matches
    if results:
        assert any("rancid" in r["artist"].lower() or "rancid" in r["title"].lower() or "rancid" in r["filename"].lower() for r in results)
