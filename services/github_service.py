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
        try:
            content_obj = await convert_github_repo_to_markdown(url)

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
            logger.error(f"Error generating answer with LLM: {e}")
            return "I apologize, but I encountered an error processing your question about the GitHub repository. Please try again."
