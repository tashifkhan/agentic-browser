import re

_TIMESTAMP_ARROW_RE = re.compile(
    r"\d{2}:\d{2}:\d{2}\.\d{3}" r"\s*-->\s*" r"\d{2}:\d{2}:\d{2}\.\d{3}"
)

_CUE_RE = re.compile(r"<\d{2}:\d{2}:\d{2}\.\d{3}>")


def clean_timestamps_and_dedupe(text: str) -> str:
    """
    1) Remove all 'hh:mm:ss.mmm --> hh:mm:ss.mmm'
    2) Remove inline <hh:mm:ss.mmm> cues
    3) Split/strip/dedupe lines
    """
    # strip out the timestamp-arrows
    no_arrows = _TIMESTAMP_ARROW_RE.sub("", text)

    # strip any leftover <…> cues
    no_cues = _CUE_RE.sub("", no_arrows)

    seen = set()
    out_lines = []
    for raw_line in no_cues.splitlines():
        line = raw_line.strip()
        if not line or line in seen:
            continue
        seen.add(line)
        out_lines.append(line)

    return "\n".join(out_lines)
