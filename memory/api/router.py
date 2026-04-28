"""Memory system FastAPI router — all tool endpoints."""
from __future__ import annotations
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from models.memory import (
    ContextPackage, ForgetRequest, GraphExpandRequest, GraphExpandResult,
    DocumentFactSearchRequest, DocumentFactResult, IngestChatRequest,
    IngestComposioAeroLeadsRequest, IngestComposioLinkedInRequest,
    IngestProfileRequest, MemorySearchRequest, MemorySearchResult,
    SourceType, StoreClaimRequest, TimelineRequest, UpdateClaimRequest,
)
from memory.service import MemoryService

router = APIRouter(tags=["memory"])
_svc: Optional[MemoryService] = None


def get_service() -> MemoryService:
    global _svc
    if _svc is None:
        _svc = MemoryService()
    return _svc


# ── Search & retrieval ─────────────────────────────────────────────────────────

@router.post("/search", response_model=list[MemorySearchResult])
async def memory_search(req: MemorySearchRequest):
    """Hybrid vector + BM25 + graph search over all active memories."""
    try:
        return await get_service().search(req)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/context", response_model=ContextPackage)
async def get_context(body: dict):
    """
    Assemble a token-budgeted context package for a given query.
    Body: {"query": "...", "token_budget": 3000}
    """
    query = body.get("query", "")
    token_budget = int(body.get("token_budget", 3000))
    if not query:
        raise HTTPException(status_code=400, detail="query is required")
    try:
        return await get_service().get_context(query, token_budget=token_budget)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/documents/facts", response_model=list[DocumentFactResult])
async def document_facts(req: DocumentFactSearchRequest):
    """Retrieve source document snippets and extracted facts for profile/document questions."""
    try:
        return await get_service().search_document_facts(req)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/explain/{claim_id}")
