from pydantic import HttpUrl

from core import get_logger
from core.llm import _model
from prompts.github import get_chain
from tools.github_crawler import convert_github_repo_to_markdown

logger = get_logger(__name__)


class GitHubService:
    async def generate_answer(
        self,
        url: HttpUrl,
        question: str,
        chat_history: list[dict] = [],
        attached_file_path: str | None = None,
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

        if attached_file_path:
            logger.info("Attached file found: %s. Using google-genai SDK directly.", attached_file_path)
            try:
                from google import genai
                import os
                
                api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
                client = genai.Client(api_key=api_key)
                uploaded_file = client.files.upload(file=attached_file_path)
                
                contents = [uploaded_file]
                
                if content_obj:
                    # keep it concise if there is a lot of text, although 2.5-pro has 2M tokens
                    contents.append(f"GitHub Repo Summary:\n{content_obj.summary}")
                    contents.append(f"Repository Tree:\n{content_obj.tree}")
                    # truncate text to avoid payload limits if too big, though Gemini pro handles up to 2M limits
                    text_context = content_obj.content[:500000] if len(content_obj.content) > 500000 else content_obj.content
                    contents.append(f"Repository Content:\n{text_context}")
                
                if chat_history:
                    chat_history_str = ""
                    for entry in chat_history:
                        if isinstance(entry, dict):
                            role = entry.get("role", "")
                            content = entry.get("content", "")
                            chat_history_str += f"{role}: {content}\n"
                        else:
                            chat_history_str += f"{entry}\n"
                    contents.append(f"Chat History:\n{chat_history_str}")
                    
                contents.append(question)
                
                response = client.models.generate_content(
                    model=_model.model_name,
                    contents=contents
                )
                return response.text
            except Exception as e:
                logger.error("Failed to process attached file with google-genai: %s", e)
                return f"I couldn't process the attached file due to an error: {str(e)}"
                
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
