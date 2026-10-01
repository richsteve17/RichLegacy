"""Songbook endpoints — DJ Playlists library browser and 1-click track loader."""
from __future__ import annotations

import csv
import hashlib
import re
import shutil
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from ..analysis.pipeline import analyze_file
from ..config import settings
from ..schemas import (
    AnalysisResponse,
    SongbookLoadRequest,
    SongbookLoadResponse,
    SongbookPlaylist,
    SongbookPlaylistDetail,
    SongbookTrack,
    UploadResponse,
)

router = APIRouter()

# Memory cache for CSV metadata
_CSV_META_CACHE: dict[str, dict] = {}
_PLAYLISTS_CACHE: list[dict] = []


def _normalize_title(s: str) -> str:
    """Normalize string for fuzzy matching (lowercase, alphanumeric only)."""
    return re.sub(r"[^a-z0-9]", "", s.lower())


def _load_csv_metadata() -> dict[str, dict]:
    """Loads metadata from Sugo Mix and other CSVs in Downloads."""
    global _CSV_META_CACHE
    if _CSV_META_CACHE:
        return _CSV_META_CACHE

    meta: dict[str, dict] = {}

    # 1. Sugo Mix CSV
    sugo_csv = settings.downloads_dir / "We_Lose_Every_Week_(Sugo_Mix).csv"
    if sugo_csv.exists():
        try:
            with sugo_csv.open("r", encoding="utf-8", errors="ignore") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    track = row.get("Track Name", "").strip()
                    artist = row.get("Artist Name(s)", "").strip()
                    album = row.get("Album Name", "").strip()
                    bpm_val = float(row.get("Tempo", 0) or 0)
                    genres = row.get("Genres", "").strip()
                    dur_ms = float(row.get("Duration (ms)", 0) or 0)

                    item = {
                        "title": track,
                        "artist": artist,
                        "album": album,
                        "bpm": round(bpm_val, 1),
                        "genre": genres,
                        "duration_sec": round(dur_ms / 1000, 1),
                    }
                    if track:
                        meta[_normalize_title(track)] = item
        except Exception:
            pass

    # 2. Current Session CSV
    cur_csv = settings.downloads_dir / "Current Session.csv"
    if cur_csv.exists():
        try:
            with cur_csv.open("r", encoding="utf-8", errors="ignore") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    track = row.get("Title", "").strip()
                    artist = row.get("Artist", "").strip()
                    album = row.get("Album", "").strip()
                    bpm_val = float(row.get("BPM", 0) or 0)
                    item = {
                        "title": track,
                        "artist": artist,
                        "album": album,
                        "bpm": round(bpm_val, 1),
                        "genre": "",
                        "duration_sec": 0.0,
                    }
                    if track and _normalize_title(track) not in meta:
                        meta[_normalize_title(track)] = item
        except Exception:
            pass

    _CSV_META_CACHE = meta
    return meta


def _parse_filename(stem: str) -> tuple[str, str]:
    """Extracts (artist, title) from typical DJ filenames."""
    # Pattern: "09 - Rancid - Ruby Soho" or "Rancid - Ruby Soho"
    m = re.match(r"^(?:\d+\s*[-_.]\s*)?([^-]+?)\s*-\s*(.+)$", stem)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return "", stem.strip()