async def explain_claim(claim_id: str):
    """Return full provenance for a claim: source, evidence, confidence history."""
    try:
        return await get_service().explain(claim_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/profile")
async def get_profile():
    """Return a compact profile summary from core_identity + skills claims."""
    try:
        summary = await get_service().get_profile_summary()
        return {"profile_summary": summary}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ── Write ──────────────────────────────────────────────────────────────────────

@router.post("/store")
async def store_claim(req: StoreClaimRequest):
    """Manually store a new claim into memory."""
    try:
        claim = await get_service().store_claim(req)
        return claim.model_dump()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.patch("/claims/{claim_id}")
async def update_claim(claim_id: str, req: UpdateClaimRequest):
    """Update fields on an existing claim."""
    try:
        claim = await get_service().update_claim(claim_id, req)
        return claim.model_dump()
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/confirm/{claim_id}")
async def confirm_claim(claim_id: str):
    """Mark a claim as user-confirmed and promote to active."""
    try:
        claim = await get_service().confirm_claim(claim_id)
        return claim.model_dump()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/forget")
async def forget(req: ForgetRequest):
    """Delete memories by claim ID, entity ID, or text pattern."""
    try:
        return await get_service().forget(req)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ── Feedback ───────────────────────────────────────────────────────────────────

@router.post("/feedback")
async def record_feedback(body: dict):
    """
    Record retrieval feedback.
    Body: {"claim_id": "uuid", "kind": "thumbs_up|thumbs_down|confirmed|explicit_correction", "comment": "..."}
    """
    claim_id = body.get("claim_id", "")
    kind     = body.get("kind", "thumbs_up")
    comment  = body.get("comment")
    try:
        await get_service().record_feedback(claim_id, kind, comment)
        return {"status": "recorded"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/mark-used")
async def mark_used(body: dict):
    """
    Mark a list of claim IDs as actually used in the final answer.
    Body: {"claim_ids": ["uuid1", "uuid2"]}
    """
    claim_ids = body.get("claim_ids", [])
    try:
        await get_service().mark_retrieval_used(claim_ids)
        return {"status": "ok"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ── Graph ──────────────────────────────────────────────────────────────────────

@router.post("/graph/expand", response_model=GraphExpandResult)
async def graph_expand(req: GraphExpandRequest):
    """Expand the local subgraph around an entity."""
    try:
        return await get_service().graph_expand(req)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/timeline")
async def get_timeline(req: TimelineRequest):
    """Fetch a chronological timeline of claims for an entity or topic."""
    try:
        claims = await get_service().get_timeline(req)
        return [c.model_dump() for c in claims]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ── Ingestion ──────────────────────────────────────────────────────────────────

@router.post("/ingest/chat")
async def ingest_chat(req: IngestChatRequest, background_tasks: BackgroundTasks):
    """Ingest a single user/assistant chat turn into memory."""
    background_tasks.add_task(_ingest_chat_bg, req)
    return {"status": "queued"}


async def _ingest_chat_bg(req: IngestChatRequest) -> None:
    try:
        await get_service().ingest_chat(req)
    except Exception as exc:
        from core.config import get_logger
        get_logger(__name__).error("Chat ingestion background task failed: %s", exc)


@router.post("/ingest/document")
async def ingest_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    trust_level: int = Form(default=7),
    source_type: str | None = Form(default=None),
    title: str | None = Form(default=None),
    external_id: str | None = Form(default=None),
):
    """Upload and ingest a document (PDF, DOCX, TXT) into memory."""
    data = await file.read()
    parsed_source_type = _parse_source_type(source_type)
    background_tasks.add_task(
        _ingest_doc_bg, data, file.filename or "upload",
        file.content_type or "application/octet-stream", trust_level,
        parsed_source_type, title, external_id,
    )
    return {"status": "queued", "filename": file.filename}


async def _ingest_doc_bg(data: bytes, filename: str,
                          mimetype: str, trust_level: int,
                          source_type: SourceType | None = None,
                          title: str | None = None,
                          external_id: str | None = None) -> None:
    try:
        result = await get_service().ingest_document(
            data,
            filename,
            mimetype,
            trust_level,
            source_type=source_type,
            title=title,
            external_id=external_id,
        )
        from core.config import get_logger
        get_logger(__name__).info("Document ingested: %s", result)
    except Exception as exc:
        from core.config import get_logger
        get_logger(__name__).error("Document ingestion failed: %s", exc)


@router.post("/ingest/profile")
async def ingest_profile(req: IngestProfileRequest, background_tasks: BackgroundTasks):
    """Ingest LinkedIn, Google profile, and other profile text into memory and the graph."""
    background_tasks.add_task(_ingest_profile_bg, req)
    return {"status": "queued", "sources": len(req.sources) + int(bool(req.linkedin_text)) + int(bool(req.google_profile_text)) + int(bool(req.notes))}


async def _ingest_profile_bg(req: IngestProfileRequest) -> None:
    try:
        result = await get_service().ingest_profile(req)
        from core.config import get_logger
        get_logger(__name__).info("Profile sources ingested: %s", result)
    except Exception as exc:
        from core.config import get_logger
        get_logger(__name__).error("Profile ingestion failed: %s", exc)


@router.post("/ingest/profile/document")
async def ingest_profile_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    source_type: str = Form(default=SourceType.PROFILE_DOCUMENT.value),
    trust_level: int = Form(default=8),
    title: str | None = Form(default=None),
    external_id: str | None = Form(default=None),
):
    """Upload a resume, LinkedIn export, Google export, or profile PDF into long-term memory."""
    parsed_source_type = _parse_source_type(source_type) or SourceType.PROFILE_DOCUMENT
    data = await file.read()
    background_tasks.add_task(
        _ingest_doc_bg,
        data,
        file.filename or "profile-upload",
        file.content_type or "application/octet-stream",
        trust_level,
        parsed_source_type,
        title,
        external_id,
    )
    return {"status": "queued", "filename": file.filename, "source_type": parsed_source_type.value}


@router.post("/ingest/profile/composio/linkedin/me")
async def ingest_composio_linkedin_me(req: IngestComposioLinkedInRequest):
    """Fetch authenticated LinkedIn profile through Composio and optionally ingest it."""
    try:
        return await get_service().ingest_composio_linkedin_self(req)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/ingest/profile/composio/aeroleads/linkedin")
async def ingest_composio_aeroleads_linkedin(req: IngestComposioAeroLeadsRequest):
    """Enrich a LinkedIn URL through Composio AeroLeads and optionally ingest it."""
    try:
        return await get_service().ingest_composio_aeroleads_linkedin(req)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


def _parse_source_type(value: str | None) -> SourceType | None:
    if not value:
        return None
    try:
        return SourceType(value)
    except ValueError:
        allowed = ", ".join(st.value for st in SourceType)
        raise HTTPException(status_code=400, detail=f"Invalid source_type '{value}'. Allowed: {allowed}")


@router.post("/ingest/gmail")
async def ingest_gmail(body: dict, background_tasks: BackgroundTasks):
    """
    Trigger Gmail sync.
    Body: {"credentials": {...oauth2 creds...}, "user_email": "...", "max_threads": 50}
    """
    credentials = body.get("credentials", {})
    user_email  = body.get("user_email", "")
    max_threads = int(body.get("max_threads", 50))
    if not user_email:
        raise HTTPException(status_code=400, detail="user_email is required")
    background_tasks.add_task(_ingest_gmail_bg, credentials, user_email, max_threads)
    return {"status": "queued"}


async def _ingest_gmail_bg(credentials: dict, user_email: str, max_threads: int) -> None:
    try:
        result = await get_service().ingest_gmail(credentials, user_email, max_threads)
        from core.config import get_logger
        get_logger(__name__).info("Gmail sync complete: %s", result)
    except Exception as exc:
        from core.config import get_logger
        get_logger(__name__).error("Gmail sync failed: %s", exc)


# ── Maintenance ────────────────────────────────────────────────────────────────

@router.post("/maintenance/run")
async def run_maintenance(background_tasks: BackgroundTasks, body: dict):
    """
    Trigger a maintenance run.
    Body: {"run_type": "micro_reflection|hourly|nightly|weekly"}
    """
    run_type = body.get("run_type", "nightly")
    if run_type not in ("micro_reflection", "hourly", "nightly", "weekly"):
        raise HTTPException(status_code=400, detail="Invalid run_type")
    background_tasks.add_task(_maintenance_bg, run_type)
    return {"status": "queued", "run_type": run_type}


async def _maintenance_bg(run_type: str) -> None:
    try:
        stats = await get_service().run_maintenance(run_type)
        from core.config import get_logger
        get_logger(__name__).info("Maintenance %s complete: %s", run_type, stats)
    except Exception as exc:
        from core.config import get_logger
        get_logger(__name__).error("Maintenance %s failed: %s", run_type, exc)


@router.get("/maintenance/history")
async def maintenance_history(limit: int = 20):
    """Return recent maintenance run history."""
    from sqlalchemy import select, desc
    from core.db import get_session
    from models.db.memory import MaintenanceRunORM
    async with get_session() as session:
        result = await session.execute(
            select(MaintenanceRunORM).order_by(desc(MaintenanceRunORM.started_at)).limit(limit)
        )
        runs = result.scalars().all()
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
        for r in runs
    ]
