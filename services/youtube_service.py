from core import get_logger
from core.llm import _model
from prompts.youtube import youtube_chain

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
                logger.info("Attached file found: %s. Using google-genai SDK directly.", attached_file_path)
                try:
                    from google import genai
                    import os
                    from tools.youtube_transcript import get_transcript_text
                    
                    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
                    client = genai.Client(api_key=api_key)
                    uploaded_file = client.files.upload(file=attached_file_path)
                    
                    contents = [uploaded_file]
                    
                    transcript = ""
                    try:
                        transcript = get_transcript_text(url)
                    except Exception as yt_err:
                        logger.warning("Could not fetch YouTube transcript: %s", yt_err)
                        
                    if transcript:
                        contents.append(f"YouTube Video Transcript:\n\n{transcript}")
                    if chat_history:
                        contents.append(f"Chat History:\n{chat_history}")
                    contents.append(question)
                    
                    response = client.models.generate_content(
                        model=_model.model_name,
                        contents=contents
                    )
                    return response.text
                except Exception as e:
                    logger.error("Failed to process attached file with google-genai: %s", e)
                    return f"I couldn't process the attached file due to an error: {str(e)}"
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
            return "I apologize, but I encountered an error processing your question about the video. Please try again."
