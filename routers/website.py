from fastapi import APIRouter, HTTPException, Depends
from core import get_logger
from models.requests import WebsiteRequest
from services.website_service import WebsiteService

router = APIRouter()
logger = get_logger(__name__)


def get_website_service():
    return WebsiteService()


@router.post("/", response_model=dict)
async def website(
    request: WebsiteRequest, service: WebsiteService = Depends(get_website_service)
):
    try:
        url = request.url
        question = request.question
        chat_history = request.chat_history or []

        if not url or not question:
            raise HTTPException(
                status_code=400,
                detail="url and question are required",
            )

        answer = await service.generate_answer(url, question, chat_history)
        return {
            "answer": answer,
        }

    except HTTPException:
        raise

    except Exception as e:
        logger.error(f"Error processing website request: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error \n{str(e)}",
        )
