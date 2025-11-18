from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from core import get_logger
from tools.calendar.get_calender_events import get_calendar_events
from tools.calendar.create_calender_events import create_calendar_event

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
    description: Optional[str] = "Created via API"


@router.post("/events", response_model=dict)
async def list_events(request: EventsRequest):
    try:
        if not request.access_token:
            raise HTTPException(status_code=400, detail="access_token is required")

        items = get_calendar_events(
            request.access_token, max_results=request.max_results
        )
        return {"events": items}

    except HTTPException:
        raise

    except Exception as e:
        logger.exception("Error fetching calendar events: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/create", response_model=dict)
async def create_event(request: CreateEventRequest):
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

        ev = create_calendar_event(
            request.access_token,
            request.summary,
            request.start_time,
            request.end_time,
            description=request.description,
        )
        return {"result": "created", "event": ev}

    except HTTPException:
        raise

    except Exception as e:
        logger.exception("Error creating calendar event: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
