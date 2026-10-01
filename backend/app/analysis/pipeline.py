"""Full analysis pipeline that composes the individual modules."""
from __future__ import annotations

from pathlib import Path

from ..config import settings
from ..schemas import AnalysisResponse
from .drums import classify_drums
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
    drum_hits, k_cnt, s_cnt, h_cnt = classify_drums(y, sr, onsets)
    pattern = summarize_pattern(
        y, sr, tempo, onsets, kick_count=k_cnt, snare_count=s_cnt, hihat_count=h_cnt
    )
    kits = suggest_kits(tempo, pattern)

    return AnalysisResponse(
        file_id=file_id,
        duration_sec=duration,
        sample_rate=sr,
        tempo=tempo,
        onsets=onsets,
        drum_hits=drum_hits,
        pattern=pattern,
        kit_suggestions=kits,
    )
