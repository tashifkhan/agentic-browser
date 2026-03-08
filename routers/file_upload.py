import os
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File
from core import get_logger

router = APIRouter()
logger = get_logger(__name__)

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED_EXTENSIONS = {
    # Images
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
    # Documents
    ".pdf", ".txt", ".md", ".csv", ".json", ".xml",
    # Code
    ".py", ".js", ".ts", ".html", ".css", ".java", ".c", ".cpp", ".go", ".rs",
}

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("/", response_model=dict)
async def upload_file(file: UploadFile = File(...)):
    """Upload a file and return its metadata + saved path."""
    try:
        # Validate extension
        ext = Path(file.filename or "").suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"File type '{ext}' is not allowed. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
            )

        # Read contents (with size check)
        contents = await file.read()
        if len(contents) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024 * 1024)} MB.",
            )

        # Save with unique name to avoid collisions
        unique_name = f"{uuid.uuid4().hex[:8]}_{file.filename}"
        save_path = UPLOAD_DIR / unique_name
        save_path.write_bytes(contents)

        logger.info(f"File uploaded: {unique_name} ({len(contents)} bytes)")

        return {
            "ok": True,
            "filename": file.filename,
            "saved_as": unique_name,
            "path": str(save_path),
            "size": len(contents),
            "content_type": file.content_type or "application/octet-stream",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
