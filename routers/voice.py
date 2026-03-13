import os
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File
from core import get_logger
from faster_whisper import WhisperModel

router = APIRouter()
logger = get_logger(__name__)

# Use the project's upload directory for temporary storage
UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# Initialize Whisper model lazily
_model = None

def get_whisper_model():
    global _model
    if _model is None:
        logger.info("Initializing faster-whisper model (tiny)...")
        # tiny is fast and lightweight, suitable for browser input
        _model = WhisperModel("tiny", device="cpu", compute_type="int8")
    return _model

@router.post("/transcribe", response_model=dict)
async def transcribe_voice(file: UploadFile = File(...)):
    """Transcribe voice audio to text using Whisper."""
    temp_file_path = None
    try:
        # Validate content type (basic check)
        if not file.content_type.startswith("audio/"):
            logger.warning(f"Unexpected content type for voice upload: {file.content_type}")
            # We'll still try to process it as audio if the client sent it as such

        # Save the uploaded blob to a temporary file
        unique_id = uuid.uuid4().hex[:8]
        extension = Path(file.filename or "audio.webm").suffix or ".webm"
        temp_filename = f"voice_{unique_id}{extension}"
        temp_file_path = UPLOAD_DIR / temp_filename
        
        contents = await file.read()
        temp_file_path.write_bytes(contents)
        
        logger.info(f"Voice audio received: {temp_filename} ({len(contents)} bytes)")

        # Transcribe
        model = get_whisper_model()
        segments, info = model.transcribe(str(temp_file_path), beam_size=5)
        
        logger.info(f"Detected language '{info.language}' with probability {info.language_probability}")

        transcript_parts = []
        for segment in segments:
            transcript_parts.append(segment.text)

        full_transcript = " ".join(transcript_parts).strip()
        
        logger.info(f"Transcription complete: {full_transcript[:50]}...")

        return {
            "ok": True,
            "text": full_transcript,
            "language": info.language,
            "language_probability": info.language_probability
        }

    except Exception as e:
        logger.error(f"Voice transcription error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
    finally:
        # Cleanup temporary file
        if temp_file_path and temp_file_path.exists():
            try:
                temp_file_path.unlink()
            except Exception as e:
                logger.error(f"Failed to delete temporary voice file {temp_file_path}: {e}")
