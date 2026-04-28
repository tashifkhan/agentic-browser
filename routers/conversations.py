from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from services.conversations import ConversationService, DEFAULT_USER_ID
from services.run_traces import (
    get_run,
    list_run_events,
    list_runs_for_conversation,
    list_subagent_runs,
    list_tool_calls,
)


router = APIRouter()


class CreateConversationRequest(BaseModel):
    title: str = "New Conversation"
    client_id: str = "unknown"
    metadata: dict[str, Any] = Field(default_factory=dict)


class AddMessageRequest(BaseModel):
    role: str = "user"
    content: str
    client_id: str = "unknown"
    metadata: dict[str, Any] = Field(default_factory=dict)


class ClientContextRequest(BaseModel):
    conversation_id: Optional[str] = None
    client_id: str = "unknown"
    context_type: str = "generic"
    payload: dict[str, Any] = Field(default_factory=dict)


def _svc() -> ConversationService:
    return ConversationService()


@router.post("/conversations")
async def create_conversation(req: CreateConversationRequest, user_id: str = Query(default=DEFAULT_USER_ID)):
    try:
        conv = await _svc().create_conversation(
            title=req.title,
            client_id=req.client_id,
            user_id=user_id,
            metadata=req.metadata,
        )
        return {"conversation_id": conv.conversation_id, "title": conv.title}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/conversations")
async def list_conversations(user_id: str = Query(default=DEFAULT_USER_ID)):
    try:
        return {"conversations": await _svc().list_conversations(user_id=user_id)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str):
    try:
        conv = await _svc().get_conversation(conversation_id)
        if not conv:
            raise HTTPException(status_code=404, detail="conversation not found")
        return conv
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/conversations/{conversation_id}/messages")
async def list_messages(conversation_id: str, limit: int = Query(default=100, ge=1, le=500)):
    try:
        return {"messages": await _svc().list_messages(conversation_id, limit=limit)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/conversations/{conversation_id}/messages")
async def add_message(conversation_id: str, req: AddMessageRequest, user_id: str = Query(default=DEFAULT_USER_ID)):
    try:
        msg = await _svc().add_message(
            conversation_id=conversation_id,
            role=req.role,
            content=req.content,
            client_id=req.client_id,
            user_id=user_id,
            metadata=req.metadata,
        )
        return {"message_id": msg.message_id}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/conversations/{conversation_id}/runs")
async def list_conversation_runs(conversation_id: str):
    try:
        return {"runs": await list_runs_for_conversation(conversation_id)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/client-context")
async def store_client_context(req: ClientContextRequest, user_id: str = Query(default=DEFAULT_USER_ID)):
    try:
        snap = await _svc().store_context_snapshot(
            conversation_id=req.conversation_id,
            payload=req.payload,
            context_type=req.context_type,
            client_id=req.client_id,
            user_id=user_id,
        )
        return {"context_id": snap.context_id}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/runs/{run_id}")
async def read_run(run_id: str):
    try:
        run = await get_run(run_id)
        if not run:
            raise HTTPException(status_code=404, detail="run not found")
        return run
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/runs/{run_id}/events")
async def read_run_events(run_id: str):
    try:
        return {"events": await list_run_events(run_id)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/runs/{run_id}/subagents")
async def read_run_subagents(run_id: str):
    try:
        return {"subagents": await list_subagent_runs(run_id)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/runs/{run_id}/tool-calls")
async def read_run_tool_calls(run_id: str):
    try:
        return {"tool_calls": await list_tool_calls(run_id)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
