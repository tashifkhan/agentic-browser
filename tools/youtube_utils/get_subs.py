import os
import yt_dlp
from core import get_logger

logger = get_logger(__name__)


def get_subtitle_content(video_url: str, lang: str = "en") -> str:
    """Downloads and extracts subtitle content for a given video URL.

    Uses a multi-strategy approach to find the best available subtitles:
    1. Manual/uploaded subtitles in the preferred language
    2. Auto-generated subtitles in the preferred language
    3. Auto-translated subtitles into the preferred language (from any source language)
    4. Original-language auto-generated subtitles (non-translated)
    5. Any available subtitle track
    6. Whisper audio transcription fallback
    """
    temp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "temp_subs")
    os.makedirs(temp_dir, exist_ok=True)

    try:
        # Phase 1: Inspect available subtitles without downloading
        inspect_opts = {
            "skip_download": True,
            "quiet": True,
            "no_warnings": True,
        }

        with yt_dlp.YoutubeDL(inspect_opts) as ydl:
            logger.info(f"Inspecting available subtitles for {video_url}")
            info = ydl.extract_info(video_url, download=False)

            if not info:
                logger.error(f"Could not extract video info for {video_url}")
                return "Video unavailable."

        manual_subs = info.get("subtitles") or {}
        auto_captions = info.get("automatic_captions") or {}

        # Determine the best subtitle strategy
        chosen_lang, strategy = _pick_best_subtitle(
            manual_subs, auto_captions, preferred_lang=lang
        )

        if chosen_lang is None:
            # No subtitles available at all — fall back to Whisper
            logger.info(
                f"No subtitle tracks found for {video_url}. Falling back to Whisper."
            )
            return download_audio_and_transcribe(video_url)

        logger.info(
            f"Chose subtitle strategy: {strategy} | lang={chosen_lang} for {video_url}"
        )

        # Phase 2: Download the chosen subtitle
        return _download_subtitle(video_url, chosen_lang, temp_dir)

    except yt_dlp.utils.DownloadError as e:
        logger.error(f"yt-dlp DownloadError for subtitles: {e} for URL {video_url}")

        if "video unavailable" in str(e).lower():
            return "Video unavailable."

        if (
            "subtitles not available" in str(e).lower()
            or "no closed captions found" in str(e).lower()
        ):
            return "Subtitles not available for the specified language."

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


def _pick_best_subtitle(
    manual_subs: dict, auto_captions: dict, preferred_lang: str = "en"
) -> tuple:
    """Decide which subtitle language/source to fetch.

    Returns (lang_code, strategy_description) or (None, None) if nothing available.

    Priority:
    1. Manual subs in preferred language
    2. Auto-generated/auto-translated captions in preferred language
    3. Manual subs in original (first available) language
    4. Auto-generated captions in original language
    5. Any manual sub
    6. Any auto caption
    """

    # 1. Manual subs in preferred language
    if preferred_lang in manual_subs:
        return preferred_lang, "manual_preferred"

    # 2. Auto captions in preferred language (includes auto-translated)
    #    YouTube exposes auto-translated English under automatic_captions["en"]
    if preferred_lang in auto_captions:
        return preferred_lang, "auto_caption_preferred"

    # 3. Manual subs — try original language (first key)
    if manual_subs:
        first_manual_lang = next(iter(manual_subs))
        return first_manual_lang, f"manual_original({first_manual_lang})"

    # 4–6. Auto captions — try original language (first key that is not the preferred)
    if auto_captions:
        # Prefer the original language (usually the first or most prominent key)
        first_auto_lang = next(iter(auto_captions))
        return first_auto_lang, f"auto_caption_original({first_auto_lang})"

    return None, None


def _download_subtitle(video_url: str, lang: str, temp_dir: str) -> str:
    """Download a specific subtitle track and return its text content."""

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
            return "Subtitles not available for the specified language."

        requested_subs = info.get("requested_subtitles") or {}

        if lang in requested_subs:
            subtitle_info = requested_subs[lang]
            subtitle_file_path = subtitle_info.get("filepath")

            if subtitle_file_path and os.path.exists(subtitle_file_path):
                with open(subtitle_file_path, "r", encoding="utf-8") as f:
                    subtitle_content = f.read()
                logger.info(
                    f"Successfully extracted subtitles from {subtitle_file_path}"
                )
                return subtitle_content

            elif subtitle_info.get("data"):
                logger.info(
                    f"Extracted subtitles directly from data field for {video_url}"
                )
                return subtitle_info["data"]

        # If requested lang wasn't found, check all available requested subs
        for sub_lang, subtitle_info in requested_subs.items():
            subtitle_file_path = subtitle_info.get("filepath")
            if subtitle_file_path and os.path.exists(subtitle_file_path):
                with open(subtitle_file_path, "r", encoding="utf-8") as f:
                    subtitle_content = f.read()
                logger.info(
                    f"Extracted subtitles from fallback lang={sub_lang}: {subtitle_file_path}"
                )
                return subtitle_content
            elif subtitle_info.get("data"):
                return subtitle_info["data"]

    return "Subtitles not available for the specified language or download failed."


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
                {  # Force conversion to m4a/mp3 to ensure compatibility if needed, but m4a usually fine
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
        # Run on CPU with INT8 (standard for local inference without heavy GPU reqs)
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
