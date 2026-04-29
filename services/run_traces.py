from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select

from core.db import get_session
from models.db.app import AgentEvent, AgentRun, SubagentRun, ToolCall


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


class RunTraceService:
    def __init__(self, *, run_id: str, conversation_id: str) -> None:
        self.run_id = run_id
        self.conversation_id = conversation_id
        self._subagent_ids: dict[str, str] = {}
        self._open_tool_calls: dict[tuple[str, str], str] = {}

    @classmethod
    async def create_run(
        cls,
        *,
        conversation_id: str,
        user_message_id: Optional[str],
        client_id: str = "unknown",
        user_id: str = "default",
        entrypoint: str = "react_agent",
        metadata: Optional[dict[str, Any]] = None,
    ) -> "RunTraceService":
        run_id = _id("run")
        async with get_session() as session:
            session.add(
                AgentRun(
                    run_id=run_id,
                    conversation_id=conversation_id,
                    user_message_id=user_message_id,
                    user_id=user_id,
                    client_id=client_id,
                    entrypoint=entrypoint,
                    status="running",
                    metadata_=metadata or {},
                    started_at=_now(),
                )
            )
        return cls(run_id=run_id, conversation_id=conversation_id)

    async def complete_run(
        self,
        *,
        final_answer: str,
        final_message_id: Optional[str] = None,
        status: str = "completed",
        error: Optional[str] = None,
    ) -> None:
        async with get_session() as session:
            run = (
                await session.execute(
                    select(AgentRun).where(AgentRun.run_id == self.run_id)
                )
            ).scalar_one_or_none()
            if run:
                run.status = status
                run.final_answer = final_answer
                run.final_message_id = final_message_id
                run.error = error
                run.completed_at = _now()

    async def record_event(self, payload: dict[str, Any]) -> None:
        event_type = str(payload.get("event") or "event")
        subagent_name = str(payload.get("subagent") or "")
        subagent_run_id = (
            self._subagent_ids.get(subagent_name) if subagent_name else None
        )

        async with get_session() as session:
            if event_type == "subagent_started" and subagent_name:
                subagent_run_id = _id("subrun")
                self._subagent_ids[subagent_name] = subagent_run_id
                session.add(
                    SubagentRun(
                        subagent_run_id=subagent_run_id,
                        run_id=self.run_id,
                        conversation_id=self.conversation_id,
                        name=subagent_name,
                        task=str(payload.get("task") or ""),
                        status="running",
                        started_at=_now(),
                    )
                )
                await session.flush()
            elif event_type == "subagent_completed" and subagent_name:
                subagent_run_id = self._subagent_ids.get(subagent_name)
                if subagent_run_id:
                    subrun = (
                        await session.execute(
                            select(SubagentRun).where(
                                SubagentRun.subagent_run_id == subagent_run_id
                            )
                        )
                    ).scalar_one_or_none()
                    if subrun:
                        subrun.status = "completed"
                        subrun.result = str(payload.get("result") or "")
                        subrun.completed_at = _now()
            elif event_type == "subagent_tool_call":
                tool_name = str(payload.get("tool") or "unknown")
                key = (subagent_name, tool_name)
                call_id = _id("tool")
                self._open_tool_calls[key] = call_id
                session.add(
                    ToolCall(
                        tool_call_id=call_id,
                        run_id=self.run_id,
                        conversation_id=self.conversation_id,
                        subagent_run_id=subagent_run_id,
                        tool_name=tool_name,
                        args=dict(payload.get("args") or {}),
                        status="running",
                        started_at=_now(),
                    )
                )
            elif event_type in {"subagent_tool_result", "subagent_tool_error"}:
                tool_name = str(payload.get("tool") or "unknown")
                key = (subagent_name, tool_name)
                call_id = self._open_tool_calls.pop(key, None)
                if call_id:
                    call = (
                        await session.execute(
                            select(ToolCall).where(ToolCall.tool_call_id == call_id)
                        )
                    ).scalar_one_or_none()
                    if call:
                        call.status = (
                            "failed"
                            if event_type == "subagent_tool_error"
                            else "completed"
                        )
                        call.result = (
                            {"result": payload.get("result")}
                            if "result" in payload
                            else None
                        )
                        call.error = (
                            str(payload.get("error")) if payload.get("error") else None
                        )
                        call.completed_at = _now()

            session.add(
                AgentEvent(
                    event_id=_id("evt"),
                    run_id=self.run_id,
                    conversation_id=self.conversation_id,
                    subagent_run_id=subagent_run_id,
                    event_type=event_type,
                    payload=payload,
                    created_at=_now(),
                )
            )


