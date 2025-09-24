"""
initalization file for the youtube_agent.transcript_generator module.
"""

from .clean import clean_transcript
from .duplicate import remove_sentence_repeats
from .srt import clean_srt_text
from .timestamp import clean_timestamps_and_dedupe


def processed_transcript(text: str) -> str:
    """Process the transcript text by cleaning it up."""
    cleaned_text = remove_sentence_repeats(
        clean_timestamps_and_dedupe(clean_srt_text(clean_transcript(text)))
    )
    return cleaned_text


__all__ = [
    "processed_transcript",
]
