from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select

from core.db import get_session
from models.db.app import Conversation, ConversationMessage, ClientContextSnapshot


DEFAULT_USER_ID = "default"


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _message_payload(msg: ConversationMessage) -> dict[str, Any]:
    return {
        "message_id": msg.message_id,
        "conversation_id": msg.conversation_id,
        "client_id": msg.client_id,
        "role": msg.role,
        "content": msg.content,
        "metadata": msg.metadata_,
        "created_at": msg.created_at.isoformat(),
    }


def _conversation_payload(conv: Conversation) -> dict[str, Any]:
    return {
        "conversation_id": conv.conversation_id,
        "client_id": conv.client_id,
        "title": conv.title,
        "summary": conv.summary,
        "status": conv.status,
        "metadata": conv.metadata_,
        "created_at": conv.created_at.isoformat(),
        "updated_at": conv.updated_at.isoformat(),
    }


class ConversationService:
    async def create_conversation(
        self,
        *,
        conversation_id: Optional[str] = None,
        title: str = "New Conversation",
        client_id: str = "unknown",
        user_id: str = DEFAULT_USER_ID,
        metadata: Optional[dict[str, Any]] = None,
    ) -> Conversation:
        now = _now()
        conv = Conversation(
            conversation_id=conversation_id or new_id("conv"),
            user_id=user_id,
            client_id=client_id,
            title=title or "New Conversation",
            metadata_=metadata or {},
            created_at=now,
            updated_at=now,
        )
        async with get_session() as session:
            session.add(conv)
        return conv

    async def get_or_create_conversation(
        self,
        conversation_id: Optional[str],
        *,
        title: str,
        client_id: str,
        user_id: str = DEFAULT_USER_ID,
    ) -> Conversation:
        if conversation_id:
            async with get_session() as session:
                conv = (
                    await session.execute(
                        select(Conversation).where(Conversation.conversation_id == conversation_id)
                    )
                ).scalar_one_or_none()
                if conv:
                    return conv
        return await self.create_conversation(
            conversation_id=conversation_id,
            title=title,
            client_id=client_id,
            user_id=user_id,
        )

    async def list_conversations(self, user_id: str = DEFAULT_USER_ID) -> list[dict[str, Any]]:
        async with get_session() as session:
            rows = (
                await session.execute(
                    select(Conversation)
                    .where(Conversation.user_id == user_id)
                    .order_by(Conversation.updated_at.desc())
                )
            ).scalars().all()
        return [_conversation_payload(row) for row in rows]

    async def get_conversation(self, conversation_id: str) -> dict[str, Any] | None:
        async with get_session() as session:
            conv = (
                await session.execute(
                    select(Conversation).where(Conversation.conversation_id == conversation_id)
                )
            ).scalar_one_or_none()
            if not conv:
                return None
        return _conversation_payload(conv)

    async def add_message(
        self,
        *,
        conversation_id: str,
        role: str,
        content: str,
        client_id: str = "unknown",
        user_id: str = DEFAULT_USER_ID,
        metadata: Optional[dict[str, Any]] = None,
    ) -> ConversationMessage:
        now = _now()
        msg = ConversationMessage(
            message_id=new_id("msg"),
            conversation_id=conversation_id,
            user_id=user_id,
            client_id=client_id,
            role=role,
            content=content,
            metadata_=metadata or {},
            created_at=now,
        )
        async with get_session() as session:
            session.add(msg)
            conv = (
                await session.execute(
                    select(Conversation).where(Conversation.conversation_id == conversation_id)
                )
            ).scalar_one_or_none()
            if conv:
                if role == "user" and conv.title == "New Conversation":
                    conv.title = content[:60] + ("..." if len(content) > 60 else "")
                conv.updated_at = now
        return msg

    async def list_messages(self, conversation_id: str, limit: int = 100) -> list[dict[str, Any]]:
        async with get_session() as session:
            rows = (
                await session.execute(
                    select(ConversationMessage)
                    .where(ConversationMessage.conversation_id == conversation_id)
                    .order_by(ConversationMessage.created_at.asc())
                    .limit(limit)
                )
            ).scalars().all()
        return [_message_payload(row) for row in rows]

    async def recent_history(self, conversation_id: str, limit: int = 20) -> list[dict[str, Any]]:
        async with get_session() as session:
            rows = (
                await session.execute(
                    select(ConversationMessage)
                    .where(ConversationMessage.conversation_id == conversation_id)
                    .order_by(ConversationMessage.created_at.desc())
                    .limit(limit)
                )
            ).scalars().all()
        return [_message_payload(row) for row in reversed(rows)]

    async def store_context_snapshot(
        self,
        *,
        conversation_id: Optional[str],
        payload: dict[str, Any],
        context_type: str = "generic",
        client_id: str = "unknown",
        user_id: str = DEFAULT_USER_ID,
    ) -> ClientContextSnapshot:
        snap = ClientContextSnapshot(
            context_id=new_id("ctx"),
            conversation_id=conversation_id,
            user_id=user_id,
            client_id=client_id,
            context_type=context_type,
            payload=payload,
            created_at=_now(),
        )
        async with get_session() as session:
            session.add(snap)
        return snap
