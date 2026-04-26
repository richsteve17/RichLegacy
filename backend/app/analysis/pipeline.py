"""Full analysis pipeline that composes the individual modules."""
from __future__ import annotations

from pathlib import Path

from ..config import settings
from ..schemas import AnalysisResponse
from .kit import suggest_kits
from .loader import load_audio
from .onset import detect_onsets
from .pattern import summarize_pattern
from .tempo import estimate_tempo


def analyze_file(file_id: str, path: Path) -> AnalysisResponse:
    y, sr = load_audio(path, sr=settings.target_sample_rate)
    duration = float(len(y) / sr) if sr else 0.0

    tempo = estimate_tempo(y, sr)
    onsets = detect_onsets(y, sr)
    pattern = summarize_pattern(y, sr, tempo, onsets)
    kits = suggest_kits(tempo, pattern)

    return AnalysisResponse(
        file_id=file_id,
        duration_sec=duration,
        sample_rate=sr,
        tempo=tempo,
        onsets=onsets,
        pattern=pattern,
        kit_suggestions=kits,
    )
