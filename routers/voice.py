import os
import uuid
import hashlib
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File
from core import get_logger
from services.app_state import AppStateService
from services.secrets_service import get_secrets_service
from faster_whisper import WhisperModel
from groq import Groq
import openai
import httpx
from fastapi.responses import Response
from routers.integrations import _voice_effective

router = APIRouter()
logger = get_logger(__name__)


def _patch_pyav_open() -> None:
    """PyAV 15 removed the `metadata_errors` argument, but faster-whisper
    1.2.1 still passes it when decoding audio, so every local transcription
    failed with "open() got an unexpected keyword argument". Drop it there."""
    import av

    if int(av.__version__.split(".")[0]) < 15 or getattr(av.open, "_compat", False):
        return
    original = av.open

    def open_compat(*args, metadata_errors=None, **kwargs):
        return original(*args, **kwargs)

    open_compat._compat = True  # type: ignore[attr-defined]
    av.open = open_compat


_patch_pyav_open()

# Use the project's upload directory for temporary storage
UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# Initialize Whisper models lazily by name
_models: dict[str, WhisperModel] = {}

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


def get_whisper_model(model_name: str = "tiny"):
    global _models
    if model_name not in _models:
        logger.info(f"Initializing faster-whisper model ({model_name})...")
        _models[model_name] = WhisperModel(
            model_name, device="cpu", compute_type="int8"
        )
    return _models[model_name]


@router.post("/transcribe", response_model=dict)
async def transcribe_voice(file: UploadFile = File(...)):
    """Transcribe voice audio to text using Whisper."""
    temp_file_path = None
    try:
        # Validate content type (basic check)
        if not file.content_type.startswith("audio/"):
            logger.warning(
                f"Unexpected content type for voice upload: {file.content_type}"
            )
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
                raise HTTPException(
                    status_code=400, detail="OpenAI API key not configured"
                )

            client = openai.AsyncOpenAI(api_key=api_key)
            with open(temp_file_path, "rb") as audio_file:
                response = await client.audio.transcriptions.create(
                    model=stt_model or "whisper-1", file=audio_file
                )
            full_transcript = response.text
            detected_lang = "en"  # OpenAI doesn't always return this in simple call
            prob = 1.0
        elif stt_provider == "groq":
            sec = get_secrets_service()
            api_key = await sec.resolve("groq_api_key")
            if not api_key:
                raise HTTPException(
                    status_code=400, detail="Groq API key not configured"
                )

            try:
                client = Groq(api_key=api_key)
                # Map local model names to Groq equivalents if needed
                model = stt_model
                if not model or model in [
                    "tiny",
                    "base",
                    "small",
                    "medium",
                    "large",
                    "whisper-1",
                ]:
                    model = "whisper-large-v3"

                with open(temp_file_path, "rb") as audio_file:
                    response = client.audio.transcriptions.create(
                        file=(str(temp_file_path), audio_file.read()),
                        model=model,
                        response_format="json",
                        language="en",  # Always English as requested
                    )
                full_transcript = response.text
                detected_lang = "en"
                prob = 1.0
            except Exception as e:
                logger.error(f"Groq transcription failed, falling back to local: {e}")
                # Fallback to local whisper
                model = get_whisper_model(stt_model or "tiny")
                segments, info = model.transcribe(str(temp_file_path), beam_size=5)
                transcript_parts = []
                for segment in segments:
                    transcript_parts.append(segment.text)
                full_transcript = " ".join(transcript_parts).strip()
                detected_lang = info.language
                prob = info.language_probability
        else:
            raise HTTPException(
                status_code=400, detail=f"Unsupported STT provider: {stt_provider}"
            )

        logger.info(
            f"Transcription complete ({stt_provider}): {full_transcript[:50]}..."
        )

        return {
            "ok": True,
            "text": full_transcript,
            "language": detected_lang,
            "language_probability": prob,
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
                logger.error(
                    f"Failed to delete temporary voice file {temp_file_path}: {e}"
                )


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
