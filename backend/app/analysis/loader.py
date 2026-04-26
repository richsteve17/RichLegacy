"""Audio loading helpers."""
from __future__ import annotations

from pathlib import Path

import numpy as np


def load_audio(path: Path, sr: int = 22050) -> tuple[np.ndarray, int]:
    """Load audio as mono float32 at the requested sample rate.

    Imported lazily so the API can boot even if librosa isn't installed yet.
    """
    import librosa  # type: ignore

    y, sr_loaded = librosa.load(str(path), sr=sr, mono=True)
    return y.astype(np.float32, copy=False), int(sr_loaded)
