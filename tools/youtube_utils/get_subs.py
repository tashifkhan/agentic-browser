import os
import yt_dlp
from core import get_logger

logger = get_logger(__name__)


def get_subtitle_content(video_url: str, lang: str = "en") -> str:
    """Downloads and extracts subtitle content for a given video URL and language."""
    temp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "temp_subs")
    os.makedirs(temp_dir, exist_ok=True)

    try:
        ydl_opts = {
            "writesubtitles": True,
            "writeautomaticsub": True,
            "subtitleslangs": [lang],
            "subtitlesformat": "vtt/srt/best",
            "skip_download": True,  # Skip downloading the video itself
            "outtmpl": os.path.join(
                temp_dir, "%(id)s.%(ext)s"
            ),  # Save subtitle in temp_dir
            "quiet": True,
            "no_warnings": True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            logger.info(
                f"Attempting to download subtitles for {video_url} in lang {lang}"
            )
            info = ydl.extract_info(
                video_url, download=True
            )  # download=True for subtitles

            if not info:
                logger.error(f"Could not extract video info for {video_url}")
                return "Subtitles not available for the specified language."

            requested_subs = info.get("requested_subtitles")

            if requested_subs and lang in requested_subs:
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

                else:
                    logger.warning(
                        f"Subtitle file path not found or file does not exist for lang '{lang}' at '{video_url}'. Path: {subtitle_file_path}"
                    )
                    return (
                        "Subtitles were requested but could not be retrieved from file."
                    )

            else:
                logger.info(
                    f"No subtitles found for language '{lang}'. Attempting fallback transcription..."
                )
                return download_audio_and_transcribe(video_url)

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
