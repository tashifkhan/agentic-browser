"""MemoryService: top-level orchestrator for all memory operations."""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select, update, or_

from core.config import get_logger
from core.clients.neo4j import get_neo4j
from core.clients.opensearch import get_opensearch, IDX_CLAIMS, IDX_ARTIFACTS, IDX_ENTITIES
from core.db import get_session
from memory.graph.traversal import GraphTraversal
from memory.ingestion.chat import ChatIngestionPipeline
from memory.ingestion.document import DocumentIngestionPipeline
from memory.ingestion.gmail import GmailIngestionPipeline
from memory.maintenance.consolidation import ConsolidationRunner
from models.memory import ClaimStatus
from models.db.memory import (
    ArtifactORM, ClaimORM, EntityORM, EvidenceORM,
    FeedbackEventORM, RetrievalLogORM,
)
from models.memory import (
    ClaimSchema, ContextPackage, EntitySchema, ForgetRequest,
    GraphExpandRequest, GraphExpandResult, GmailSyncResult,
    IngestChatRequest, IngestDocumentResult, MemorySearchRequest,
    MemorySearchResult, StoreClaimRequest, TimelineRequest,
    UpdateClaimRequest,
)
from memory.retrieval.context_assembler import ContextAssembler
from memory.retrieval.hybrid import HybridRetriever
from memory.retrieval.query_planner import QueryPlanner

logger = get_logger(__name__)


