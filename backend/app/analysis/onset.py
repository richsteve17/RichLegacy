"""Onset / transient detection.

This is a thin wrapper so the rest of the app stays independent of
librosa internals. Swap in a custom detector later without touching
the pipeline.
"""
from __future__ import annotations

import numpy as np

from ..schemas import OnsetInfo


def detect_onsets(y: np.ndarray, sr: int) -> OnsetInfo:
    import librosa  # type: ignore

    onset_frames = librosa.onset.onset_detect(y=y, sr=sr, units="frames")
    times = librosa.frames_to_time(onset_frames, sr=sr).tolist()
    return OnsetInfo(times=[float(t) for t in times], count=len(times))
