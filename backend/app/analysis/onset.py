"""Onset / transient detection — spectral flux + adaptive threshold.

No librosa/numba — pure numpy + scipy.
"""
from __future__ import annotations

import numpy as np

from ..schemas import OnsetInfo
from ._dsp import HOP, onset_envelope


def detect_onsets(y: np.ndarray, sr: int) -> OnsetInfo:
    env = onset_envelope(y, sr)
    if env.size < 3:
        return OnsetInfo(times=[], count=0)

    from scipy.signal import medfilt  # type: ignore

    # Local median over ~0.4 s, used as the adaptive floor.
    win = max(11, int(0.4 * sr / HOP) | 1)  # odd
    if win >= len(env):
        win = max(3, (len(env) // 2) * 2 + 1)
    local_median = medfilt(env, kernel_size=win)
    threshold = local_median + 0.07  # bias above the noise floor

    # Peak pick: must exceed threshold and be a local max.
    above = env > threshold
    peaks = np.where(above & (env >= np.roll(env, 1)) & (env >= np.roll(env, -1)))[0]
    if peaks.size == 0:
        return OnsetInfo(times=[], count=0)

    # Enforce a 50 ms refractory gap between onsets.
    min_gap = max(1, int(0.05 * sr / HOP))
    kept: list[int] = []
    last = -min_gap
    for p in peaks:
        if int(p) - last >= min_gap:
            kept.append(int(p))
            last = int(p)

    times = (np.array(kept, dtype=np.float64) * HOP / sr).tolist()
    return OnsetInfo(times=[float(t) for t in times], count=len(times))
