"""Pydantic schemas shared across routers."""
from __future__ import annotations

from pydantic import BaseModel, Field


class UploadResponse(BaseModel):
    file_id: str
    filename: str
    size_bytes: int
    content_type: str


class OnsetInfo(BaseModel):
    times: list[float] = Field(default_factory=list, description="Onset times (s)")
    count: int = 0


class TempoInfo(BaseModel):
    bpm: float = 0.0
    beat_times: list[float] = Field(default_factory=list)


class PatternSummary(BaseModel):
    bars: int = 0
    time_signature: str = "4/4"
    density: float = 0.0  # onsets per second
    notes: list[str] = Field(default_factory=list)


class KitSuggestion(BaseModel):
    name: str
    reason: str
    score: float


class AnalysisResponse(BaseModel):
    file_id: str
    duration_sec: float
    sample_rate: int
    tempo: TempoInfo
    onsets: OnsetInfo
    pattern: PatternSummary
    kit_suggestions: list[KitSuggestion]
