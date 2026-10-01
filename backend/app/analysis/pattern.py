"""High-level drum pattern summarization."""
from __future__ import annotations

import numpy as np

from ..schemas import OnsetInfo, PatternSummary, TempoInfo


def summarize_pattern(
    y: np.ndarray,
    sr: int,
    tempo: TempoInfo,
    onsets: OnsetInfo,
    kick_count: int = 0,
    snare_count: int = 0,
    hihat_count: int = 0,
) -> PatternSummary:
    duration = len(y) / sr if sr else 0.0
    density = onsets.count / duration if duration > 0 else 0.0

    bars = 0
    if tempo.bpm > 0 and duration > 0:
        beats = duration * tempo.bpm / 60.0
        bars = int(beats // 4)

    notes: list[str] = []
    if kick_count > 0 and snare_count > 0:
        notes.append(f"Detected {kick_count} kicks and {snare_count} snares.")
    if hihat_count > 0:
        notes.append(f"{hihat_count} cymbal/hi-hat strokes transcribed.")

    if density < 1.0:
        notes.append("Sparse rhythm — great for foundational practice.")
    elif density < 3.5:
        notes.append("Medium groove — classic rock/pop driving beat.")
    else:
        notes.append("Fast, high-energy groove — quick hands required!")

    return PatternSummary(
        bars=bars,
        time_signature="4/4",
        density=float(density),
        notes=notes,
        kick_count=kick_count,
        snare_count=snare_count,
        hihat_count=hihat_count,
    )
