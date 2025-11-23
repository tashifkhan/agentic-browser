from fastapi import APIRouter, HTTPException, Depends
from pydantic import HttpUrl
from core import get_logger
from models.requests.github import GitHubRequest
from models.response.gihub import GitHubResponse
from services.github_service import GitHubService

router = APIRouter()
logger = get_logger(__name__)


def get_github_service():
    return GitHubService()


@router.post("/", response_model=GitHubResponse)
async def github_crawler(
    request: GitHubRequest, service: GitHubService = Depends(get_github_service)
):
    try:
        question = request.question
        chat_history = request.chat_history

        if not question:
            raise HTTPException(
                status_code=400,
                detail="question is required",
            )

        url = request.url
        if not url:
            raise HTTPException(
                status_code=400,
                detail="url is required",
            )

        response = await service.generate_answer(
            url=HttpUrl(url),
            question=question,
            chat_history=chat_history,
        )

        return {"content": response}

    except Exception as e:
        logger.error(f"Error in GitHub crawler: {e}")
        raise HTTPException(status_code=500, detail=str(e))
