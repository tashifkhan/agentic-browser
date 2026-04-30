import edge_tts
import io
import asyncio
from core import get_logger

logger = get_logger(__name__)

class TTSService:
    def __init__(self):
        # Default voice for Edge TTS
        self.default_voice = "en-US-AvaNeural"

    async def text_to_speech(self, text: str, voice: str = None) -> bytes:
        """
        Convert text to speech and return audio bytes.
        """
        try:
            voice = voice or self.default_voice
            logger.info(f"Generating TTS for text: '{text[:50]}...' with voice {voice}")
            
            communicate = edge_tts.Communicate(text, voice)
            audio_data = io.BytesIO()
            
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_data.write(chunk["data"])
            
            return audio_data.getvalue()
            
        except Exception as e:
            logger.error(f"TTS generation error: {e}")
            raise e

# Create a singleton instance
tts_service = TTSService()
