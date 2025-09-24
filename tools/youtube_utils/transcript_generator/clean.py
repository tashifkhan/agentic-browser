import re

_TIMESTAMP_LINE_PATTERN = re.compile(
    r"^(?:\d{2}:)?\d{2}:\d{2}[.,]\d{3} --> (?:\d{2}:)?\d{2}:\d{2}[.,]\d{3}.*$"
)

_VTT_HEADER_OR_METADATA_PATTERN = re.compile(
    r"^(WEBVTT|Kind:|Language:).*$|^(NOTE|STYLE|REGION\s*$|\s*::cue).*$", re.IGNORECASE
)

_INLINE_TIMESTAMP_PATTERN = re.compile(
    r"<\d{2}:\d{2}:\d{2}[.,]\d{3}>",
)

_CUE_TAG_PATTERN = re.compile(
    r"</?c.*?>",
)

_SPEAKER_TAG_PATTERN = re.compile(r"<v\s+[^>]+>.*?</v>")


def clean_transcript(text: str) -> str:
    """Remove SRT/VTT timestamps and cue tags, dedupe, and merge into paragraphs."""
    lines = text.splitlines()
    paragraphs = []
    current_para = []
    prev_line = None

    for line in lines:
        # skip full timestamp lines and VTT headers/metadata
        if _TIMESTAMP_LINE_PATTERN.match(line) or _VTT_HEADER_OR_METADATA_PATTERN.match(
            line
        ):
            continue

        # remove speaker tags like <v Speaker Name>
        line = _SPEAKER_TAG_PATTERN.sub("", line)

        # strip inline timestamps and cue tags
        line = _INLINE_TIMESTAMP_PATTERN.sub("", line)
        line = _CUE_TAG_PATTERN.sub("", line)
        line = line.strip()  # General strip

        # remove common VTT artifacts like "align:start position:0%" if they are the only content
        if re.fullmatch(r"align:[a-zA-Z]+(?:\s+position:[\d%]+)?", line):
            continue

        # paragraph break
        if not line:
            if current_para:
                paragraphs.append(" ".join(current_para))
                current_para = []
            continue

        # skip duplicates
        if line == prev_line:
            continue

        current_para.append(line)
        prev_line = line

    if current_para:
        paragraphs.append(" ".join(current_para))

    # join paragraphs with a blank line
    return "\n\n".join(paragraphs).strip()