def _build_track_info(path: Path) -> SongbookTrack:
    """Creates a SongbookTrack instance with enriched metadata."""
    meta_db = _load_csv_metadata()
    stem = path.stem
    artist_guess, title_guess = _parse_filename(stem)

    title = title_guess or stem
    artist = artist_guess or ""
    album = ""
    bpm = 0.0
    duration_sec = 0.0
    genre = ""

    # Look up in CSV database
    norm_title = _normalize_title(title)
    if norm_title in meta_db:
        entry = meta_db[norm_title]
        title = entry["title"] or title
        artist = entry["artist"] or artist
        album = entry.get("album", "")
        bpm = entry.get("bpm", 0.0)
        duration_sec = entry.get("duration_sec", 0.0)
        genre = entry.get("genre", "")
    else:
        # Partial match
        for k, entry in meta_db.items():
            if len(k) > 4 and (k in norm_title or norm_title in k):
                title = entry["title"] or title
                artist = entry["artist"] or artist
                album = entry.get("album", "")
                bpm = entry.get("bpm", 0.0)
                duration_sec = entry.get("duration_sec", 0.0)
                genre = entry.get("genre", "")
                break

    track_id = hashlib.md5(str(path).encode("utf-8")).hexdigest()[:12]
    file_id = f"sb_{hashlib.md5(str(path).encode('utf-8')).hexdigest()[:16]}"
    cache_path = settings.cache_dir / f"{file_id}.analysis.json"

    return SongbookTrack(
        id=track_id,
        title=title,
        artist=artist,
        album=album,
        bpm=bpm,
        duration_sec=duration_sec,
        genre=genre,
        file_path=str(path),
        filename=path.name,
        is_cached=cache_path.exists(),
    )


PLAYLIST_DESCRIPTIONS = {
    "We Lose Every Week (Sugo Mix)": "45 Skate Punk, Pop-Punk & Ska Classics (Rancid, Blink-182, NOFX, The Distillers, Operation Ivy)",
    "Emo Night Sugo": "61 Emo & Pop-Punk Anthems",
    "Emo Night 2 Final": "47 Emo Night Floor Fillers",
    "Cherry Bomb": "65 High-Energy Rock & Punk Tracks",
    "Your All-Time Top Songs": "119 Favorite DJ Tracks Across All Styles",
    "My new favorite fucking playlist": "138 Heavy Rotation Essentials",
    "Punk Kit - Reloop Ready": "Reloop Ready 16-Pad Master Punk Drum Sample Kit",
}


@router.get("/songbook/playlists", response_model=list[SongbookPlaylist])
def get_playlists() -> list[SongbookPlaylist]:
    """Returns all available DJ playlists found in Music/DJ Playlists."""
    dj_dir = settings.dj_playlists_dir
    if not dj_dir.exists():
        return []

    playlists: list[SongbookPlaylist] = []

    # 1. Process all .m3u8 files
    for m3u_path in sorted(dj_dir.glob("*.m3u8")):
        playlist_name = m3u_path.stem
        # Count existing tracks
        try:
            lines = [
                line.strip()
                for line in m3u_path.read_text(encoding="utf-8", errors="ignore").splitlines()
                if line.strip() and not line.startswith("#")
            ]
            valid_count = sum(1 for line in lines if Path(line).exists())
            if valid_count > 0:
                p_id = re.sub(r"[^a-zA-Z0-9_-]", "_", playlist_name).lower()
                desc = PLAYLIST_DESCRIPTIONS.get(playlist_name, f"{valid_count} tracks")
                playlists.append(
                    SongbookPlaylist(
                        id=p_id,
                        name=playlist_name,
                        track_count=valid_count,
                        description=desc,
                    )
                )
        except Exception:
            continue

    # Sort so "We Lose Every Week (Sugo Mix)" is first, then Emo Night, then others
    def _sort_key(p: SongbookPlaylist) -> tuple[int, str]:
        if "We Lose Every Week" in p.name:
            return (0, p.name)
        if "Emo Night Sugo" in p.name:
            return (1, p.name)
        if "Cherry Bomb" in p.name:
            return (2, p.name)
        return (3, p.name)

    playlists.sort(key=_sort_key)
    return playlists


