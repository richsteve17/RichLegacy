"""File upload + serving endpoints."""
from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from ..config import settings
from ..schemas import UploadResponse

router = APIRouter()

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".aiff"}


def _safe_extension(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {sorted(ALLOWED_EXTENSIONS)}",
        )
    return ext


@router.post("/upload", response_model=UploadResponse)
async def upload_audio(file: UploadFile = File(...)) -> UploadResponse:
    """Accept a local audio file from the browser.

    The frontend reads the file from disk (user-picked) and POSTs the
    bytes here. We persist them to ``uploads/`` keyed by a fresh UUID.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    ext = _safe_extension(file.filename)
    file_id = uuid.uuid4().hex
    dest = settings.upload_dir / f"{file_id}{ext}"

    # Stream to disk with a size cap.
    max_bytes = settings.max_upload_mb * 1024 * 1024
    written = 0
    with dest.open("wb") as out:
        while chunk := await file.read(1024 * 1024):
            written += len(chunk)
            if written > max_bytes:
                out.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail=f"File exceeds {settings.max_upload_mb} MB limit",
                )
            out.write(chunk)

    return UploadResponse(
        file_id=file_id,
        filename=file.filename,
        size_bytes=written,
        content_type=file.content_type or "application/octet-stream",
    )


@router.get("/files/{file_id}")
def get_file(file_id: str) -> FileResponse:
    """Serve a previously uploaded file (used by the frontend audio element)."""
    matches = list(settings.upload_dir.glob(f"{file_id}.*"))
    if not matches:
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(matches[0])
