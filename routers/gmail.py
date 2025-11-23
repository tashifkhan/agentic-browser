from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from core import get_logger
from services.gmail_service import GmailService

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


def get_gmail_service():
    return GmailService()


@router.post("/unread", response_model=dict)
async def list_unread_messages(
    request: UnreadRequest, service: GmailService = Depends(get_gmail_service)
):
    try:
        if not request.access_token:
            raise HTTPException(status_code=400, detail="access_token is required")

        if not request.max_results or request.max_results <= 0:
            request.max_results = 10

        results = service.list_unread_messages(
            request.access_token, max_results=request.max_results
        )

        return {
            "messages": results,
        }

    except HTTPException:
        raise

    except Exception as e:
        # Service already logs exception
        raise HTTPException(
            status_code=500,
            detail=str(e),
        )


@router.post("/latest", response_model=dict)
async def fetch_latest(
    request: LatestRequest, service: GmailService = Depends(get_gmail_service)
):
    try:
        if not request.access_token:
            raise HTTPException(
                status_code=400,
                detail="access_token is required",
            )

        if not request.max_results or request.max_results <= 0:
            request.max_results = 5

        results = service.fetch_latest_messages(
            request.access_token, max_results=request.max_results
        )
        return {"messages": results}

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e),
        )


@router.post("/mark_read", response_model=dict)
async def mark_message_read(
    request: MarkReadRequest, service: GmailService = Depends(get_gmail_service)
):
    try:
        if not request.access_token or not request.message_id:
            raise HTTPException(
                status_code=400, detail="access_token and message_id are required"
            )

        res = service.mark_message_read(request.access_token, request.message_id)
        return {
            "result": "ok",
            "details": res,
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e),
        )


@router.post("/send", response_model=dict)
async def send_message(
    request: SendEmailRequest, service: GmailService = Depends(get_gmail_service)
):
    try:
        if not request.access_token or not request.to or not request.subject:
            raise HTTPException(
                status_code=400, detail="access_token, to and subject are required"
            )

        res = service.send_message(
            request.access_token, request.to, request.subject, request.body
        )
        return {
            "result": "sent",
            "details": res,
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e),
        )
