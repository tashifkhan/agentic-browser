from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from core import get_logger
from tools.pyjiit.wrapper import Webportal, WebportalSession
from tools.pyjiit.tokens import Captcha as CaptchaClass
from tools.pyjiit.attendance import Semester as SemesterClass
from tools.pyjiit.exam import ExamEvent as ExamEventClass
from tools.pyjiit.default import CAPTCHA as DEFAULT_CAPTCHA

router = APIRouter()
logger = get_logger(__name__)


class LoginRequest(BaseModel):
    username: str
    password: str


class BasicAuthRequest(BaseModel):
    username: str
    password: str


class SemesterReq(BasicAuthRequest):
    registration_id: str
    registration_code: str


class ExamEventReq(BasicAuthRequest):
    registration_id: str
    exam_event_id: str


@router.post("/login", response_model=dict)
async def login(req: LoginRequest):
    try:
        wp = Webportal()
        session = wp.student_login(req.username, req.password, DEFAULT_CAPTCHA)
        # return a Python dict so FastAPI can validate/serialize it
        return session.model_dump()

    except Exception as e:
        logger.exception("Login error: %s", e)
        raise HTTPException(
            status_code=400,
            detail=str(e),
        )


@router.post("/semesters", response_model=List[Dict[str, Any]])
async def get_semesters(session_payload: Dict[str, Any]):
    """Initialize a Webportal session from the provided login response

    Accepts the full login response (the dict returned by the `/login` route)
    or the raw response dict the `WebportalSession` expects. Returns a list
    of semesters as dicts with `registration_id` and `registration_code`.
    """
    try:

        payload = session_payload

        if isinstance(payload, dict) and "raw_response" in payload:
            payload = payload["raw_response"]

        session = WebportalSession(payload)
        wp = Webportal(session=session)

        semesters = wp.get_registered_semesters()

        return [
            {
                "registration_id": s.registration_id,
                "registration_code": s.registration_code,
            }
            for s in semesters
        ]

    except Exception as e:
        logger.exception("Error fetching semesters: %s", e)
        raise HTTPException(
            status_code=500,
            detail=str(e),
        )
