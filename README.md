# Drum Pad Learning App

A local-first drum learning web app. Upload your own audio files, analyze
drum patterns, get kit suggestions, and practice along in your browser
(works on iPhone Safari).

## Architecture

```
project/
├── backend/      FastAPI service for audio analysis
├── frontend/     React + Vite + TypeScript SPA
└── Makefile      Convenience commands
```

- **No streaming, no copyright issues**: audio files stay on your machine.
- **iOS-friendly**: mobile-first UI; HTML5 `<audio>` for playback.
- **Modular**: backend analysis modules and frontend feature folders are
  ready to grow (onset detection, tempo, beat tracking, pattern matching,
  kit recommendation, etc.).

## Quick start (one command)

The fastest way to get going on a Mac:

```bash
./startup.sh
```

That single script will:

1. Verify `python3`, `node`, and `npm` are installed.
2. Create `backend/.venv` and install Python deps if missing.
3. Run `npm install` in `frontend/` if missing.
4. Start the FastAPI backend on `http://localhost:8000`.
5. Start the Vite frontend on `http://localhost:5173`.
6. Print your Mac's LAN IP so you can open the app on your iPhone
   (same Wi-Fi).

Press **Ctrl-C** once to stop both servers cleanly.

Useful flags:

```bash
./startup.sh --reset   # wipe .venv + node_modules and reinstall, then run
./startup.sh --help    # show usage
```

The first run installs everything (≈1–2 minutes). Subsequent runs are
near-instant.

---

## Manual quick start

If you'd rather run each piece yourself:

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

> **macOS note** — the backend uses `numpy`, `scipy`, `soundfile`, and
> `audioread` only. All ship pre-built wheels for every supported Python
> on Intel and Apple Silicon, so no LLVM / Rust / Xcode toolchain is
> needed. (Earlier versions used `librosa`, which pulled in
> `numba` → `llvmlite` and required compilation. That's gone.)
>
> **Audio format support** out of the box:
> - WAV / FLAC / OGG / AIFF — handled by `soundfile` (libsndfile)
> - MP3 / M4A / AAC — handled by `audioread` via macOS CoreAudio
>
> Nothing extra to install for any of those formats.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev -- --host
```

Vite will print a `Network:` URL like `http://192.168.x.x:5173`.
Open that URL on your iPhone (same Wi-Fi as your Mac) to test.

### Convenience

```bash
make install   # installs both
make dev       # runs both (requires `tmux` or two terminals)
```

## Testing on iPhone

1. Make sure your Mac and iPhone are on the same Wi-Fi network.
2. Run `npm run dev -- --host` so Vite binds to `0.0.0.0`.
3. Visit the printed `Network:` URL in mobile Safari.
4. iOS Safari blocks autoplay — playback must be triggered by a tap
   (the UI is built around this).

## Roadmap (modular extension points)

- `backend/app/analysis/onset.py` — onset/transient detection
- `backend/app/analysis/tempo.py` — BPM + beat grid
- `backend/app/analysis/pattern.py` — drum pattern segmentation
- `backend/app/analysis/kit.py` — kit recommendation heuristics
- `frontend/src/features/practice/` — practice mode (metronome, scoring)
- `frontend/src/features/pads/` — drum pad UI
