from core import get_logger
from prompts.youtube import get_chain

logger = get_logger(__name__)


class YouTubeService:
    async def generate_answer(
        self,
        url: str,
        question: str,
        chat_history: str = "",
        attached_file_path: str | None = None,
    ) -> str:
        """Generate answer using video information and YouTube chat prompt"""
        try:
            logger.info(f"Generating answer for question: {question} with URL: {url}")
            
            if attached_file_path:
                # Same prompt as without a file, plus the file as a message
                # part, on whichever model is picked.
                import asyncio

                from prompts.youtube import get_context, prompt
                from services.attachments import answer_with_attachment

                transcript = await asyncio.to_thread(get_context, {"url": url})
                rendered = prompt.format(context=transcript, question=question, chat_history=chat_history)
                return await answer_with_attachment(rendered, attached_file_path)

            # Built per request so the model picker applies (the module-level
            # chain kept the model from import time), and awaited so the
            # server isn't blocked while the model answers.
            response = await get_chain().ainvoke(
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
            return "I apologize, but I encountered an error processing your question about the video. Please try again."
