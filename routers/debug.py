"""Debug dashboard API — read-only observability endpoints."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Query
from sqlalchemy import func, select, cast, Date

from core.db import get_session
from models.db.app import AgentEvent, AgentRun, Conversation, SubagentRun, ToolCall
from models.db.memory import ClaimORM, MaintenanceRunORM, SourceORM

router = APIRouter(tags=["debug"])


# ── Overview ───────────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats():
    async with get_session() as session:
        run_counts = (
            await session.execute(
                select(AgentRun.status, func.count().label("n"))
                .group_by(AgentRun.status)
            )
        ).all()

        total_conversations = (
            await session.execute(select(func.count()).select_from(Conversation))
        ).scalar_one()

        total_tool_calls = (
            await session.execute(select(func.count()).select_from(ToolCall))
        ).scalar_one()

        total_events = (
            await session.execute(select(func.count()).select_from(AgentEvent))
        ).scalar_one()

        claim_tiers = (
            await session.execute(
                select(ClaimORM.tier, func.count().label("n"))
                .where(ClaimORM.status == "active")
                .group_by(ClaimORM.tier)
            )
        ).all()

        total_sources = (
            await session.execute(select(func.count()).select_from(SourceORM))
        ).scalar_one()

    runs_by_status = {row.status: row.n for row in run_counts}
    claims_by_tier = {row.tier: row.n for row in claim_tiers}

    return {
        "runs": {
            "total": sum(runs_by_status.values()),
            "running": runs_by_status.get("running", 0),
            "completed": runs_by_status.get("completed", 0),
            "failed": runs_by_status.get("failed", 0),
        },
        "conversations": total_conversations,
        "tool_calls": total_tool_calls,
        "events": total_events,
        "memory": {
            "total_active": sum(claims_by_tier.values()),
            "short_term": claims_by_tier.get("short_term", 0),
            "long_term": claims_by_tier.get("long_term", 0),
            "permanent": claims_by_tier.get("permanent", 0),
            "sources": total_sources,
        },
    }


# ── Timeseries ─────────────────────────────────────────────────────────────────

@router.get("/timeseries")
async def get_timeseries(days: int = Query(30, le=90)):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    async with get_session() as session:
        run_buckets = (
            await session.execute(
                select(
                    cast(AgentRun.started_at, Date).label("day"),
                    func.count().label("total"),
                    func.sum(
                        func.cast(AgentRun.status == "completed", func.Integer if False else func.count().type.__class__)
                    ).label("completed"),
                    func.sum(
                        func.cast(AgentRun.status == "failed", func.Integer if False else func.count().type.__class__)
                    ).label("failed"),
                )
                .where(AgentRun.started_at >= cutoff)
                .group_by(cast(AgentRun.started_at, Date))
                .order_by(cast(AgentRun.started_at, Date).asc())
            )
        ).all()

        tool_buckets = (
            await session.execute(
                select(
                    cast(ToolCall.started_at, Date).label("day"),
                    func.count().label("total"),
                )
                .where(ToolCall.started_at >= cutoff)
                .group_by(cast(ToolCall.started_at, Date))
                .order_by(cast(ToolCall.started_at, Date).asc())
            )
        ).all()

    # Merge into unified day buckets
    run_by_day = {str(r.day): {"runs": r.total} for r in run_buckets}
    tool_by_day = {str(r.day): r.total for r in tool_buckets}

    # Generate all days in range
    buckets = []
    for i in range(days):
        day = (cutoff + timedelta(days=i + 1)).strftime("%Y-%m-%d")
        buckets.append({
            "day": day,
            "runs": run_by_day.get(day, {}).get("runs", 0),
            "tool_calls": tool_by_day.get(day, 0),
        })

    return buckets


# ── Agent Runs ─────────────────────────────────────────────────────────────────

@router.get("/runs")
async def list_runs(
    status: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
):
    async with get_session() as session:
        q = select(AgentRun).order_by(AgentRun.started_at.desc()).limit(limit).offset(offset)
        if status:
            q = q.where(AgentRun.status == status)
        rows = (await session.execute(q)).scalars().all()

    return [
        {
            "run_id": r.run_id,
            "conversation_id": r.conversation_id,
            "entrypoint": r.entrypoint,
            "status": r.status,
            "final_answer": (r.final_answer or "")[:200] if r.final_answer else None,
            "error": r.error,
            "started_at": r.started_at.isoformat(),
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            "duration_s": (
                (r.completed_at - r.started_at).total_seconds() if r.completed_at else None
            ),
        }
        for r in rows
    ]


@router.get("/runs/{run_id}")
async def get_run(run_id: str):
    async with get_session() as session:
        run = (
            await session.execute(select(AgentRun).where(AgentRun.run_id == run_id))
        ).scalar_one_or_none()
        if not run:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Run not found")

        subagents = (
            await session.execute(
                select(SubagentRun)
                .where(SubagentRun.run_id == run_id)
                .order_by(SubagentRun.started_at.asc())
            )
        ).scalars().all()

        tools = (
            await session.execute(
                select(ToolCall)
                .where(ToolCall.run_id == run_id)
                .order_by(ToolCall.started_at.asc())
            )
        ).scalars().all()

    return {
        "run_id": run.run_id,
        "conversation_id": run.conversation_id,
        "entrypoint": run.entrypoint,
        "status": run.status,
        "final_answer": run.final_answer,
        "error": run.error,
        "started_at": run.started_at.isoformat(),
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        "duration_s": (
            (run.completed_at - run.started_at).total_seconds() if run.completed_at else None
        ),
        "subagents": [
            {
                "subagent_run_id": s.subagent_run_id,
                "name": s.name,
                "task": s.task,
                "status": s.status,
                "result": (s.result or "")[:300] if s.result else None,
                "started_at": s.started_at.isoformat(),
                "completed_at": s.completed_at.isoformat() if s.completed_at else None,
            }
            for s in subagents
        ],
        "tool_calls": [
            {
                "tool_call_id": t.tool_call_id,
                "tool_name": t.tool_name,
                "status": t.status,
                "args": t.args,
                "error": t.error,
                "started_at": t.started_at.isoformat(),
                "completed_at": t.completed_at.isoformat() if t.completed_at else None,
                "duration_s": (
                    (t.completed_at - t.started_at).total_seconds() if t.completed_at else None
                ),
            }
            for t in tools
        ],
    }


@router.get("/runs/{run_id}/events")
async def get_run_events(run_id: str, limit: int = Query(500, le=2000)):
    async with get_session() as session:
        rows = (
            await session.execute(
                select(AgentEvent)
                .where(AgentEvent.run_id == run_id)
                .order_by(AgentEvent.created_at.asc())
                .limit(limit)
            )
        ).scalars().all()

    return [
        {
            "event_id": r.event_id,
            "event_type": r.event_type,
            "subagent_run_id": r.subagent_run_id,
            "payload": r.payload,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


# ── Memory ─────────────────────────────────────────────────────────────────────

@router.get("/memory/stats")
async def memory_stats():
    async with get_session() as session:
        by_tier = (
            await session.execute(
                select(ClaimORM.tier, ClaimORM.status, func.count().label("n"))
                .group_by(ClaimORM.tier, ClaimORM.status)
            )
        ).all()

        by_class = (
            await session.execute(
                select(ClaimORM.memory_class, func.count().label("n"))
                .where(ClaimORM.status == "active")
                .group_by(ClaimORM.memory_class)
            )
        ).all()

        avg_confidence = (
            await session.execute(
                select(func.avg(ClaimORM.confidence))
                .where(ClaimORM.status == "active")
            )
        ).scalar_one()

        total_sources = (
            await session.execute(
                select(SourceORM.source_type, func.count().label("n"))
                .group_by(SourceORM.source_type)
            )
        ).all()

    return {
        "by_tier_status": [
            {"tier": r.tier, "status": r.status, "count": r.n}
            for r in by_tier
        ],
        "by_class": [{"class": r.memory_class, "count": r.n} for r in by_class],
        "avg_confidence": float(avg_confidence) if avg_confidence else 0.0,
        "sources_by_type": [{"type": r.source_type, "count": r.n} for r in total_sources],
    }


@router.get("/memory/claims")
async def list_claims(
    tier: Optional[str] = Query(None),
    status: str = Query("active"),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
):
    async with get_session() as session:
        q = (
            select(ClaimORM)
            .where(ClaimORM.status == status)
            .order_by(ClaimORM.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        if tier:
            q = q.where(ClaimORM.tier == tier)
        rows = (await session.execute(q)).scalars().all()

    return [
        {
            "claim_id": str(r.claim_id),
            "claim_text": r.claim_text,
            "tier": r.tier,
            "memory_class": r.memory_class,
            "segment": r.segment,
            "status": r.status,
            "confidence": r.confidence,
            "trust_score": r.trust_score,
            "access_count": r.access_count,
            "user_confirmed": r.user_confirmed,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


# ── Maintenance ────────────────────────────────────────────────────────────────

@router.get("/maintenance")
async def maintenance_history(limit: int = Query(20, le=100)):
    from sqlalchemy import desc
    async with get_session() as session:
        rows = (
            await session.execute(
                select(MaintenanceRunORM)
                .order_by(desc(MaintenanceRunORM.started_at))
                .limit(limit)
            )
        ).scalars().all()

    return [
        {
            "run_id": str(r.run_id),
            "run_type": r.run_type,
            "status": r.status,
            "claims_reviewed": r.claims_reviewed,
            "claims_updated": r.claims_updated,
            "claims_archived": r.claims_archived,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "finished_at": r.finished_at.isoformat() if r.finished_at else None,
        }
        for r in rows
    ]
