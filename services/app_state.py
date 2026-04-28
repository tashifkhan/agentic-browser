from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, select

from core.db import get_session
from models.db.app import AppSetting, BrowserSession, BrowserSessionMessage


DEFAULT_USER_ID = "default"


def _parse_dt(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            pass
    return datetime.now(timezone.utc)


def _session_to_payload(session: BrowserSession, messages: list[BrowserSessionMessage]) -> dict[str, Any]:
    return {
        "id": session.session_id,
        "title": session.title,
        "updatedAt": session.updated_at.isoformat(),
        "messages": [
            {
                "id": msg.message_id,
                "role": msg.role,
                "content": msg.content,
                "timestamp": msg.created_at.isoformat(),
                **({"events": msg.events} if msg.events else {}),
            }
            for msg in sorted(messages, key=lambda m: m.created_at)
        ],
    }


class AppStateService:
    async def list_sessions(self, user_id: str = DEFAULT_USER_ID) -> list[dict[str, Any]]:
        async with get_session() as session:
            session_rows = (
                await session.execute(
                    select(BrowserSession)
                    .where(BrowserSession.user_id == user_id)
                    .order_by(BrowserSession.updated_at.desc())
                )
            ).scalars().all()

            if not session_rows:
                return []

            messages = (
                await session.execute(
                    select(BrowserSessionMessage)
                    .where(BrowserSessionMessage.user_id == user_id)
                    .order_by(BrowserSessionMessage.created_at.asc())
                )
            ).scalars().all()

        by_session: dict[str, list[BrowserSessionMessage]] = {}
        for msg in messages:
            by_session.setdefault(msg.session_id, []).append(msg)

        return [_session_to_payload(row, by_session.get(row.session_id, [])) for row in session_rows]

    async def replace_sessions(self, sessions_payload: list[dict[str, Any]], user_id: str = DEFAULT_USER_ID) -> None:
        now = datetime.now(timezone.utc)
        async with get_session() as session:
            await session.execute(delete(BrowserSessionMessage).where(BrowserSessionMessage.user_id == user_id))
            await session.execute(delete(BrowserSession).where(BrowserSession.user_id == user_id))

            for raw in sessions_payload:
                session_id = str(raw.get("id") or "").strip()
                if not session_id:
                    continue
                updated_at = _parse_dt(raw.get("updatedAt"))
                session.add(
                    BrowserSession(
                        session_id=session_id,
                        user_id=user_id,
                        title=str(raw.get("title") or "New Chat"),
                        created_at=updated_at,
                        updated_at=updated_at,
                    )
                )
                for message in raw.get("messages") or []:
                    message_id = str(message.get("id") or "").strip()
                    if not message_id:
                        continue
                    created_at = _parse_dt(message.get("timestamp"))
                    session.add(
                        BrowserSessionMessage(
                            message_id=message_id,
                            session_id=session_id,
                            user_id=user_id,
                            role=str(message.get("role") or "user"),
                            content=str(message.get("content") or ""),
                            events=list(message.get("events") or []),
                            created_at=created_at,
                            updated_at=now,
                        )
                    )

    async def delete_session(self, session_id: str, user_id: str = DEFAULT_USER_ID) -> None:
        async with get_session() as session:
            await session.execute(
                delete(BrowserSession)
                .where(BrowserSession.user_id == user_id)
                .where(BrowserSession.session_id == session_id)
            )

    async def get_setting(self, key: str, user_id: str = DEFAULT_USER_ID) -> dict[str, Any] | None:
        async with get_session() as session:
            row = (
                await session.execute(
                    select(AppSetting)
                    .where(AppSetting.user_id == user_id)
                    .where(AppSetting.key == key)
                )
            ).scalar_one_or_none()
            return row.value if row else None

    async def set_setting(self, key: str, value: dict[str, Any], user_id: str = DEFAULT_USER_ID) -> None:
        now = datetime.now(timezone.utc)
        async with get_session() as session:
            row = (
                await session.execute(
                    select(AppSetting)
                    .where(AppSetting.user_id == user_id)
                    .where(AppSetting.key == key)
                )
            ).scalar_one_or_none()
            if row:
                row.value = value
                row.updated_at = now
            else:
                session.add(
                    AppSetting(
                        user_id=user_id,
                        key=key,
                        value=value,
                        created_at=now,
                        updated_at=now,
                    )
                )

    async def delete_setting(self, key: str, user_id: str = DEFAULT_USER_ID) -> None:
        async with get_session() as session:
            await session.execute(
                delete(AppSetting)
                .where(AppSetting.user_id == user_id)
                .where(AppSetting.key == key)
            )