class MemoryService:
    def __init__(self) -> None:
        self._retriever   = HybridRetriever()
        self._assembler   = ContextAssembler()
        self._planner     = QueryPlanner()
        self._traversal   = GraphTraversal()
        self._consolidation = ConsolidationRunner()
        self._chat_pipe   = ChatIngestionPipeline()
        self._doc_pipe    = DocumentIngestionPipeline()

    # ── Retrieval ──────────────────────────────────────────────────────────────

    async def search(self, request: MemorySearchRequest) -> list[MemorySearchResult]:
        return await self._retriever.search(request)

    async def get_context(self, query: str, token_budget: int = 3000) -> ContextPackage:
        plan = self._planner.plan(query)
        req = MemorySearchRequest(query=query, top_k=15)
        results = await self._retriever.search(req, log_query=True)

        # graph context for entity-rich queries
        graph_context: list[dict[str, Any]] = []
        if plan.needs_graph_traversal and plan.entity_mentions:
            from memory.graph.traversal import GraphTraversal
            gt = GraphTraversal()
            gr = await gt.local_expand(plan.entity_mentions)
            graph_context = [{"claim_text": c.claim_text, "segment": c.segment}
                             for c in gr.claims]

        assembler = ContextAssembler(total_token_budget=token_budget)
        return await assembler.assemble(query, plan, results, graph_context=graph_context)

    async def explain(self, claim_id: str) -> dict[str, Any]:
        cid = uuid.UUID(claim_id)
        async with get_session() as session:
            result = await session.execute(
                select(ClaimORM).where(ClaimORM.claim_id == cid)
            )
            claim = result.scalar_one_or_none()
            if not claim:
                return {"error": "Claim not found"}

            # Load evidence
            ev_result = await session.execute(
                select(EvidenceORM).where(EvidenceORM.claim_id == cid).limit(10)
            )
            evidence = ev_result.scalars().all()

        return {
            "claim": ClaimSchema.model_validate(claim).model_dump(),
            "evidence": [
                {
                    "evidence_type": e.evidence_type,
                    "confidence": e.confidence,
                    "source_id": str(e.source_id),
                }
                for e in evidence
            ],
        }

    # ── Write ──────────────────────────────────────────────────────────────────

    async def store_claim(self, req: StoreClaimRequest) -> ClaimSchema:
        from memory.ingestion.extractor import Extractor, EXTRACTOR_VERSION
        from models.memory import SEGMENT_DECAY_RATE
        from models.db.memory import SourceORM
        from models.memory import SourceType

        ext = Extractor()
        async with get_session() as session:
            # synthetic source for manual claims
            source = SourceORM(
                source_id=uuid.uuid4(),
                source_type=SourceType.MANUAL.value,
                title="Manual claim",
                trust_level=10,
            )
            session.add(source)
            await session.flush()

            claim = ClaimORM(
                claim_id=uuid.uuid4(),
                claim_text=req.claim_text,
                predicate=req.predicate,
                object_literal=req.object_literal,
                memory_class=req.memory_class.value,
                tier=req.tier.value,
                segment=req.segment.value,
                status=ClaimStatus.ACTIVE.value,
                base_importance=req.base_importance,
                confidence=req.confidence,
                trust_score=1.0,
                decay_rate=SEGMENT_DECAY_RATE.get(req.segment, 0.01),
                user_confirmed=req.user_confirmed,
            )
            session.add(claim)
            await session.flush()

            emb = ext.embed_one(req.claim_text)
            os_id = get_opensearch().index_claim(
                str(claim.claim_id), req.claim_text, emb,
                req.segment.value, req.memory_class.value, req.tier.value,
                ClaimStatus.ACTIVE.value, req.confidence, req.base_importance, 1.0,
                predicate=req.predicate or "",
                user_confirmed=req.user_confirmed,
            )
            claim.opensearch_id = os_id

            neo4j = get_neo4j()
            await neo4j.upsert_claim_node(
                str(claim.claim_id), req.claim_text,
                predicate=req.predicate or "", segment=req.segment.value,
                confidence=req.confidence,
            )

            return ClaimSchema.model_validate(claim)

    async def update_claim(self, claim_id: str, req: UpdateClaimRequest) -> ClaimSchema:
        cid = uuid.UUID(claim_id)
        updates: dict[str, Any] = {}
        if req.claim_text     is not None: updates["claim_text"]      = req.claim_text
        if req.status         is not None: updates["status"]          = req.status.value
        if req.confidence     is not None: updates["confidence"]      = req.confidence
        if req.base_importance is not None: updates["base_importance"] = req.base_importance
        if req.tier           is not None: updates["tier"]            = req.tier.value
        if req.user_confirmed is not None: updates["user_confirmed"]  = req.user_confirmed
        if req.valid_to       is not None: updates["valid_to"]        = req.valid_to

        async with get_session() as session:
            await session.execute(
                update(ClaimORM).where(ClaimORM.claim_id == cid).values(**updates)
            )
            result = await session.execute(select(ClaimORM).where(ClaimORM.claim_id == cid))
            claim = result.scalar_one_or_none()
            if not claim:
                raise ValueError(f"Claim {claim_id} not found")

            # sync to opensearch
            try:
                get_opensearch().update_document(IDX_CLAIMS, claim_id, updates)
            except Exception:
                pass

            return ClaimSchema.model_validate(claim)

    async def confirm_claim(self, claim_id: str) -> ClaimSchema:
        return await self.update_claim(claim_id, UpdateClaimRequest(
            user_confirmed=True,
            status=ClaimStatus.ACTIVE,
        ))

    async def forget(self, req: ForgetRequest) -> dict:
        deleted_claims = 0
        deleted_entities = 0

        async with get_session() as session:
            # pattern-based claim deletion
            if req.pattern:
                result = await session.execute(
                    select(ClaimORM)
                    .where(ClaimORM.claim_text.ilike(f"%{req.pattern}%"))
                    .limit(100)
                )
                for claim in result.scalars().all():
                    claim.status = ClaimStatus.DELETED.value
                    try:
                        get_opensearch().update_document(IDX_CLAIMS, str(claim.claim_id), {"status": "deleted"})
                    except Exception:
                        pass
                    deleted_claims += 1

            # explicit claim IDs
            if req.claim_ids:
                result = await session.execute(
                    select(ClaimORM).where(ClaimORM.claim_id.in_(req.claim_ids))
                )
                for claim in result.scalars().all():
                    claim.status = ClaimStatus.DELETED.value
                    try:
                        get_opensearch().delete_document(IDX_CLAIMS, str(claim.claim_id))
                    except Exception:
                        pass
                    neo4j = get_neo4j()
                    await neo4j.delete_claim_node(str(claim.claim_id))
                    deleted_claims += 1

            # explicit entity IDs
            if req.entity_ids:
                result = await session.execute(
                    select(EntityORM).where(EntityORM.entity_id.in_(req.entity_ids))
                )
                for entity in result.scalars().all():
                    entity.status = "deleted"
                    try:
                        get_opensearch().delete_document(IDX_ENTITIES, str(entity.entity_id))
                    except Exception:
                        pass
                    neo4j = get_neo4j()
                    await neo4j.delete_entity(str(entity.entity_id))
                    deleted_entities += 1

        return {"deleted_claims": deleted_claims, "deleted_entities": deleted_entities}

    # ── Graph ──────────────────────────────────────────────────────────────────

    async def graph_expand(self, req: GraphExpandRequest) -> GraphExpandResult:
        entity_names: list[str] = []
        if req.entity_name:
            entity_names.append(req.entity_name)
        elif req.entity_id:
            async with get_session() as session:
                result = await session.execute(
                    select(EntityORM).where(EntityORM.entity_id == req.entity_id)
                )
                entity = result.scalar_one_or_none()
                if entity:
                    entity_names.append(entity.canonical_name)

        return await self._traversal.local_expand(
            entity_names, hops=req.hops, edge_types=req.edge_types, limit=req.limit
        )

    async def get_timeline(self, req: TimelineRequest) -> list[ClaimSchema]:
        return await self._traversal.timeline(
            entity_name=req.entity_name,
            topic=req.topic,
            start=req.start,
            end=req.end,
            limit=req.limit,
        )

    async def get_profile_summary(self) -> str:
        return await self._traversal.get_profile_summary()

    # ── Ingestion ──────────────────────────────────────────────────────────────

    async def ingest_chat(self, req: IngestChatRequest) -> dict:
        return await self._chat_pipe.process(req)

    async def ingest_document(self, data: bytes, filename: str,
                               mimetype: str = "application/octet-stream",
                               trust_level: int = 7) -> IngestDocumentResult:
        return await self._doc_pipe.ingest_bytes(data, filename, mimetype, trust_level=trust_level)

    async def ingest_gmail(self, credentials_json: dict, user_email: str,
                           max_threads: int = 50) -> GmailSyncResult:
        pipeline = GmailIngestionPipeline(user_email=user_email)
        return await pipeline.sync(credentials_json, max_threads=max_threads)

    # ── Feedback ───────────────────────────────────────────────────────────────

    async def record_feedback(self, claim_id: str, kind: str,
                               comment: Optional[str] = None) -> None:
        from models.memory import FeedbackKind
        async with get_session() as session:
            fb = FeedbackEventORM(
                feedback_id=uuid.uuid4(),
                kind=kind,
                claim_id=uuid.UUID(claim_id) if claim_id else None,
                comment=comment,
            )
            session.add(fb)

            # apply trust penalties/boosts
            if claim_id:
                cid = uuid.UUID(claim_id)
                if kind in (FeedbackKind.THUMBS_UP.value, FeedbackKind.CONFIRMED.value):
                    await session.execute(
                        update(ClaimORM)
                        .where(ClaimORM.claim_id == cid)
                        .values(
                            retrieval_hit_count=ClaimORM.retrieval_hit_count + 1,
                            confidence=ClaimORM.confidence * 1.05,
                        )
                    )
                elif kind == FeedbackKind.EXPLICIT_CORRECTION.value:
                    await session.execute(
                        update(ClaimORM)
                        .where(ClaimORM.claim_id == cid)
                        .values(
                            trust_score=ClaimORM.trust_score * 0.7,
                            confidence=ClaimORM.confidence * 0.6,
                        )
                    )

    async def mark_retrieval_used(self, claim_ids: list[str]) -> None:
        cids = [uuid.UUID(c) for c in claim_ids]
        async with get_session() as session:
            await session.execute(
                update(ClaimORM)
                .where(ClaimORM.claim_id.in_(cids))
                .values(retrieval_hit_count=ClaimORM.retrieval_hit_count + 1)
            )

    # ── Maintenance ────────────────────────────────────────────────────────────

    async def run_maintenance(self, run_type: str = "nightly") -> dict:
        if run_type == "micro_reflection":
            return await self._consolidation.micro_reflection([])
        if run_type == "hourly":
            return await self._consolidation.hourly()
        if run_type == "nightly":
            return await self._consolidation.nightly()
        if run_type == "weekly":
            return await self._consolidation.weekly()
        raise ValueError(f"Unknown run_type: {run_type}")
