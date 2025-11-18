from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from core import get_logger
from tools.gmail.list_unread_emails import list_unread
from tools.gmail.fetch_latest_mails import get_latest_emails
from tools.gmail.mark_email_read import mark_read
from tools.gmail.send_email import send_email

router = APIRouter()
logger = get_logger(__name__)


class TokenRequest(BaseModel):
    access_token: str


class UnreadRequest(TokenRequest):
    max_results: Optional[int] = 10


class LatestRequest(TokenRequest):
    max_results: Optional[int] = 5


class MarkReadRequest(TokenRequest):
    message_id: str


class SendEmailRequest(TokenRequest):
    to: str
    subject: str
    body: str


@router.post("/unread", response_model=dict)
async def list_unread_messages(request: UnreadRequest):
    try:
        if not request.access_token:
            raise HTTPException(status_code=400, detail="access_token is required")

        if not request.max_results or request.max_results <= 0:
            request.max_results = 10

        results = list_unread(request.access_token, max_results=request.max_results)

        return {
            "messages": results,
        }

    except HTTPException:
        raise

    except Exception as e:
        logger.exception("Error listing unread messages: %s", e)
        raise HTTPException(
            status_code=500,
            detail=str(e),
        )


@router.post("/latest", response_model=dict)
async def fetch_latest(request: LatestRequest):
    try:
        if not request.access_token:
            raise HTTPException(
                status_code=400,
                detail="access_token is required",
            )

        if not request.max_results or request.max_results <= 0:
            request.max_results = 5

        results = get_latest_emails(
            request.access_token, max_results=request.max_results
        )
        return {"messages": results}

    except HTTPException:
        raise

    except Exception as e:
        logger.exception("Error fetching latest messages: %s", e)
        raise HTTPException(
            status_code=500,
            detail=str(e),
        )


@router.post("/mark_read", response_model=dict)
async def mark_message_read(request: MarkReadRequest):
    try:
        if not request.access_token or not request.message_id:
            raise HTTPException(
                status_code=400, detail="access_token and message_id are required"
            )

        res = mark_read(request.access_token, request.message_id)
        return {
            "result": "ok",
            "details": res,
        }

    except HTTPException:
        raise

    except Exception as e:
        logger.exception("Error marking message read: %s", e)
        raise HTTPException(
            status_code=500,
            detail=str(e),
        )


@router.post("/send", response_model=dict)
async def send_message(request: SendEmailRequest):
    try:
        if not request.access_token or not request.to or not request.subject:
            raise HTTPException(
                status_code=400, detail="access_token, to and subject are required"
            )

        res = send_email(
            request.access_token, request.to, request.subject, request.body
        )
        return {
            "result": "sent",
            "details": res,
        }

    except HTTPException:
        raise

    except Exception as e:
        logger.exception("Error sending message: %s", e)
        raise HTTPException(
            status_code=500,
            detail=str(e),
        )
