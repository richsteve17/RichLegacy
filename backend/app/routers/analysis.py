"""Audio analysis endpoints."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..analysis.pipeline import analyze_file
from ..config import settings
from ..schemas import AnalysisResponse

router = APIRouter()


@router.post("/analyze/{file_id}", response_model=AnalysisResponse)
def analyze(file_id: str) -> AnalysisResponse:
    matches = list(settings.upload_dir.glob(f"{file_id}.*"))
    if not matches:
        raise HTTPException(status_code=404, detail="File not found")
    return analyze_file(file_id, matches[0])
