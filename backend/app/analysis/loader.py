"""Audio loading helpers.

Strategy
--------
* ``soundfile`` (libsndfile) handles wav / flac / ogg / aiff — wheels
  bundled, no system deps.
* ``audioread`` covers mp3 / m4a / aac. On macOS it uses the system
  CoreAudio backend, so no ffmpeg install is needed for the common
  iPhone-recorded formats.

No numba, no llvmlite, no compilation — everything here is wheel-only.
"""
from __future__ import annotations

from math import gcd
from pathlib import Path

import numpy as np

# Formats libsndfile handles directly. Everything else falls through
# to audioread.
_NATIVE_EXTS = {".wav", ".flac", ".ogg", ".aiff", ".aif"}


def load_audio(path: Path, sr: int = 22050) -> tuple[np.ndarray, int]:
    """Load ``path`` as mono float32 at ``sr`` Hz."""
    ext = path.suffix.lower()
    if ext in _NATIVE_EXTS:
        y, sr_in = _read_soundfile(path)
    else:
        y, sr_in = _read_audioread(path)

    # Mono mix-down.
    if y.ndim > 1:
        y = y.mean(axis=1)
    y = np.ascontiguousarray(y, dtype=np.float32)

    if sr_in != sr:
        y = _resample(y, sr_in, sr)
    return y, sr


def _read_soundfile(path: Path) -> tuple[np.ndarray, int]:
    import soundfile as sf  # type: ignore

    y, sr_in = sf.read(str(path), dtype="float32", always_2d=False)
    return y, int(sr_in)


def _read_audioread(path: Path) -> tuple[np.ndarray, int]:
    import audioread  # type: ignore

    chunks: list[np.ndarray] = []
    with audioread.audio_open(str(path)) as f:
        sr_in = int(f.samplerate)
        nch = int(f.channels)
        for buf in f:
            arr = np.frombuffer(buf, dtype=np.int16)
            if nch > 1:
                arr = arr.reshape(-1, nch)
            chunks.append(arr)

    if not chunks:
        return np.zeros(0, dtype=np.float32), sr_in
    raw = np.concatenate(chunks)
    y = raw.astype(np.float32) / 32768.0
    return y, sr_in


def _resample(y: np.ndarray, sr_in: int, sr_out: int) -> np.ndarray:
    """Polyphase resample — fast, dependency-free, good enough for analysis."""
    from scipy.signal import resample_poly  # type: ignore

    g = gcd(sr_in, sr_out)
    up = sr_out // g
    down = sr_in // g
    out = resample_poly(y, up, down)
    return np.ascontiguousarray(out, dtype=np.float32)
