"""Tempo / beat tracking."""
from __future__ import annotations

import numpy as np

from ..schemas import TempoInfo


def estimate_tempo(y: np.ndarray, sr: int) -> TempoInfo:
    import librosa  # type: ignore

    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()
    bpm = float(np.atleast_1d(tempo)[0])
    return TempoInfo(bpm=bpm, beat_times=[float(t) for t in beat_times])
