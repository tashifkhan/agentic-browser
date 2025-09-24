import re


def clean_srt_text(raw: str) -> str:
    """Remove full timestamp lines and the literal backslash-n sequences."""
    full_ts_re = re.compile(
        r"^\d{2}:\d{2}:\d{2}\.\d{3}"
        r"\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}"  # the --> timestamp
        r".*?"
        r"(?:\\n){2}",  # literal "\\n\\n"
        re.MULTILINE | re.DOTALL,
    )

    # remove inline time-codes
    inline_ts_re = re.compile(r"<\d{2}:\d{2}:\d{2}\.\d{3}>")

    # remove align directives
    align_re = re.compile(r"align:start position:0%")

    # collapse literal backslash-n sequences into real newlines
    backslash_n_re = re.compile(r"\\n+")

    # apply passes
    text = full_ts_re.sub("", raw)
    text = inline_ts_re.sub("", text)
    text = align_re.sub("", text)
    text = backslash_n_re.sub("\n", text)

    return text.strip()
