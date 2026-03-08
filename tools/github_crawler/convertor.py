try:
    from gitingest import ingest_async

    HAS_INGEST_ASYNC = True
except ImportError:
    from gitingest import ingest

    HAS_INGEST_ASYNC = False
from pydantic import HttpUrl, BaseModel
from urllib.parse import urlparse
import asyncio
import re

# Maximum characters of file content to keep (~800K chars ≈ ~200K tokens).
# Keeps tree + summary intact (they're small) and truncates only the file content.
MAX_CONTENT_CHARS = 1_000_000

# GitHub path segments that are NOT part of a clonable repo path.
# When present, the URL is stripped back to just owner/repo.
_NON_REPO_SEGMENTS = {
    "commits", "commit", "issues", "pulls", "pull",
    "actions", "projects", "wiki", "settings", "releases",
    "tags", "branches", "compare", "network", "graphs",
    "security", "pulse", "community", "discussions",
    "tree", "blob", "raw", "blame", "edit",
}


class InjestedContent(BaseModel):
    tree: str
    summary: str
    content: str


def _normalize_github_url(url: str) -> str:
    """
    Normalise a GitHub URL to its base repository form.

    Examples:
        https://github.com/owner/repo/commits/main  →  https://github.com/owner/repo
        https://github.com/owner/repo/tree/main/src  →  https://github.com/owner/repo
        https://github.com/owner/repo                →  https://github.com/owner/repo  (unchanged)
    """
    parsed = urlparse(url)
    # Only normalise github.com URLs
    if "github.com" not in (parsed.hostname or ""):
        return url

    parts = [p for p in parsed.path.strip("/").split("/") if p]

    if len(parts) < 2:
        # Not even owner/repo present — return as-is and let gitingest error naturally
        return url

    # Check if the third segment (index 2) is a known non-repo page
    if len(parts) > 2 and parts[2].lower() in _NON_REPO_SEGMENTS:
        parts = parts[:2]  # keep only owner/repo

    return f"{parsed.scheme}://{parsed.hostname}/{'/'.join(parts)}"


async def convert_github_repo_to_markdown(repo_link: HttpUrl) -> InjestedContent:
    """
    Convert a GitHub repository to a markdown file.
    Normalises the URL and truncates content to stay within LLM token limits.
    """
    clean_url = _normalize_github_url(str(repo_link))

    if HAS_INGEST_ASYNC:
        summary, tree, content = await ingest_async(clean_url)
    else:
        # fallback for sync ingest (not recommended for async frameworks)
        summary, tree, content = ingest(clean_url)

    # Truncate file content if it's too large for the LLM context window
    if len(content) > MAX_CONTENT_CHARS:
        content = (
            content[:MAX_CONTENT_CHARS]
            + "\n\n... [Content truncated — repository too large to display in full] ..."
        )

    return InjestedContent(
        tree=tree,
        summary=summary,
        content=content,
    )


if __name__ == "__main__":

    repo_link = HttpUrl("https://github.com/tashifkhan/Findex")
    result = asyncio.run(convert_github_repo_to_markdown(repo_link))
    print(
        result.tree,
        result.summary,
        result.content,
        sep="\n\n---\n\n",
    )
