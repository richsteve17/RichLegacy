"""High-level drum pattern summarization.

Stub implementation — gives enough signal for the frontend to render
useful UI today, with a clear extension point for real pattern
classification (kick/snare/hat segregation, bar-level transcription).
"""
from __future__ import annotations

import numpy as np

from ..schemas import OnsetInfo, PatternSummary, TempoInfo


def summarize_pattern(
    y: np.ndarray,
    sr: int,
    tempo: TempoInfo,
    onsets: OnsetInfo,
) -> PatternSummary:
    duration = len(y) / sr if sr else 0.0
    density = onsets.count / duration if duration > 0 else 0.0

    bars = 0
    if tempo.bpm > 0 and duration > 0:
        # Assume 4/4 for now.
        beats = duration * tempo.bpm / 60.0
        bars = int(beats // 4)

    notes: list[str] = []
    if density < 1.0:
        notes.append("Sparse — good for slow practice.")
    elif density < 3.0:
        notes.append("Medium density — typical rock/pop groove.")
    else:
        notes.append("Busy pattern — fast hats or fills likely.")

    if tempo.bpm > 160:
        notes.append("Fast tempo — try half-time first.")
    elif tempo.bpm and tempo.bpm < 80:
        notes.append("Slow tempo — great for accuracy work.")

    return PatternSummary(
        bars=bars,
        time_signature="4/4",
        density=float(density),
        notes=notes,
    )
