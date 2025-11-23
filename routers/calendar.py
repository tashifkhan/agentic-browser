from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from core import get_logger
from services.calendar_service import CalendarService

router = APIRouter()
logger = get_logger(__name__)


class TokenRequest(BaseModel):
    access_token: str


class EventsRequest(TokenRequest):
    max_results: Optional[int] = 10


class CreateEventRequest(TokenRequest):
    summary: str
    start_time: str
    end_time: str
    description: str = "Created via API"


def get_calendar_service():
    return CalendarService()


@router.post("/events", response_model=dict)
async def list_events(
    request: EventsRequest, service: CalendarService = Depends(get_calendar_service)
):
    try:
        if not request.access_token:
            raise HTTPException(status_code=400, detail="access_token is required")

        if not request.max_results or request.max_results <= 0:
            request.max_results = 10

        items = service.list_events(
            request.access_token, max_results=request.max_results
        )
        return {"events": items}

    except HTTPException:
        raise

    except Exception as e:
        # Service already logs exception, but we catch here to ensure HTTP 500
        raise HTTPException(
            status_code=500,
            detail=str(e),
        )


def _is_isoformat(s: str) -> bool:
    try:
        # datetime.fromisoformat accepts most valid ISO 8601 variants
        datetime.fromisoformat(s)
        return True

    except Exception:
        return False


@router.post("/create", response_model=dict)
async def create_event(
    request: CreateEventRequest,
    service: CalendarService = Depends(get_calendar_service),
):
    try:
        if (
            not request.access_token
            or not request.summary
            or not request.start_time
            or not request.end_time
        ):
            raise HTTPException(
                status_code=400,
                detail="access_token, summary, start_time and end_time are required",
            )

        # Ensure start_time and end_time are ISO 8601 strings only
        if not _is_isoformat(request.start_time) or not _is_isoformat(request.end_time):
            raise HTTPException(
                status_code=400,
                detail="start_time and end_time must be valid ISO 8601 strings",
            )

        ev = service.create_event(
            request.access_token,
            request.summary,
            request.start_time,
            request.end_time,
            description=request.description,
        )
        return {
            "result": "created",
            "event": ev,
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e),
        )
