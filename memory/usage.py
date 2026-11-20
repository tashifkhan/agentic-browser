"""Decide which injected memories an answer actually used.

This feeds MemoryService.mark_retrieval_used, the signal promotion and decay
depend on. Neither app ever reported usage, so retrieval_hit_count stayed at 0,
nothing was promoted, and long-term facts were demoted after 30 idle days.

The check is lexical and costs no LLM call. A memory counts as used when at
least half of its distinctive words (and at least two of them) appear in the
answer. For example, "User's sister Maya has a birthday on March 3" counts as
used by "Happy birthday, Maya! ... March 3".

Procedural memories ("keep answers short") rarely share words with the answer
they shape, so they mostly don't register. They are permanent and don't decay,
so missing them costs nothing.
"""
from __future__ import annotations

import re

_STOP = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "to", "of", "in", "on",
    "at", "for", "and", "or", "with", "user", "user's", "users", "their", "they", "them",
    "has", "have", "had", "that", "this", "as", "by", "it", "its", "from", "who", "which",
    "prefers", "likes", "wants", "named", "called", "also", "very", "currently",
}
_WORD = re.compile(r"[a-z0-9][a-z0-9'+-]*")


def _words(text: str) -> set[str]:
    return {w.strip("'") for w in _WORD.findall(text.lower()) if w not in _STOP and len(w) > 2}


def claims_used_in_answer(answer: str, claims: list[dict[str, str]],
                          min_overlap: float = 0.5) -> list[str]:
    answer_words = _words(answer)
    if not answer_words:
        return []
    used: list[str] = []
    for claim in claims:
        text = claim.get("text", "")
        words = _words(text)
        hit = len(words & answer_words)
        if len(words) >= 2 and hit >= 2 and hit / len(words) >= min_overlap:
            used.append(claim["id"])
            continue
        # A short answer can use a memory through one distinctive name
        # ("Tumbleglass") or its initials ("QLM" for Quenwick Lantern Museum).
        names = _names(text)
        if any(n.lower() in answer_words for n in names if len(n) > 3):
            used.append(claim["id"])
            continue
        acronym = "".join(n[0] for n in names)
        if len(acronym) >= 3 and re.search(rf"\b{acronym}\b", answer):
            used.append(claim["id"])
    return used


def _names(text: str) -> list[str]:
    """Capitalised words that aren't sentence-initial and aren't the user's handle."""
    tokens = re.findall(r"[A-Za-z][A-Za-z'-]*", text)
    return [t for i, t in enumerate(tokens) if i > 0 and t[0].isupper() and t not in {"User", "User's", "I"}]
