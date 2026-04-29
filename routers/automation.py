from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from core import get_logger
from models.requests.automation import AutomationStepRequest
from models.response.automation import AutomationStepResponse
from services.browser_automation_service import BrowserAutomationService

router = APIRouter()
logger = get_logger(__name__)


def get_service() -> BrowserAutomationService:
    return BrowserAutomationService()


@router.post("/step", response_model=AutomationStepResponse)
async def automation_step(
    request: AutomationStepRequest,
    service: BrowserAutomationService = Depends(get_service),
) -> AutomationStepResponse:
    if not request.goal.strip():
        raise HTTPException(status_code=400, detail="goal is required")
    try:
        return await service.plan_step(request)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Automation step failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
