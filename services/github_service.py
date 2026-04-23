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
        """Clone the repository and use a ReAct agent to answer the question."""
        if attached_file_path:
            logger.info("Attached file found: %s. Using google-genai SDK directly.", attached_file_path)
            try:
                from google import genai
                from core.llm import _model
                import os

                api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
                client = genai.Client(api_key=api_key)
                uploaded_file = client.files.upload(file=attached_file_path)

                contents = [uploaded_file]
                if chat_history:
                    history_str = "\n".join(
                        f"{e.get('role', '')}: {e.get('content', '')}"
                        for e in chat_history
                        if isinstance(e, dict)
                    )
                    contents.append(f"Chat History:\n{history_str}")
                contents.append(question)

                response = client.models.generate_content(
                    model=_model.model_name,
                    contents=contents,
                )
                return response.text
            except Exception as e:
                logger.error("Failed to process attached file with google-genai: %s", e)
                return f"I couldn't process the attached file due to an error: {str(e)}"

        try:
            return await run_github_repo_agent(
                url=str(url),
                question=question,
                chat_history=chat_history if chat_history else None,
            )
        except Exception as e:
            logger.error("GitHub agent error for %s: %s", url, e)
            return f"An error occurred while analysing the repository: {e}"
