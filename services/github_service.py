from pydantic import HttpUrl

from core import get_logger
from tools.github_crawler.repo_agent import run_github_repo_agent

logger = get_logger(__name__)


class GitHubService:
    async def generate_answer(
        self,
        url: HttpUrl,
        question: str,
        chat_history: list[dict] = [],
        attached_file_path: str | None = None,
    ) -> str:
        """Clone the repository and let the repo agent answer, with any attached
        file in its first message (whichever model is picked)."""
        try:
            return await run_github_repo_agent(
                url=str(url),
                question=question,
                chat_history=chat_history if chat_history else None,
                attachment_path=attached_file_path,
            )
        except Exception as e:
            logger.error("GitHub agent error for %s: %s", url, e)
            return f"An error occurred while analysing the repository: {e}"
