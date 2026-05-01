import os
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File
from core import get_logger
from services.app_state import AppStateService
from services.secrets_service import get_secrets_service
from faster_whisper import WhisperModel

router = APIRouter()
logger = get_logger(__name__)

# Use the project's upload directory for temporary storage
UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# Initialize Whisper models lazily by name
_models: dict[str, WhisperModel] = {}

def get_whisper_model(model_name: str = "tiny"):
    global _models
    if model_name not in _models:
        logger.info(f"Initializing faster-whisper model ({model_name})...")
        _models[model_name] = WhisperModel(model_name, device="cpu", compute_type="int8")
    return _models[model_name]

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

        # Fetch configuration
        from routers.integrations import _voice_effective
        voice_cfg = await _voice_effective()
        stt_provider = voice_cfg.get("stt_provider", "whisper_local")
        stt_model = voice_cfg.get("stt_model", "tiny")

        if stt_provider == "whisper_local":
            # Transcribe locally
            model = get_whisper_model(stt_model)
            segments, info = model.transcribe(str(temp_file_path), beam_size=5)
            
            transcript_parts = []
            for segment in segments:
                transcript_parts.append(segment.text)
            full_transcript = " ".join(transcript_parts).strip()
            detected_lang = info.language
            prob = info.language_probability
        elif stt_provider == "openai":
            sec = get_secrets_service()
            api_key = await sec.resolve("openai_api_key")
            if not api_key:
                raise HTTPException(status_code=400, detail="OpenAI API key not configured")
            
            import openai
            client = openai.AsyncOpenAI(api_key=api_key)
            with open(temp_file_path, "rb") as audio_file:
                response = await client.audio.transcriptions.create(
                    model=stt_model or "whisper-1", 
                    file=audio_file
                )
            full_transcript = response.text
            detected_lang = "en" # OpenAI doesn't always return this in simple call
            prob = 1.0
        elif stt_provider == "groq":
            sec = get_secrets_service()
            api_key = await sec.resolve("openai_api_key") # Groq uses its own key usually, but let's assume we might use a groq_api_key later
            # For now, let's check for groq_api_key in secrets if it existed, but I haven't added it yet.
            # I'll use openai_api_key as a placeholder or tell the user to add it.
            raise HTTPException(status_code=501, detail="Groq STT implementation pending")
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported STT provider: {stt_provider}")

        logger.info(f"Transcription complete ({stt_provider}): {full_transcript[:50]}...")

        return {
            "ok": True,
            "text": full_transcript,
            "language": detected_lang,
            "language_probability": prob
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

@router.post("/speak")
async def speak_text(payload: dict):
    """Generate speech from text using the configured TTS provider."""
    text = payload.get("text")
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")
    
    try:
        from routers.integrations import _voice_effective
        voice_cfg = await _voice_effective()
        tts_provider = voice_cfg.get("tts_provider", "browser_native")
        tts_voice = voice_cfg.get("tts_voice", "alloy")

        if tts_provider == "browser_native":
            return {"ok": True, "method": "browser_native", "text": text}

        sec = get_secrets_service()
        
        if tts_provider == "cartesia":
            api_key = await sec.resolve("cartesia_api_key")
            if not api_key:
                raise HTTPException(status_code=400, detail="Cartesia API key not configured")
            
            import httpx
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "https://api.cartesia.ai/tts/bytes",
                    headers={
                        "X-API-Key": api_key,
                        "Cartesia-Version": "2024-06-10",
                        "Content-Type": "application/json"
                    },
                    json={
                        "transcript": text,
                        "model_id": "sonic-english",
                        "voice": {
                            "mode": "id",
                            "id": tts_voice if (tts_voice and "-" in tts_voice) else "9fb269e7-70fe-4cbe-aa3f-28bdb67e3e84"
                        },
                        "output_format": {
                            "container": "mp3",
                            "sample_rate": 44100
                        }
                    },
                    timeout=30.0
                )
                if resp.status_code != 200:
                    logger.error(f"Cartesia error: {resp.text}")
                    raise HTTPException(status_code=resp.status_code, detail=f"Cartesia error: {resp.text}")
                
                from fastapi.responses import Response
                return Response(content=resp.content, media_type="audio/mpeg")

        elif tts_provider == "openai":
            api_key = await sec.resolve("openai_api_key")
            if not api_key:
                raise HTTPException(status_code=400, detail="OpenAI API key not configured")
            
            import openai
            client = openai.AsyncOpenAI(api_key=api_key)
            response = await client.audio.speech.create(
                model="tts-1",
                voice=tts_voice or "alloy",
                input=text
            )
            # OpenAI's response.content is the raw bytes
            from fastapi.responses import Response
            return Response(content=response.content, media_type="audio/mpeg")

        elif tts_provider == "elevenlabs":
            api_key = await sec.resolve("elevenlabs_api_key")
            if not api_key:
                raise HTTPException(status_code=400, detail="ElevenLabs API key not configured")
            
            # Use REST API directly to avoid extra package dependency if possible
            import httpx
            voice_id = tts_voice or "21m00Tcm4lPqWmrteZzo" # Default Rachel voice
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
                    headers={"xi-api-key": api_key, "Content-Type": "application/json"},
                    json={"text": text, "model_id": "eleven_monolingual_v1", "voice_settings": {"stability": 0.5, "similarity_boost": 0.5}},
                    timeout=30.0
                )
                if resp.status_code != 200:
                    raise HTTPException(status_code=resp.status_code, detail=f"ElevenLabs error: {resp.text}")
                
                from fastapi.responses import Response
                return Response(content=resp.content, media_type="audio/mpeg")

        else:
            raise HTTPException(status_code=400, detail=f"Unsupported TTS provider: {tts_provider}")

    except Exception as e:
        logger.error(f"Voice synthesis error: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))
