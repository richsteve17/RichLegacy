"""Drum kit suggestion heuristics.

Stub: maps tempo + density to kit archetypes. Replace with a real
classifier (spectral features → genre → kit) when you're ready.
"""
from __future__ import annotations

from ..schemas import KitSuggestion, PatternSummary, TempoInfo


def suggest_kits(tempo: TempoInfo, pattern: PatternSummary) -> list[KitSuggestion]:
    bpm = tempo.bpm
    density = pattern.density
    suggestions: list[KitSuggestion] = []

    if bpm and bpm < 95 and density < 2.0:
        suggestions.append(
            KitSuggestion(
                name="Vintage Jazz Kit",
                reason="Slower tempo and sparse onsets suit brushes and warm toms.",
                score=0.85,
            )
        )
    if 90 <= bpm <= 130:
        suggestions.append(
            KitSuggestion(
                name="Studio Rock Kit",
                reason="Mid-tempo with steady density — classic rock pocket.",
                score=0.9,
            )
        )
    if bpm > 125 and density > 2.5:
        suggestions.append(
            KitSuggestion(
                name="Punchy Modern Kit",
                reason="Fast and busy — tight snare and bright hats cut through.",
                score=0.88,
            )
        )
    if density > 3.5:
        suggestions.append(
            KitSuggestion(
                name="Electronic / Hybrid Kit",
                reason="High onset density suggests programmed or hybrid drums.",
                score=0.7,
            )
        )

    if not suggestions:
        suggestions.append(
            KitSuggestion(
                name="Standard Acoustic Kit",
                reason="A safe default that works across most styles.",
                score=0.6,
            )
        )
    return suggestions
