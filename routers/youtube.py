from fastapi import APIRouter, HTTPException
from core import get_logger
from models import YTVideoInfo
from prompts.youtube import youtube_chain
from models.requests.ask import AskRequest
from tools.youtube_utils import extract_video_id, get_video_info

router = APIRouter()
logger = get_logger(__name__)


async def generate_answer(
    url: str,
    question: str,
    chat_history: str = "",
) -> str:
    """Generate answer using video information and YouTube chat prompt"""
    try:
        print(f"Generating answer for question: {question} with URL: {url}")
        response = youtube_chain.invoke(
            {
                "url": url,
                "question": question,
                "chat_history": chat_history,
            }
        )

        print(f"Response from YouTube chain: {response}")

        if isinstance(response, str):
            return response

        return response.content

    except Exception as e:
        logger.error(f"Error generating answer with LLM: {e}")
        return f"I apologize, but I encountered an error processing your question about the video. Please try again."


# route
@router.post("/", response_model=dict)
async def ask(request: AskRequest):
    try:
        url = request.url
        question = request.question
        chat_history_list = request.chat_history or []

        chat_history_str = ""
        if chat_history_list:
            for entry in chat_history_list:
                if isinstance(entry, dict):
                    role = entry.get("role", "")
                    content = entry.get("content", "")
                    chat_history_str += f"{role}: {content}\n"
                else:
                    chat_history_str += f"{entry}\n"

        if not url or not question:
            raise HTTPException(
                status_code=400,
                detail="url and question are required",
            )

        logger.info(f"Processing question: '{question}' for URL: {url}")

        # video_id = extract_video_id(url)
        # if not video_id:
        #     raise HTTPException(status_code=400, detail="Invalid YouTube URL")

        # # info using yt-dlp
        # video_info_obj = get_video_info(url)
        # if not video_info_obj:
        #     raise HTTPException(
        #         status_code=500,
        #         detail="Could not fetch video information",
        #     )

        # answer
        answer = await generate_answer(url, question, chat_history_str)
        logger.debug(f"Generated answer: {answer}")

        return {
            "answer": answer,
        }

    except HTTPException:
        raise

    except Exception as e:
        logger.error(f"Error processing request: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error \n{str(e)}",
        )