async def get_run(run_id: str) -> dict[str, Any] | None:
    async with get_session() as session:
        run = (
            await session.execute(select(AgentRun).where(AgentRun.run_id == run_id))
        ).scalar_one_or_none()
        if not run:
            return None
        return {
            "run_id": run.run_id,
            "conversation_id": run.conversation_id,
            "user_message_id": run.user_message_id,
            "final_message_id": run.final_message_id,
            "client_id": run.client_id,
            "entrypoint": run.entrypoint,
            "status": run.status,
            "final_answer": run.final_answer,
            "error": run.error,
            "started_at": run.started_at.isoformat(),
            "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        }


async def list_runs_for_conversation(conversation_id: str) -> list[dict[str, Any]]:
    async with get_session() as session:
        rows = (
            (
                await session.execute(
                    select(AgentRun)
                    .where(AgentRun.conversation_id == conversation_id)
                    .order_by(AgentRun.started_at.desc())
                )
            )
            .scalars()
            .all()
        )
    return [
        {
            "run_id": row.run_id,
            "conversation_id": row.conversation_id,
            "user_message_id": row.user_message_id,
            "final_message_id": row.final_message_id,
            "client_id": row.client_id,
            "entrypoint": row.entrypoint,
            "status": row.status,
            "final_answer": row.final_answer,
            "error": row.error,
            "started_at": row.started_at.isoformat(),
            "completed_at": row.completed_at.isoformat() if row.completed_at else None,
        }
        for row in rows
    ]


async def list_run_events(run_id: str) -> list[dict[str, Any]]:
    async with get_session() as session:
        rows = (
            (
                await session.execute(
                    select(AgentEvent)
                    .where(AgentEvent.run_id == run_id)
                    .order_by(AgentEvent.created_at.asc())
                )
            )
            .scalars()
            .all()
        )
    return [
        {
            "event_id": row.event_id,
            "run_id": row.run_id,
            "conversation_id": row.conversation_id,
            "subagent_run_id": row.subagent_run_id,
            "event_type": row.event_type,
            "payload": row.payload,
            "created_at": row.created_at.isoformat(),
        }
        for row in rows
    ]


async def list_subagent_runs(run_id: str) -> list[dict[str, Any]]:
    async with get_session() as session:
        rows = (
            (
                await session.execute(
                    select(SubagentRun)
                    .where(SubagentRun.run_id == run_id)
                    .order_by(SubagentRun.started_at.asc())
                )
            )
            .scalars()
            .all()
        )
    return [
        {
            "subagent_run_id": row.subagent_run_id,
            "run_id": row.run_id,
            "conversation_id": row.conversation_id,
            "name": row.name,
            "task": row.task,
            "status": row.status,
            "result": row.result,
            "started_at": row.started_at.isoformat(),
            "completed_at": row.completed_at.isoformat() if row.completed_at else None,
        }
        for row in rows
    ]


async def list_tool_calls(run_id: str) -> list[dict[str, Any]]:
    async with get_session() as session:
        rows = (
            (
                await session.execute(
                    select(ToolCall)
                    .where(ToolCall.run_id == run_id)
                    .order_by(ToolCall.started_at.asc())
                )
            )
            .scalars()
            .all()
        )
    return [
        {
            "tool_call_id": row.tool_call_id,
            "run_id": row.run_id,
            "conversation_id": row.conversation_id,
            "subagent_run_id": row.subagent_run_id,
            "tool_name": row.tool_name,
            "args": row.args,
            "status": row.status,
            "result": row.result,
            "error": row.error,
            "started_at": row.started_at.isoformat(),
            "completed_at": row.completed_at.isoformat() if row.completed_at else None,
        }
        for row in rows
    ]
