from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import anyio
from sqlalchemy import select

from core.config import get_logger, get_settings
from core.db import get_session
from core.llm import LargeLanguageModel
from models.db.app import Conversation, ConversationMessage, ClientContextSnapshot


DEFAULT_USER_ID = "default"
logger = get_logger(__name__)


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


def _fallback_title(content: str) -> str:
    compact = " ".join(content.split())
    return compact[:60] + ("..." if len(compact) > 60 else "")


def _clean_generated_title(title: str, fallback: str) -> str:
    cleaned = " ".join(title.strip().strip('"\'`').split())
    if not cleaned:
        return fallback
    cleaned = cleaned.rstrip(".")
    return cleaned[:60]


def _generate_title_sync(
    content: str,
    provider: str,
    model_name: str | None,
    temperature: float,
) -> str:
    fallback = _fallback_title(content)
    settings = get_settings()
    provider = (provider or "google").lower()
    secret_attr = {
        "google": "google_api_key",
        "openai": "openai_api_key",
        "anthropic": "anthropic_api_key",
        "deepseek": "deepseek_api_key",
        "openrouter": "openrouter_api_key",
    }.get(provider)
    api_key = getattr(settings, secret_attr, "") if secret_attr else ""
    model = LargeLanguageModel(
        provider=provider,  # type: ignore[arg-type]
        model_name=model_name,
        api_key=api_key,
        base_url=settings.base_url or None,
        temperature=temperature,
    )
    title = model.generate_text(
        prompt=content[:4000],
        system_message=(
            "Generate a concise chat title for the user's message. "
            "Return only the title, no quotes, no punctuation-only response, "
            "maximum 6 words."
        ),
    )
    return _clean_generated_title(title, fallback)


async def generate_chat_title(content: str) -> str:
    fallback = _fallback_title(content)
    settings = get_settings()
    provider = settings.chat_title_llm_provider or "google"
    model_name = settings.chat_title_llm_model or None
    temperature = settings.chat_title_llm_temperature
    try:
        from services.app_state import AppStateService

        override = await AppStateService().get_setting("llm.chat_title")
        if override:
            provider = override.get("provider") or provider
            model_name = override.get("model") or model_name
            temperature = override.get("temperature", temperature)
    except Exception:
        pass

    try:
        return await anyio.to_thread.run_sync(
            _generate_title_sync,
            content,
            provider,
            model_name,
            temperature,
        )
    except Exception as exc:
        logger.warning("Chat title generation failed; using fallback title: %s", exc)
        return fallback


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
        generated_title: str | None = None
        if role == "user":
            async with get_session() as session:
                conv = (
                    await session.execute(
                        select(Conversation.title).where(
                            Conversation.conversation_id == conversation_id
                        )
                    )
                ).scalar_one_or_none()
            if conv == "New Conversation":
                generated_title = await generate_chat_title(content)

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
                if generated_title and conv.title == "New Conversation":
                    conv.title = generated_title
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
