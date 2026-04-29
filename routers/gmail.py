from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from core import get_logger
from services.gmail_service import GmailService
from services.oauth_credentials_service import NeedsReauth, get_oauth_credentials_service

router = APIRouter()
logger = get_logger(__name__)


class UnreadRequest(BaseModel):
    max_results: Optional[int] = 10


class LatestRequest(BaseModel):
    max_results: Optional[int] = 5


class MarkReadRequest(BaseModel):
    message_id: str


class SendEmailRequest(BaseModel):
    to: str
    subject: str
    body: str = ""


def get_gmail_service():
    return GmailService()


async def _token() -> str:
    creds = get_oauth_credentials_service()
    try:
        return await creds.get_access_token("gmail")
    except NeedsReauth as e:
        raise HTTPException(
            status_code=401,
            detail={"code": "needs_reauth", "provider": "google", "reason": e.reason},
        )


@router.post("/unread", response_model=dict)
async def list_unread_messages(
    request: UnreadRequest, service: GmailService = Depends(get_gmail_service)
):
    try:
        token = await _token()
        max_results = request.max_results if request.max_results and request.max_results > 0 else 10
        results = service.list_unread_messages(token, max_results=max_results)
        return {"messages": results}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/latest", response_model=dict)
async def fetch_latest(
    request: LatestRequest, service: GmailService = Depends(get_gmail_service)
):
    try:
        token = await _token()
        max_results = request.max_results if request.max_results and request.max_results > 0 else 5
        results = service.fetch_latest_messages(token, max_results=max_results)
        return {"messages": results}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/mark_read", response_model=dict)
async def mark_message_read(
    request: MarkReadRequest, service: GmailService = Depends(get_gmail_service)
):
    try:
        if not request.message_id:
            raise HTTPException(status_code=400, detail="message_id is required")
        token = await _token()
        res = service.mark_message_read(token, request.message_id)
        return {"result": "ok", "details": res}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/send", response_model=dict)
async def send_message(
    request: SendEmailRequest, service: GmailService = Depends(get_gmail_service)
):
    try:
        if not request.to or not request.subject:
            raise HTTPException(status_code=400, detail="to and subject are required")
        token = await _token()
        res = service.send_message(token, request.to, request.subject, request.body)
        return {"result": "sent", "details": res}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
