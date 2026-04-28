from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import Column, DateTime, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AppSetting(SQLModel, table=True):
    __tablename__ = "app_settings"
    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_app_settings_user_key"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(default="default", index=True)
    key: str = Field(index=True)
    value: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSONB, nullable=False))
    created_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False))
    updated_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False))


class BrowserSession(SQLModel, table=True):
    __tablename__ = "browser_sessions"

    session_id: str = Field(primary_key=True)
    user_id: str = Field(default="default", index=True)
    title: str = Field(default="New Chat")
    created_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False))
    updated_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False, index=True))
    metadata_: dict[str, Any] = Field(default_factory=dict, sa_column=Column("metadata", JSONB, nullable=False))


class BrowserSessionMessage(SQLModel, table=True):
    __tablename__ = "browser_session_messages"

    message_id: str = Field(primary_key=True)
    session_id: str = Field(foreign_key="browser_sessions.session_id", index=True)
    user_id: str = Field(default="default", index=True)
    role: str = Field(index=True)
    content: str = Field(sa_column=Column(Text, nullable=False))
    events: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSONB, nullable=False))
    created_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False, index=True))
    updated_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False))


class BrowserCredential(SQLModel, table=True):
    __tablename__ = "browser_credentials"
    __table_args__ = (UniqueConstraint("user_id", "provider", name="uq_browser_credentials_user_provider"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(default="default", index=True)
    provider: str = Field(index=True)
    account_label: Optional[str] = None
    payload: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSONB, nullable=False))
    created_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False))
    updated_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False))


class BrowserSnapshot(SQLModel, table=True):
    __tablename__ = "browser_snapshots"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(default="default", index=True)
    kind: str = Field(index=True)
    payload: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSONB, nullable=False))
    created_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False, index=True))


class Conversation(SQLModel, table=True):
    __tablename__ = "conversations"

    conversation_id: str = Field(primary_key=True)
    user_id: str = Field(default="default", index=True)
    client_id: str = Field(default="unknown", index=True)
    title: str = Field(default="New Conversation")
    summary: Optional[str] = None
    status: str = Field(default="active", index=True)
    metadata_: dict[str, Any] = Field(default_factory=dict, sa_column=Column("metadata", JSONB, nullable=False))
    created_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False))
    updated_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False, index=True))


class ConversationMessage(SQLModel, table=True):
    __tablename__ = "conversation_messages"

    message_id: str = Field(primary_key=True)
    conversation_id: str = Field(foreign_key="conversations.conversation_id", index=True)
    user_id: str = Field(default="default", index=True)
    client_id: str = Field(default="unknown", index=True)
    role: str = Field(index=True)
    content: str = Field(sa_column=Column(Text, nullable=False))
    metadata_: dict[str, Any] = Field(default_factory=dict, sa_column=Column("metadata", JSONB, nullable=False))
    created_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False, index=True))


class AgentRun(SQLModel, table=True):
    __tablename__ = "agent_runs"

    run_id: str = Field(primary_key=True)
    conversation_id: str = Field(foreign_key="conversations.conversation_id", index=True)
    user_message_id: Optional[str] = Field(default=None, foreign_key="conversation_messages.message_id", index=True)
    final_message_id: Optional[str] = Field(default=None, foreign_key="conversation_messages.message_id", index=True)
    user_id: str = Field(default="default", index=True)
    client_id: str = Field(default="unknown", index=True)
    entrypoint: str = Field(default="react_agent", index=True)
    status: str = Field(default="running", index=True)
    final_answer: Optional[str] = Field(default=None, sa_column=Column(Text))
    error: Optional[str] = Field(default=None, sa_column=Column(Text))
    metadata_: dict[str, Any] = Field(default_factory=dict, sa_column=Column("metadata", JSONB, nullable=False))
    started_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False, index=True))
    completed_at: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True)))


class SubagentRun(SQLModel, table=True):
    __tablename__ = "subagent_runs"

    subagent_run_id: str = Field(primary_key=True)
    run_id: str = Field(foreign_key="agent_runs.run_id", index=True)
    conversation_id: str = Field(foreign_key="conversations.conversation_id", index=True)
    name: str = Field(index=True)
    task: str = Field(sa_column=Column(Text, nullable=False))
    status: str = Field(default="running", index=True)
    result: Optional[str] = Field(default=None, sa_column=Column(Text))
    started_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False, index=True))
    completed_at: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True)))


class AgentEvent(SQLModel, table=True):
    __tablename__ = "agent_events"

    event_id: str = Field(primary_key=True)
    run_id: str = Field(foreign_key="agent_runs.run_id", index=True)
    conversation_id: str = Field(foreign_key="conversations.conversation_id", index=True)
    subagent_run_id: Optional[str] = Field(default=None, foreign_key="subagent_runs.subagent_run_id", index=True)
    event_type: str = Field(index=True)
    payload: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSONB, nullable=False))
    created_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False, index=True))


class ToolCall(SQLModel, table=True):
    __tablename__ = "tool_calls"

    tool_call_id: str = Field(primary_key=True)
    run_id: str = Field(foreign_key="agent_runs.run_id", index=True)
    conversation_id: str = Field(foreign_key="conversations.conversation_id", index=True)
    subagent_run_id: Optional[str] = Field(default=None, foreign_key="subagent_runs.subagent_run_id", index=True)
    tool_name: str = Field(index=True)
    args: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSONB, nullable=False))
    status: str = Field(default="running", index=True)
    result: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSONB))
    error: Optional[str] = Field(default=None, sa_column=Column(Text))
    started_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False, index=True))
    completed_at: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True)))


class ClientContextSnapshot(SQLModel, table=True):
    __tablename__ = "client_context_snapshots"

    context_id: str = Field(primary_key=True)
    conversation_id: Optional[str] = Field(default=None, foreign_key="conversations.conversation_id", index=True)
    user_id: str = Field(default="default", index=True)
    client_id: str = Field(default="unknown", index=True)
    context_type: str = Field(default="generic", index=True)
    payload: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSONB, nullable=False))
    created_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False, index=True))
