"""Router for serving drum kit samples."""
from __future__ import annotations

from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter()

KIT_DIR = Path(__file__).resolve().parent.parent.parent / "kits" / "reloop-punk"
if not KIT_DIR.exists():
    KIT_DIR = Path(__file__).resolve().parent.parent.parent.parent / "frontend" / "public" / "kits" / "reloop-punk"


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


@router.get("/kits/elements/{element_name}")
def get_element_sample(element_name: str) -> FileResponse:
    """Serves a drum sample by element name (kick, snare, hihat, crash, ride, etc.)."""
    cleaned = element_name.lower().strip()
    target_file = KIT_DIR / f"{cleaned}.wav"

    if not target_file.exists():
        # Fallbacks for element variations
        if "hat" in cleaned:
            target_file = KIT_DIR / "hihat.wav"
        elif "snare" in cleaned:
            target_file = KIT_DIR / "snare.wav"
        elif "kick" in cleaned:
            target_file = KIT_DIR / "kick.wav"
        elif "crash" in cleaned:
            target_file = KIT_DIR / "crash.wav"
        elif "ride" in cleaned:
            target_file = KIT_DIR / "ride.wav"
        elif "tom" in cleaned:
            target_file = KIT_DIR / "tomHigh.wav"

    if not target_file or not target_file.exists():
        raise HTTPException(status_code=404, detail=f"Sample for element '{element_name}' not found")

    return FileResponse(target_file, media_type="audio/wav")
