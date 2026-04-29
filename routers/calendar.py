from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core import get_logger
from services.calendar_service import CalendarService
from services.oauth_credentials_service import NeedsReauth, get_oauth_credentials_service

router = APIRouter()
logger = get_logger(__name__)


class EventsRequest(BaseModel):
    max_results: Optional[int] = 10


class CreateEventRequest(BaseModel):
    summary: str
    start_time: str
    end_time: str
    description: str = "Created via API"


def get_calendar_service():
    return CalendarService()


async def _token() -> str:
    creds = get_oauth_credentials_service()
    try:
        return await creds.get_access_token("calendar")
    except NeedsReauth as e:
        raise HTTPException(
            status_code=401,
            detail={"code": "needs_reauth", "provider": "google", "reason": e.reason},
        )


def _is_isoformat(s: str) -> bool:
    try:
        datetime.fromisoformat(s)
        return True
    except Exception:
        return False


@router.post("/events", response_model=dict)
async def list_events(
    request: EventsRequest, service: CalendarService = Depends(get_calendar_service)
):
    try:
        token = await _token()
        max_results = request.max_results if request.max_results and request.max_results > 0 else 10
        items = service.list_events(token, max_results=max_results)
        return {"events": items}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/create", response_model=dict)
async def create_event(
    request: CreateEventRequest,
    service: CalendarService = Depends(get_calendar_service),
):
    try:
        if not request.summary or not request.start_time or not request.end_time:
            raise HTTPException(
                status_code=400,
                detail="summary, start_time and end_time are required",
            )
        if not _is_isoformat(request.start_time) or not _is_isoformat(request.end_time):
            raise HTTPException(
                status_code=400,
                detail="start_time and end_time must be valid ISO 8601 strings",
            )

        token = await _token()
        ev = service.create_event(
            token,
            request.summary,
            request.start_time,
            request.end_time,
            description=request.description,
        )
        return {"result": "created", "event": ev}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
