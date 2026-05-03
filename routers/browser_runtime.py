from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from core import get_logger
from models.requests.browser_runtime import (
    BrowserRuntimeStartRequest,
    BrowserRuntimeStepRequest,
)
from models.response.browser_runtime import BrowserRuntimeStepResponse
from services.browser_runtime_service import BrowserRuntimeService

router = APIRouter()
logger = get_logger(__name__)


def get_service() -> BrowserRuntimeService:
    return BrowserRuntimeService()


@router.post("/start", response_model=BrowserRuntimeStepResponse)
async def start_browser_runtime(
    request: BrowserRuntimeStartRequest,
    service: BrowserRuntimeService = Depends(get_service),
) -> BrowserRuntimeStepResponse:
    if not request.goal.strip():
        raise HTTPException(status_code=400, detail="goal is required")
    try:
        return await service.start_session(request)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Browser runtime start failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/step", response_model=BrowserRuntimeStepResponse)
async def continue_browser_runtime(
    request: BrowserRuntimeStepRequest,
    service: BrowserRuntimeService = Depends(get_service),
) -> BrowserRuntimeStepResponse:
    try:
        return await service.continue_session(request)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Browser runtime step failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
