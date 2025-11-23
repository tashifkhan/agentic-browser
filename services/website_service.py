from core import get_logger
from prompts.website import get_answer, get_chain
from tools.website_context import markdown_fetcher

logger = get_logger(__name__)


class WebsiteService:
    def __init__(self):
        self.chain = get_chain()

    async def generate_answer(
        self,
        url: str,
        question: str,
        chat_history: list,
    ) -> str:
        try:
            logger.info(f"Processing website URL: {url}")
            logger.info(f"Question: {question}")

            markdown_page_info = markdown_fetcher(url)
            logger.debug(
                f"Markdown page info length: {len(markdown_page_info) if markdown_page_info else 0}"
            )
            logger.debug(f"Markdown page info: {markdown_page_info}")

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
                markdown_page_info,
                chat_history_str,
            )

            if isinstance(response, str):
                return response

            return response.content

        except Exception as e:
            logger.error(f"Error generating website answer: {e}")
            return "I apologize, but I encountered an error processing your question. Please try again."
