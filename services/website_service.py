from core import get_logger
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
