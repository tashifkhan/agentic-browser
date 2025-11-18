from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import re

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


class AttendanceReq(BaseModel):
    """Request model for attendance lookup.

    Provide `session_payload` which is the object returned by `/login`
    (or the raw response dict inside it). Optionally provide
    `registration_code` (e.g., "2025ODDSEM"). If omitted, latest
    semester from attendance meta will be used.
    """

    session_payload: Dict[str, Any]
    registration_code: Optional[str] = None


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


@router.post("/attendence", response_model=List[Dict[str, Any]])
async def attendence(
    session_payload: Dict[str, Any], registration_code: Optional[str] = None
):
    """Return attendance for the requested semester.

    Endpoint name intentionally matches the user's spelling `/attendence`.
    """
    try:
        payload = session_payload

        # Accept either a wrapper {"session_payload": {...}} or the raw session dict
        if isinstance(payload, dict) and "session_payload" in payload:
            payload = payload["session_payload"]

        if isinstance(payload, dict) and "raw_response" in payload:
            payload = payload["raw_response"]

        session = WebportalSession(payload)
        wp = Webportal(session=session)

        # Get attendance meta which contains headers and semesters
        meta = wp.get_attendance_meta()

        # Use a hardcoded mapping of registration_code -> registration_id.
        # The caller will not provide the registration code; always use
        # the hardcoded value '2025ODDSEM' per user's request.
        HARD_CODED_SEMESTERS = {
            "2026EVESEM": "JIRUM25100000001",
            "2025ODDSEM": "JIRUM25030000001",
            "2025EVESEM": "JIRUM24100000001",
            "2024ODDSEM": "JIRUM24030000001",
            "2024EVESEM": "JIRUM23110000001",
            "SUMMER2023": "JIRUM23050000001",
            "2023ODDSEM": "JIRUM23040000001",
            "2023EVESEM": "JIRUM22110000001",
            "2022ODDSEM": "JIRUM22050000001",
        }

        target_code = "2025ODDSEM"
        registration_id = HARD_CODED_SEMESTERS.get(target_code)
        if not registration_id:
            raise HTTPException(
                status_code=500,
                detail=f"Hardcoded registration id for '{target_code}' not found",
            )

        # Build a Semester object from the hardcoded values
        sem = SemesterClass(
            registration_code=target_code, registration_id=registration_id
        )

        header = meta.latest_header()

        attendance = wp.get_attendance(header, sem)

        # attendance expected shape: {"currentSem": ..., "studentattendancelist": [...]}
        raw_list = (
            attendance.get("studentattendancelist", [])
            if isinstance(attendance, dict)
            else []
        )

        processed = []
        for item in raw_list:
            subj = item.get("subjectcode", "") or ""
            # extract code in parentheses at the end
            m = re.search(r"\(([^)]+)\)\s*$", subj)
            code = m.group(1) if m else ""
            # strip the trailing bracketed code from subject name
            subject_no_bracket = re.sub(r"\s*\([^)]*\)\s*$", "", subj).strip()

            processed.append(
                {
                    "LTpercantage": item.get("LTpercantage"),
                    "subjectcode": subject_no_bracket,
                    "subjectcode_code": code,
                }
            )

        return processed

    except HTTPException:
        raise

    except Exception as e:
        logger.exception("Error fetching attendance: %s", e)
        raise HTTPException(
            status_code=500,
            detail=str(e),
        )
