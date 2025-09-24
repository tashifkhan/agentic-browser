try:
    from gitingest import ingest_async
    HAS_INGEST_ASYNC = True
except ImportError:
    from gitingest import ingest
    HAS_INGEST_ASYNC = False
from pydantic import HttpUrl, BaseModel
import asyncio


class InjestedContent(BaseModel):
    tree: str
    summary: str
    content: str


async def convert_github_repo_to_markdown(repo_link: HttpUrl) -> InjestedContent:
    """
    Convert a GitHub repository to a markdown file.
    """
    if HAS_INGEST_ASYNC:
        summary, tree, content = await ingest_async(str(repo_link))
    else:
        # fallback for sync ingest (not recommended for async frameworks)
        summary, tree, content = ingest(str(repo_link))

    return InjestedContent(
        tree=tree,
        summary=summary,
        content=content,
    )


if __name__ == "__main__":
    from pathlib import Path

    repo_link = HttpUrl("https://github.com/tashifkhan/Findex")
    # For testing, run the async function in the main block
    result = asyncio.run(convert_github_repo_to_markdown(repo_link))
    print(
        result.tree,
        result.summary,
        result.content,
        sep="\n\n---\n\n",
    )
