from core import get_logger
from prompts.youtube import youtube_chain

logger = get_logger(__name__)


class YouTubeService:
    async def generate_answer(
        self,
        url: str,
        question: str,
        chat_history: str = "",
    ) -> str:
        """Generate answer using video information and YouTube chat prompt"""
        try:
            logger.info(f"Generating answer for question: {question} with URL: {url}")
            response = youtube_chain.invoke(
                {
                    "url": url,
                    "question": question,
                    "chat_history": chat_history,
                }
            )

            logger.debug(f"Response from YouTube chain: {response}")

            if isinstance(response, str):
                return response

            return response.content

        except Exception as e:
            logger.error(f"Error generating answer with LLM: {e}")
            return f"I apologize, but I encountered an error processing your question about the video. Please try again."
