from fastapi import APIRouter, HTTPException, Depends
from core import get_logger
from models.requests.ask import AskRequest
from services.youtube_service import YouTubeService

router = APIRouter()
logger = get_logger(__name__)


def get_youtube_service():
    return YouTubeService()


# route
@router.post("/", response_model=dict)
async def ask(
    request: AskRequest, service: YouTubeService = Depends(get_youtube_service)
):
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

        # answer
        answer = await service.generate_answer(url, question, chat_history_str)
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
