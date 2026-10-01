# Drum Pad Learning App

A local-first drum learning and finger-drumming web app. Seamlessly browse your DJ playlists, analyze drum transients into authentic Kick, Snare, and Hi-Hat parts, and practice two-handed finger drumming with real-time RGB LED illumination on the **Reloop Ready** controller.

## Features

- **Reloop Ready 16-Pad Dual-Deck Architecture**:
  - Full support for both decks simultaneously (Deck 1 Left Hand + Deck 2 Right Hand).
  - Deck 1 (Left): MIDI Ch 5 (status `0x94`), Notes 20–27 for core rhythm (Kick & Snare).
  - Deck 2 (Right): MIDI Ch 6 (status `0x95`), Notes 20–27 for timekeeping (Hi-Hat pulse, Cymbals, Fills).
  - Two-handed dexterity: both hands play together with simultaneous multi-pad hits (Kick + Hat, Snare + Hat).
  - Forgiving drum matching: hitting alternate pads assigned to the same drum element (e.g. right-hand snare Pad 13) registers as a valid hit!
- **Real-Time Hardware RGB LED Lighting**:
  - Pads on the Reloop Ready physically illuminate ahead of each beat in bright Amber.
  - Flashes Green on accurate hits, Red on mistakes, and Cyan on free taps.
  - Built-in "🌈 Test Hardware LEDs" rainbow chase test in the UI.
- **DJ Playlists Songbook**:
  - Direct integration with `Music/DJ Playlists` (over 800 tracks across 13 playlists, including *We Lose Every Week (Sugo Mix)*, *Emo Night Sugo*, *Cherry Bomb*, etc.).
  - 1-click "Practice" action automatically loads audio, transcribes drum parts, and caches results for instant future loads (<5ms).
  - Search by artist, song title, or genre.
- **Authentic Drum Transcription (No Pad Cycling)**:
  - Sub-band transient analysis detects real acoustic drum hits (Kick thump 30–180 Hz, Snare crack 200–2200 Hz, Hi-Hat/Cymbals 2500–11000 Hz).
  - Eliminates sequential pad cycling (1 through 8) completely.
- **Modular Hardware Presets**:
  - Reloop Ready (16 Pads — Dual Deck Default)
  - Reloop Ready (Single Deck 8 Pads)
  - Reloop Buddy (8 Pads)
  - Hercules DJControl Mix (4 Pads)
  - Custom / Generic MIDI Controllers with interactive MIDI Learn / Calibration.

---

## Quick Start (One Command)

### On Windows (PowerShell):

```powershell
.\startup.ps1
```

### On macOS / Linux:

```bash
./startup.sh
```

That script will:
1. Verify Python, Node, and npm are installed.
2. Initialize `backend/.venv` and install Python dependencies.
3. Install frontend dependencies in `frontend/`.
4. Start the FastAPI backend on `http://localhost:8000`.
5. Start the Vite frontend on `http://localhost:5173`.

Press **Ctrl-C** (or Enter in PowerShell) to stop both servers cleanly.

---

## Testing & Verification

Run backend test suite:
```powershell
.\backend\.venv\Scripts\python.exe -m pytest backend\tests\test_backend.py -v
```

Run frontend build & linting:
```powershell
cd frontend
npm run lint
npm run build
```
