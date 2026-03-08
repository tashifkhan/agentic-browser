import os
import yt_dlp
from core import get_logger

logger = get_logger(__name__)


def get_subtitle_content(video_url: str, lang: str = "en") -> str:
    """Downloads and extracts subtitle content for a given video URL.

    Uses a single-pass approach to avoid rate limiting, then falls back to
    alternative languages if the preferred language isn't available.

    Priority:
    1. Manual/auto-generated/auto-translated subs in preferred language (single request)
    2. Original-language or any available subtitle (one retry)
    3. Whisper audio transcription fallback
    """
    temp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "temp_subs")
    os.makedirs(temp_dir, exist_ok=True)

    try:
        # Single-pass: try preferred language (manual + auto-generated + auto-translated)
        ydl_opts = {
            "writesubtitles": True,
            "writeautomaticsub": True,
            "subtitleslangs": [lang],
            "subtitlesformat": "vtt/srt/best",
            "skip_download": True,
            "outtmpl": os.path.join(temp_dir, "%(id)s.%(ext)s"),
            "quiet": True,
            "no_warnings": True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            logger.info(
                f"Attempting to download subtitles for {video_url} in lang={lang}"
            )
            info = ydl.extract_info(video_url, download=True)

            if not info:
                logger.error(f"Could not extract video info for {video_url}")
                return "Video unavailable."

            requested_subs = info.get("requested_subtitles") or {}

            # Try to extract subtitle content from the preferred language
            content = _extract_subtitle_from_requested(requested_subs, lang)
            if content:
                logger.info(
                    f"Successfully got subtitles in preferred lang={lang} for {video_url}"
                )
                return content

            # Preferred language not available — find an alternative from info
            alt_lang = _find_alternative_language(info, lang)

            if alt_lang:
                logger.info(
                    f"Preferred lang={lang} not available. "
                    f"Trying alternative lang={alt_lang} for {video_url}"
                )
                # Try extracting from already-available requested subs first
                content = _extract_subtitle_from_requested(requested_subs, alt_lang)
                if content:
                    return content

        # If we need a different language, make one more request
        if alt_lang and alt_lang != lang:
            content = _download_single_subtitle(video_url, alt_lang, temp_dir)
            if content:
                return content

        # No subtitles at all — fall back to Whisper
        logger.info(
            f"No subtitle tracks found for {video_url}. Falling back to Whisper."
        )
        return download_audio_and_transcribe(video_url)

    except yt_dlp.utils.DownloadError as e:
        error_str = str(e).lower()
        logger.error(f"yt-dlp DownloadError for subtitles: {e} for URL {video_url}")

        if "video unavailable" in error_str:
            return "Video unavailable."

        # On 429 or subtitle-specific errors, try Whisper fallback
        if "429" in str(e) or "too many requests" in error_str:
            logger.warning(
                f"Rate limited (429) fetching subtitles. Falling back to Whisper."
            )
            return download_audio_and_transcribe(video_url)

        if (
            "subtitles not available" in error_str
            or "no closed captions found" in error_str
        ):
            logger.info("No subtitles available, falling back to Whisper.")
            return download_audio_and_transcribe(video_url)

        return f"Error downloading subtitles: {str(e)}"

    except Exception as e:
        logger.error(f"Error getting subtitle content: {e} for URL {video_url}")
        return f"An unexpected error occurred while fetching subtitles: {str(e)}"

    finally:
        try:
            if os.path.exists(temp_dir):
                for f_name in os.listdir(temp_dir):
                    os.remove(os.path.join(temp_dir, f_name))
                os.rmdir(temp_dir)
                logger.info(f"Cleaned up temp directory: {temp_dir}")
        except Exception as e_cleanup:
            logger.error(f"Error cleaning up temp directory {temp_dir}: {e_cleanup}")


def _extract_subtitle_from_requested(requested_subs: dict, lang: str) -> str | None:
    """Try to read subtitle content from yt-dlp's requested_subtitles dict."""
    if not requested_subs:
        return None

    # Try exact language match first
    if lang in requested_subs:
        return _read_subtitle_info(requested_subs[lang])

    # Try any available language in requested subs
    for sub_lang, subtitle_info in requested_subs.items():
        content = _read_subtitle_info(subtitle_info)
        if content:
            logger.info(f"Found subtitle content from lang={sub_lang}")
            return content

    return None


def _read_subtitle_info(subtitle_info: dict) -> str | None:
    """Read subtitle content from a single subtitle info entry."""
    filepath = subtitle_info.get("filepath")
    if filepath and os.path.exists(filepath):
        with open(filepath, "r", encoding="utf-8") as f:
            return f.read()

    if subtitle_info.get("data"):
        return subtitle_info["data"]

    return None


def _find_alternative_language(info: dict, exclude_lang: str) -> str | None:
    """Find the best alternative subtitle language from video info.

    Checks both manual subtitles and automatic_captions.
    Returns the language code or None.
    """
    manual_subs = info.get("subtitles") or {}
    auto_captions = info.get("automatic_captions") or {}

    # Prefer manual subs in any language
    for lang_code in manual_subs:
        if lang_code != exclude_lang:
            return lang_code

    # Then auto captions in any language
    for lang_code in auto_captions:
        if lang_code != exclude_lang:
            return lang_code

    return None


def _download_single_subtitle(video_url: str, lang: str, temp_dir: str) -> str | None:
    """Download subtitles for a specific language. Returns content or None."""
    try:
        ydl_opts = {
            "writesubtitles": True,
            "writeautomaticsub": True,
            "subtitleslangs": [lang],
            "subtitlesformat": "vtt/srt/best",
            "skip_download": True,
            "outtmpl": os.path.join(temp_dir, "%(id)s.%(ext)s"),
            "quiet": True,
            "no_warnings": True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            logger.info(f"Downloading subtitles for {video_url} in lang={lang}")
            info = ydl.extract_info(video_url, download=True)

            if not info:
                return None

            requested_subs = info.get("requested_subtitles") or {}
            return _extract_subtitle_from_requested(requested_subs, lang)

    except Exception as e:
        logger.warning(f"Failed to download alt-lang={lang} subtitles: {e}")
        return None


def download_audio_and_transcribe(video_url: str) -> str:
    """
    Downloads audio from YouTube video and transcribes it using faster-whisper.
    Returns the transcription text.
    """
    import shutil
    from faster_whisper import WhisperModel

    temp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "temp_audio")
    os.makedirs(temp_dir, exist_ok=True)
    audio_path = os.path.join(temp_dir, "audio")  # yt-dlp will add extension

    try:
        # 1. Download Audio
        logger.info(f"Downloading audio for fallback transcription: {video_url}")
        ydl_opts = {
            "format": "m4a/bestaudio/best",
            "outtmpl": audio_path,
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "192",
                }
            ],
            "http_headers": {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            },
            "quiet": True,
            "no_warnings": True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([video_url])

        # yt-dlp with mp3 conversion will result in audio.mp3
        final_audio_path = audio_path + ".mp3"
        if not os.path.exists(final_audio_path):
            # Try finding whatever was downloaded
            files = os.listdir(temp_dir)
            if files:
                final_audio_path = os.path.join(temp_dir, files[0])
            else:
                return "Error: Audio download failed, no file found."

        # 2. Transcribe with Faster Whisper
        logger.info("Starting transcription with faster-whisper...")
        model_size = "tiny"  # fast and lightweight
        model = WhisperModel(model_size, device="cpu", compute_type="int8")

        segments, info = model.transcribe(final_audio_path, beam_size=5)

        logger.info(
            f"Detected language '{info.language}' with probability {info.language_probability}"
        )

        transcript_parts = []
        for segment in segments:
            transcript_parts.append(segment.text)

        full_transcript = " ".join(transcript_parts)
        return full_transcript.strip()

    except Exception as e:
        logger.error(f"Error in fallback transcription: {e}")
        return f"Error generating transcript: {str(e)}"

    finally:
        # Cleanup
        if os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
                logger.info("Cleaned up temp audio directory.")
            except Exception as e:
                logger.error(f"Failed to clean up temp audio dir: {e}")
