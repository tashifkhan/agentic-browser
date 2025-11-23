import re
from typing import Any, Dict, List, Optional

from core import get_logger
from tools.pyjiit.attendance import Semester as SemesterClass
from tools.pyjiit.default import CAPTCHA as DEFAULT_CAPTCHA
from tools.pyjiit.tokens import Captcha as CaptchaClass
from tools.pyjiit.wrapper import Webportal, WebportalSession

logger = get_logger(__name__)


class PyjiitService:
    def login(self, username: str, password: str) -> Dict[str, Any]:
        try:
            wp = Webportal()
            session = wp.student_login(username, password, DEFAULT_CAPTCHA)
            return session.model_dump()

        except Exception as e:
            logger.exception("Login error: %s", e)
            raise

    def get_semesters(self, session_payload: Dict[str, Any]) -> List[Dict[str, Any]]:
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
            raise

    def get_attendance(
        self, session_payload: Dict[str, Any], registration_code: Optional[str] = None
    ) -> List[Dict[str, Any]]:
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
                raise ValueError(
                    f"Hardcoded registration id for '{target_code}' not found"
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

        except Exception as e:
            logger.exception("Error fetching attendance: %s", e)
            raise
