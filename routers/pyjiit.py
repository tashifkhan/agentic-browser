from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from core import get_logger
from services.pyjiit_service import PyjiitService

router = APIRouter()
logger = get_logger(__name__)


class BasicAuthRequest(BaseModel):
    username: str
    password: str


class SemesterReq(BasicAuthRequest):
    registration_id: str
    registration_code: str


class AttendanceReq(BaseModel):
    """Request model for attendance lookup.

    Provide `session_payload` which is the object returned by `/login`
    (or the raw response dict inside it). Optionally provide
    `registration_code` (e.g., "2025ODDSEM"). If omitted, latest
    semester from attendance meta will be used.
    """

    session_payload: Dict[str, Any]
    registration_code: Optional[str] = None


def get_pyjiit_service():
    return PyjiitService()


@router.post("/login", response_model=dict)
async def login(
    req: BasicAuthRequest, service: PyjiitService = Depends(get_pyjiit_service)
):
    try:
        return service.login(req.username, req.password)

    except Exception as e:
        # Service already logs exception
        raise HTTPException(
            status_code=400,
            detail=str(e),
        )


@router.post("/semesters", response_model=List[Dict[str, Any]])
async def get_semesters(
    session_payload: Dict[str, Any],
    service: PyjiitService = Depends(get_pyjiit_service),
):
    """Initialize a Webportal session from the provided login response

    Accepts the full login response (the dict returned by the `/login` route)
    or the raw response dict the `WebportalSession` expects. Returns a list
    of semesters as dicts with `registration_id` and `registration_code`.
    """
    try:
        return service.get_semesters(session_payload)

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e),
        )


@router.post("/attendence", response_model=List[Dict[str, Any]])
async def attendence(
    session_payload: Dict[str, Any],
    registration_code: Optional[str] = None,
    service: PyjiitService = Depends(get_pyjiit_service),
):
    """Return attendance for the requested semester.

    Endpoint name intentionally matches the user's spelling `/attendence`.
    """
    try:
        return service.get_attendance(session_payload, registration_code)

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e),
        )
