import os
import uuid
import hashlib
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File
from core import get_logger
from services.app_state import AppStateService
from services.secrets_service import get_secrets_service
import openai
import httpx
from fastapi.responses import Response
from routers.integrations import _voice_effective

# Importing the voice service also applies its PyAV fix for faster-whisper.
import services.voice_input  # noqa: E402,F401

router = APIRouter()
logger = get_logger(__name__)



# Use the project's upload directory for temporary storage
UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# TTS Audio Cache (text_hash -> (audio_bytes, content_type))
_tts_cache: dict[str, tuple[bytes, str]] = {}
_tts_cache_max_size = 50


def _get_cache_key(text: str, provider: str, voice: str) -> str:
    """Generate cache key from text and voice config."""
    key_str = f"{provider}:{voice}:{text}"
    return hashlib.sha256(key_str.encode()).hexdigest()


def _get_from_cache(key: str) -> tuple[bytes, str] | None:
    """Get cached audio if available."""
    cached = _tts_cache.get(key)
    if cached:
        logger.info(f"TTS cache hit: {key[:8]}...")
        return cached
    return None


def _save_to_cache(key: str, audio_bytes: bytes, content_type: str):
    """Save audio to cache with LRU eviction."""
    global _tts_cache
    if len(_tts_cache) >= _tts_cache_max_size:
        # Remove oldest entry (simple FIFO for now)
        oldest_key = next(iter(_tts_cache))
        del _tts_cache[oldest_key]
    _tts_cache[key] = (audio_bytes, content_type)


@router.post("/transcribe", response_model=dict)
async def transcribe_voice(file: UploadFile = File(...)):
    """Recording in, composer text out, by the route set in Settings → Voice
    (services/voice_input.py): transcription (optionally cleaned up) or one
    pass through a model that hears audio."""
    from services.voice_input import speech_to_text

    extension = Path(file.filename or "audio.webm").suffix or ".webm"
    temp_file_path = UPLOAD_DIR / f"voice_{uuid.uuid4().hex[:8]}{extension}"
    try:
        contents = await file.read()
        temp_file_path.write_bytes(contents)
        logger.info("Voice audio received: %s (%d bytes)", temp_file_path.name, len(contents))
        result = await speech_to_text(temp_file_path, await _voice_effective())
        logger.info("Voice (%s, %s/%s): %s", result["route"], result["provider"], result["model"], result["text"][:60])
        return {"ok": True, **result}
    except Exception as e:
        logger.error(f"Voice transcription error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        temp_file_path.unlink(missing_ok=True)


@router.get("/models")
async def voice_models():
    """Model choices per provider for the voice settings."""
    from services.voice_input import model_options

    return await model_options()


@router.post("/speak")
async def speak_text(payload: dict):
    """Generate speech from text using the configured TTS provider with a robust fallback chain."""
    text = payload.get("text")
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    try:
        voice_cfg = await _voice_effective()
        preferred_provider = voice_cfg.get("tts_provider", "browser_native")
        tts_voice = voice_cfg.get("tts_voice", "alloy")

        if preferred_provider == "browser_native":
            return {"ok": True, "method": "browser_native", "text": text}

        # Check cache first (using preferred provider/voice)
        cache_key = _get_cache_key(text, preferred_provider, tts_voice)
        cached = _get_from_cache(cache_key)
        if cached:
            return Response(content=cached[0], media_type=cached[1])

        sec = get_secrets_service()
        
        # Define the chain of providers to try
        # We start with the preferred one, then try others in order
        providers_to_try = [preferred_provider]
        all_possible = ["cartesia", "openai", "elevenlabs"]
        for p in all_possible:
            if p not in providers_to_try:
                providers_to_try.append(p)
        providers_to_try.append("browser_native")

        last_error = None
        for provider in providers_to_try:
            try:
                if provider == "browser_native":
                    return {"ok": True, "method": "browser_native", "text": text}

                if provider == "cartesia":
                    api_key = await sec.resolve("cartesia_api_key")
                    if not api_key:
                        continue
                    
                    async with httpx.AsyncClient() as client:
                        resp = await client.post(
                            "https://api.cartesia.ai/tts/bytes",
                            headers={
                                "X-API-Key": api_key,
                                "Cartesia-Version": "2024-06-10",
                                "Content-Type": "application/json",
                            },
                            json={
                                "transcript": text,
                                "model_id": "sonic-english",
                                "voice": {
                                    "mode": "id",
                                    "id": tts_voice if (tts_voice and "-" in tts_voice) else "9fb269e7-70fe-4cbe-aa3f-28bdb67e3e84",
                                },
                                "output_format": {"container": "mp3", "sample_rate": 44100},
                            },
                            timeout=10.0,
                        )
                        if resp.status_code == 200:
                            _save_to_cache(cache_key, resp.content, "audio/mpeg")
                            return Response(content=resp.content, media_type="audio/mpeg")
                        continue

                elif provider == "openai":
                    api_key = await sec.resolve("openai_api_key")
                    if not api_key:
                        continue

                    client = openai.AsyncOpenAI(api_key=api_key)
                    response = await client.audio.speech.create(
                        model="tts-1",
                        voice=tts_voice if tts_voice in ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] else "alloy",
                        input=text
                    )
                    _save_to_cache(cache_key, response.content, "audio/mpeg")
                    return Response(content=response.content, media_type="audio/mpeg")

                elif provider == "elevenlabs":
                    api_key = await sec.resolve("elevenlabs_api_key")
                    if not api_key:
                        continue

                    voice_id = tts_voice if (tts_voice and len(tts_voice) > 10) else "21m00Tcm4lPqWmrteZzo"
                    async with httpx.AsyncClient() as client:
                        resp = await client.post(
                            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
                            headers={"xi-api-key": api_key, "Content-Type": "application/json"},
                            json={
                                "text": text,
                                "model_id": "eleven_monolingual_v1",
                                "voice_settings": {"stability": 0.5, "similarity_boost": 0.5},
                            },
                            timeout=15.0,
                        )
                        if resp.status_code == 200:
                            _save_to_cache(cache_key, resp.content, "audio/mpeg")
                            return Response(content=resp.content, media_type="audio/mpeg")
                        continue
            except Exception as e:
                logger.warning(f"TTS provider {provider} failed: {e}")
                last_error = e
                continue

        # If all cloud providers fail, return browser_native
        return {"ok": True, "method": "browser_native", "text": text}

    except Exception as e:
        logger.error(f"Voice synthesis error: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))
