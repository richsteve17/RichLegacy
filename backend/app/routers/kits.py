"""Router for serving drum kit samples."""
from __future__ import annotations

from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter()

KIT_DIR = Path(r"C:\Users\richs\Music\Punk Kit - Reloop Ready")


@router.get("/kits/samples/{pad_num}")
def get_sample(pad_num: int) -> FileResponse:
    """Serves one of the 16 drum pad samples (1..16)."""
    if pad_num < 1 or pad_num > 16:
        raise HTTPException(status_code=400, detail="Pad number must be 1..16")

    pattern = f"Pad_{pad_num:02d}_*.wav"
    matches = list(KIT_DIR.glob(pattern)) if KIT_DIR.exists() else []

    if not matches:
        raise HTTPException(status_code=404, detail=f"Sample for pad {pad_num} not found")

    return FileResponse(matches[0], media_type="audio/wav")
