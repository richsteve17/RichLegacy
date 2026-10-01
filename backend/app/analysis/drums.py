"""Drum component classification — sub-band spectral flux and transient analysis.

Classifies audio transients into:
- 'kick': low-frequency thump (30-180 Hz)
- 'snare': mid-frequency crack/body (200-2200 Hz)
- 'hihat': high-frequency metallic transient (2500-11000 Hz)
- 'crash': high-energy cymbal transient
- Simultaneous hits: e.g. ['kick', 'hihat'], ['snare', 'hihat']

Pure numpy / scipy implementation — zero compilation required.
"""
from __future__ import annotations

import numpy as np

from ..schemas import DrumHit, OnsetInfo
from ._dsp import HOP, stft_magnitude


def classify_drums(
    y: np.ndarray,
    sr: int,
    onsets: OnsetInfo,
) -> tuple[list[DrumHit], int, int, int]:
    """Classifies each detected onset into specific drum components.

    Returns:
        (drum_hits, kick_count, snare_count, hihat_count)
    """
    if not onsets.times:
        return [], 0, 0, 0

    mag = stft_magnitude(y, sr)
    if mag.shape[1] < 2:
        return [], 0, 0, 0

    freqs = np.linspace(0, sr / 2, mag.shape[0])

    # Sub-band frequency masks
    low_mask = (freqs >= 30) & (freqs < 180)  # Kick
    mid_mask = (freqs >= 200) & (freqs < 2200)  # Snare
    high_mask = (freqs >= 2500) & (freqs < 11000)  # Hi-hat / Cymbals

    # Half-wave rectified flux per band
    flux_low = np.maximum(0, np.diff(mag[low_mask, :].sum(axis=0)))
    flux_mid = np.maximum(0, np.diff(mag[mid_mask, :].sum(axis=0)))
    flux_high = np.maximum(0, np.diff(mag[high_mask, :].sum(axis=0)))

    # Normalization references
    max_k = float(flux_low.max()) if flux_low.size and flux_low.max() > 0 else 1.0
    max_s = float(flux_mid.max()) if flux_mid.size and flux_mid.max() > 0 else 1.0
    max_h = float(flux_high.max()) if flux_high.size and flux_high.max() > 0 else 1.0

    drum_hits: list[DrumHit] = []
    k_count = 0
    s_count = 0
    h_count = 0

    num_frames = len(flux_low)

    for t in onsets.times:
        frame = int(t * sr / HOP)
        if frame >= num_frames:
            frame = num_frames - 1

        w = slice(max(0, frame - 1), min(num_frames, frame + 2))
        k = float(flux_low[w].max()) / max_k if w.start < w.stop else 0.0
        s = float(flux_mid[w].max()) / max_s if w.start < w.stop else 0.0
        h = float(flux_high[w].max()) / max_h if w.start < w.stop else 0.0

        total = k + s + h + 1e-6
        rk = k / total
        rs = s / total
        rh = h / total

        drums: list[str] = []
        primary: str

        # Determine drum components
        if rk > 0.35 and rh > 0.28:
            # Simultaneous Kick + Hi-Hat!
            drums = ["kick", "hihat"]
            primary = "kick"
            k_count += 1
            h_count += 1
        elif rs > 0.35 and rh > 0.28:
            # Simultaneous Snare + Hi-Hat!
            drums = ["snare", "hihat"]
            primary = "snare"
            s_count += 1
            h_count += 1
        elif rk >= rs and rk >= rh:
            drums = ["kick"]
            primary = "kick"
            k_count += 1
        elif rs >= rk and rs >= rh:
            drums = ["snare"]
            primary = "snare"
            s_count += 1
        else:
            if h > 0.65:
                drums = ["crash"]
                primary = "crash"
            else:
                drums = ["hihat"]
                primary = "hihat"
            h_count += 1

        intensity = min(1.0, float(max(k, s, h)))

        drum_hits.append(
            DrumHit(
                time=float(t),
                drums=drums,
                primary=primary,
                intensity=float(round(intensity, 2)),
            )
        )

    return drum_hits, k_count, s_count, h_count
