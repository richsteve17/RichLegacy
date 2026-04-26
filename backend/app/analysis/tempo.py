"""Tempo / beat tracking — autocorrelation of the onset envelope.

No librosa/numba — pure numpy.
"""
from __future__ import annotations

import numpy as np

from ..schemas import TempoInfo
from ._dsp import HOP, frames_per_second, onset_envelope


def estimate_tempo(y: np.ndarray, sr: int) -> TempoInfo:
    env = onset_envelope(y, sr)
    if env.size < 4:
        return TempoInfo(bpm=0.0, beat_times=[])

    # Centre and autocorrelate the onset strength.
    env_c = env - env.mean()
    ac = np.correlate(env_c, env_c, mode="full")[env_c.size - 1 :]
    if ac.size < 2:
        return TempoInfo(bpm=0.0, beat_times=[])

    fps = frames_per_second(sr)
    # BPM search range: 60–200 → translate to lag (in frames).
    min_lag = max(1, int(fps * 60.0 / 200.0))
    max_lag = min(ac.size - 1, int(fps * 60.0 / 60.0))
    if min_lag >= max_lag:
        return TempoInfo(bpm=0.0, beat_times=[])

    seg = ac[min_lag : max_lag + 1]
    best = int(np.argmax(seg)) + min_lag
    bpm = 60.0 * fps / best

    # Build a uniform beat grid from the detected period.
    period_samples = best * HOP
    if period_samples <= 0:
        beat_times: list[float] = []
    else:
        beat_idx = np.arange(0, len(y), period_samples)
        beat_times = (beat_idx / sr).astype(np.float64).tolist()

    return TempoInfo(bpm=float(bpm), beat_times=[float(t) for t in beat_times])
