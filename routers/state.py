from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from services.app_state import AppStateService, DEFAULT_USER_ID


router = APIRouter()


class SessionsPayload(BaseModel):
    sessions: list[dict[str, Any]] = Field(default_factory=list)


class SettingPayload(BaseModel):
    value: dict[str, Any] = Field(default_factory=dict)


def _svc() -> AppStateService:
    return AppStateService()


@router.get("/sessions")
async def list_sessions(user_id: str = Query(default=DEFAULT_USER_ID)):
    try:
        return {"sessions": await _svc().list_sessions(user_id=user_id)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.put("/sessions")
async def replace_sessions(payload: SessionsPayload, user_id: str = Query(default=DEFAULT_USER_ID)):
    try:
        await _svc().replace_sessions(payload.sessions, user_id=user_id)
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, user_id: str = Query(default=DEFAULT_USER_ID)):
    try:
        await _svc().delete_session(session_id, user_id=user_id)
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/settings/{key}")
async def get_setting(key: str, user_id: str = Query(default=DEFAULT_USER_ID)):
    try:
        return {"key": key, "value": await _svc().get_setting(key, user_id=user_id)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.put("/settings/{key}")
async def set_setting(key: str, payload: SettingPayload, user_id: str = Query(default=DEFAULT_USER_ID)):
    try:
        await _svc().set_setting(key, payload.value, user_id=user_id)
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/settings/{key}")
async def delete_setting(key: str, user_id: str = Query(default=DEFAULT_USER_ID)):
    try:
        await _svc().delete_setting(key, user_id=user_id)
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