@router.get("/songbook/playlists/{playlist_id}", response_model=SongbookPlaylistDetail)
def get_playlist_detail(playlist_id: str) -> SongbookPlaylistDetail:
    """Returns all playable tracks in a specific DJ playlist."""
    dj_dir = settings.dj_playlists_dir
    if not dj_dir.exists():
        raise HTTPException(status_code=404, detail="DJ Playlists directory not found")

    # Find matching .m3u8
    target_m3u: Optional[Path] = None
    target_name = ""
    for m3u_path in dj_dir.glob("*.m3u8"):
        p_id = re.sub(r"[^a-zA-Z0-9_-]", "_", m3u_path.stem).lower()
        if p_id == playlist_id or m3u_path.stem.lower() == playlist_id.lower():
            target_m3u = m3u_path
            target_name = m3u_path.stem
            break

    tracks: list[SongbookTrack] = []

    if target_m3u and target_m3u.exists():
        try:
            lines = [
                line.strip()
                for line in target_m3u.read_text(encoding="utf-8", errors="ignore").splitlines()
                if line.strip() and not line.startswith("#")
            ]
            for line in lines:
                p = Path(line)
                if p.exists() and p.suffix.lower() in {".mp3", ".wav", ".m4a", ".flac"}:
                    tracks.append(_build_track_info(p))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed reading playlist: {e}")
    else:
        # Check if there is a matching subdirectory
        for sub in dj_dir.iterdir():
            if sub.is_dir():
                p_id = re.sub(r"[^a-zA-Z0-9_-]", "_", sub.name).lower()
                if p_id == playlist_id or sub.name.lower() == playlist_id.lower():
                    target_name = sub.name
                    for audio_file in sorted(sub.glob("*.mp3")):
                        tracks.append(_build_track_info(audio_file))
                    break

    if not tracks and not target_name:
        raise HTTPException(status_code=404, detail="Playlist not found")

    return SongbookPlaylistDetail(
        id=playlist_id,
        name=target_name or playlist_id,
        track_count=len(tracks),
        tracks=tracks,
    )


@router.get("/songbook/search", response_model=list[SongbookTrack])
def search_tracks(q: str = Query(..., min_length=2)) -> list[SongbookTrack]:
    """Fast search across all DJ playlists by title, artist, or genre."""
    q_norm = q.lower().strip()
    dj_dir = settings.dj_playlists_dir
    results: list[SongbookTrack] = []
    seen_paths: set[str] = set()

    for p in dj_dir.rglob("*.mp3"):
        if str(p) in seen_paths:
            continue
        stem = p.stem.lower()
        if q_norm in stem:
            t = _build_track_info(p)
            seen_paths.add(str(p))
            results.append(t)
            if len(results) >= 50:
                break

    return results


@router.post("/songbook/load", response_model=SongbookLoadResponse)
def load_songbook_track(req: SongbookLoadRequest) -> SongbookLoadResponse:
    """Loads, stages, analyzes, and caches a track from the user's DJ playlists.

    Returns both upload and analysis results in a single 1-click operation.
    Subsequent loads of the same track return instantaneously from disk cache.
    """
    src_path = Path(req.file_path)
    if not src_path.exists():
        raise HTTPException(status_code=404, detail=f"Track file not found: {req.file_path}")

    ext = src_path.suffix.lower()
    # Deterministic file ID based on source path
    file_id = f"sb_{hashlib.md5(str(src_path).encode('utf-8')).hexdigest()[:16]}"
    dest_path = settings.upload_dir / f"{file_id}{ext}"
    cache_path = settings.cache_dir / f"{file_id}.analysis.json"

    # Stage file into uploads/ if not already there
    if not dest_path.exists():
        try:
            shutil.copyfile(src_path, dest_path)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed staging audio file: {e}")

    upload_resp = UploadResponse(
        file_id=file_id,
        filename=req.title or src_path.name,
        size_bytes=dest_path.stat().st_size,
        content_type="audio/mpeg" if ext == ".mp3" else "application/octet-stream",
    )

    # Check disk cache for instant load
    if cache_path.exists():
        try:
            cached_json = cache_path.read_text(encoding="utf-8")
            analysis_resp = AnalysisResponse.model_validate_json(cached_json)
            return SongbookLoadResponse(upload=upload_resp, analysis=analysis_resp)
        except Exception:
            pass  # Fall through to re-analyze if cache is invalid

    # Perform analysis
    analysis_resp = analyze_file(file_id, dest_path)

    # Cache result to disk for instant future loads
    try:
        cache_path.write_text(analysis_resp.model_dump_json(), encoding="utf-8")
    except Exception:
        pass

    return SongbookLoadResponse(upload=upload_resp, analysis=analysis_resp)
