from __future__ import annotations

from fastapi import APIRouter, HTTPException, Depends

from core import get_logger
from models.requests.crawller import CrawlerRequest
from models.response.crawller import CrawllerResponse
from services.react_agent_service import ReactAgentService

router = APIRouter()
logger = get_logger(__name__)


def get_react_agent_service():
    return ReactAgentService()


@router.post("/", response_model=CrawllerResponse)
async def agent_bhai(
    request: CrawlerRequest,
    service: ReactAgentService = Depends(get_react_agent_service),
) -> CrawllerResponse:
    try:
        question = request.question
        chat_history = request.chat_history or []

        if not question:
            raise HTTPException(status_code=400, detail="question is required")

        answer = await service.generate_answer(
            question,
            chat_history,
            google_access_token=request.google_access_token,
            pyjiit_login_response=request.pyjiit_login_response,
        )
        return CrawllerResponse(answer=answer)

    except HTTPException:
        raise

    except Exception as exc:  # pragma: no cover - defensive logging
        # Service already logs exception, but we catch here to ensure HTTP 500
        # Wait, service returns error string on exception, but here we want to catch if service raises or if something else fails
        # The service catches exceptions and returns a string.
        # But if we want to bubble up HTTP exceptions we should be careful.
        # In the original code, `generate_answer` caught exceptions and returned a string.
        # But `agent_bhai` also had a try/except block.
        # If `generate_answer` returns a string (even error message), `agent_bhai` returns 200 OK with that string.
        # So we should be fine.
        logger.error("Error processing agent request: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error \n{str(exc)}",
        )
