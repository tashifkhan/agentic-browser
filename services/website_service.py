from core import get_logger
from core.llm import _model
from prompts.website import get_answer, get_chain
from tools.website_context import markdown_fetcher, html_md_convertor

logger = get_logger(__name__)


class WebsiteService:
    def __init__(self):
        self.chain = get_chain()

    async def generate_answer(
        self,
        url: str,
        question: str,
        chat_history: list,
        client_html: str | None = None,
        attached_file_path: str | None = None,
    ) -> str:
        try:
            logger.info(f"Processing website URL: {url}")
            logger.info(f"Question: {question}")

            # Server-side fetch via Jina AI
            server_markdown = markdown_fetcher(url)
            logger.debug(
                f"Server markdown length: {len(server_markdown) if server_markdown else 0}"
            )

            # Client-side HTML → Markdown conversion
            client_markdown = ""
            if client_html:
                logger.info(
                    f"Received client HTML ({len(client_html)} chars), converting to markdown"
                )
                client_markdown = html_md_convertor(client_html)
                logger.debug(
                    f"Client markdown length: {len(client_markdown) if client_markdown else 0}"
                )

            chat_history_str = ""
            if chat_history:
                for entry in chat_history:
                    if isinstance(entry, dict):
                        role = entry.get("role", "")
                        content = entry.get("content", "")
                        chat_history_str += f"{role}: {content}\n"
                    else:
                        chat_history_str += f"{entry}\n"
            
            if attached_file_path:
                logger.info("Attached file found: %s. Using google-genai SDK directly.", attached_file_path)
                try:
                    from google import genai
                    import os
                    
                    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
                    client = genai.Client(api_key=api_key)
                    uploaded_file = client.files.upload(file=attached_file_path)
                    
                    contents = [uploaded_file]
                    if server_markdown:
                        contents.append(f"Content from URL ({url}):\n\n{server_markdown}")
                    if client_markdown:
                        contents.append(f"Client-side HTML content:\n\n{client_markdown}")
                    if chat_history_str:
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

            response = get_answer(
                self.chain,
                question,
                server_markdown,
                chat_history_str,
                client_markdown=client_markdown,
            )

            if isinstance(response, str):
                return response

            return response.content

        except Exception as e:
            logger.error(f"Error generating website answer: {e}")
            return "I apologize, but I encountered an error processing your question. Please try again."
