from pydantic import HttpUrl

from core import get_logger
from prompts.github import get_chain
from tools.github_crawler import convert_github_repo_to_markdown

logger = get_logger(__name__)


class GitHubService:
    async def generate_answer(
        self,
        url: HttpUrl,
        question: str,
        chat_history: list[dict] = [],
    ) -> str:
        """Generate answer using GitHub repository information and prompt"""
        # --- Step 1: Ingest the repository ---
        try:
            content_obj = await convert_github_repo_to_markdown(url)
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Error ingesting GitHub repo ({url}): {error_msg}")

            if "PathKind" in error_msg:
                return (
                    "The provided URL doesn't point to a valid GitHub repository root. "
                    "Please navigate to the main repository page (e.g. `github.com/owner/repo`) and try again."
                )
            if "clone" in error_msg.lower() or "404" in error_msg:
                return (
                    "Could not access the GitHub repository. "
                    "Make sure the URL is correct and the repository is public."
                )
            return f"Failed to fetch the GitHub repository: {error_msg}"

        # --- Step 2: Generate answer with LLM ---
        try:
            chain = get_chain()
            response = chain.invoke(
                {
                    "summary": content_obj.summary,
                    "tree": content_obj.tree,
                    "text": content_obj.content,
                    "question": question,
                    "chat_history": chat_history if chat_history else "",
                }
            )

            if isinstance(response, str):
                return response

            return response.content

        except Exception as e:
            error_msg = str(e)
            logger.error(f"Error generating answer with LLM: {error_msg}")

            if "token" in error_msg.lower() and ("exceed" in error_msg.lower() or "limit" in error_msg.lower()):
                return (
                    "This repository is very large and exceeds the model's context window even after truncation. "
                    "Try asking about a specific file or directory instead."
                )
            return f"An error occurred while generating the answer: {error_msg}"
