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
    ArtifactORM, ClaimORM, EntityORM, EvidenceORM, SourceORM,
    FeedbackEventORM, RetrievalLogORM,
)
from models.memory import (
    ArtifactSchema, ClaimSchema, ContextPackage, EntitySchema, ForgetRequest,
    GraphExpandRequest, GraphExpandResult, GmailSyncResult,
    ComposioProfileResult, IngestChatRequest, IngestComposioAeroLeadsRequest,
    IngestComposioLinkedInRequest, IngestDocumentResult, IngestProfileRequest,
    IngestProfileResult, MemorySearchRequest, MemorySearchResult,
    DocumentFactSearchRequest, DocumentFactResult, SourceSchema, SourceType,
    StoreClaimRequest, TimelineRequest,
    UpdateClaimRequest,
)
from memory.retrieval.context_assembler import ContextAssembler
from memory.retrieval.hybrid import HybridRetriever
from memory.retrieval.query_planner import QueryPlanner

logger = get_logger(__name__)


def _source_schema(source: SourceORM) -> SourceSchema:
    return SourceSchema(
        source_id=source.source_id,
        source_type=SourceType(source.source_type),
        external_id=source.external_id,
        title=source.title,
        author=source.author,
        trust_level=source.trust_level,
        raw_uri=source.raw_uri,
        checksum=source.checksum,
        created_at=source.created_at,
        ingested_at=source.ingested_at,
        metadata=source.metadata_ or {},
    )


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

    async def search_document_facts(self, req: DocumentFactSearchRequest) -> list[DocumentFactResult]:
        from memory.ingestion.extractor import Extractor
        query_emb = Extractor().embed_one(req.query)

        hits = get_opensearch().hybrid_search(IDX_ARTIFACTS, req.query, query_emb, k=req.top_k * 3)
        artifact_ids = [uuid.UUID(h["_id"]) for h in hits if h.get("_id")]
        score_map = {h["_id"]: float(h.get("_rrf_score", h.get("_score", 0.0))) for h in hits}
        allowed_types = {st.value for st in req.source_types} if req.source_types else None

        async with get_session() as session:
            if not artifact_ids:
                return []

            result = await session.execute(
                select(ArtifactORM, SourceORM)
                .join(SourceORM, ArtifactORM.source_id == SourceORM.source_id)
                .where(ArtifactORM.artifact_id.in_(artifact_ids))
            )
            rows = list(result.all())

            artifacts = []
            for artifact, source in rows:
                if allowed_types and source.source_type not in allowed_types:
                    continue
                artifacts.append((artifact, source))

            artifacts.sort(key=lambda row: score_map.get(str(row[0].artifact_id), 0.0), reverse=True)
            artifacts = artifacts[: req.top_k]

            claims_by_artifact: dict[uuid.UUID, list[ClaimORM]] = {}
            if req.include_claims and artifacts:
                selected_ids = [artifact.artifact_id for artifact, _ in artifacts]
                claim_result = await session.execute(
                    select(EvidenceORM.artifact_id, ClaimORM)
                    .join(ClaimORM, EvidenceORM.claim_id == ClaimORM.claim_id)
                    .where(
                        EvidenceORM.artifact_id.in_(selected_ids),
                        ClaimORM.status.in_([ClaimStatus.ACTIVE.value, ClaimStatus.PROVISIONAL.value]),
                    )
                )
                for artifact_id, claim in claim_result.all():
                    if artifact_id is not None:
                        claims_by_artifact.setdefault(artifact_id, []).append(claim)

            return [
                DocumentFactResult(
                    artifact=ArtifactSchema.model_validate(artifact),
                    source=_source_schema(source),
                    score=round(score_map.get(str(artifact.artifact_id), 0.0), 4),
                    related_claims=[ClaimSchema.model_validate(claim) for claim in claims_by_artifact.get(artifact.artifact_id, [])],
                )
                for artifact, source in artifacts
            ]

    # ── Ingestion ──────────────────────────────────────────────────────────────

    async def ingest_chat(self, req: IngestChatRequest) -> dict:
        return await self._chat_pipe.process(req)

    async def ingest_document(self, data: bytes, filename: str,
                               mimetype: str = "application/octet-stream",
                               trust_level: int = 7,
                               source_type: SourceType | None = None,
                               title: str | None = None,
                               external_id: str | None = None,
                               raw_uri: str | None = None) -> IngestDocumentResult:
        return await self._doc_pipe.ingest_bytes(
            data,
            filename,
            mimetype,
            title=title,
            trust_level=trust_level,
            source_type_override=source_type,
            external_id=external_id,
            raw_uri=raw_uri,
            metadata={"ingestion_flow": "document"},
        )

    async def ingest_profile(self, req: IngestProfileRequest) -> IngestProfileResult:
        sources = list(req.sources)
        if req.linkedin_text:
            from models.memory import ProfileTextSource
            sources.append(ProfileTextSource(
                text=req.linkedin_text,
                source_type=SourceType.LINKEDIN_PROFILE,
                title="LinkedIn profile",
                trust_level=req.default_trust_level,
            ))
        if req.google_profile_text:
            from models.memory import ProfileTextSource
            sources.append(ProfileTextSource(
                text=req.google_profile_text,
                source_type=SourceType.GOOGLE_PROFILE,
                title="Google profile",
                trust_level=req.default_trust_level,
            ))
        if req.notes:
            from models.memory import ProfileTextSource
            sources.append(ProfileTextSource(
                text=req.notes,
                source_type=SourceType.PROFILE_DOCUMENT,
                title="Profile notes",
                trust_level=req.default_trust_level,
            ))

        documents: list[IngestDocumentResult] = []
        for source in sources:
            if not source.text.strip():
                continue
            result = await self._doc_pipe.ingest_text(
                source.text,
                title=source.title or source.source_type.value.replace("_", " ").title(),
                source_type=source.source_type,
                external_id=source.external_id,
                author=source.author,
                trust_level=source.trust_level,
                metadata={**source.metadata, "ingestion_flow": "profile"},
            )
            documents.append(result)

        return IngestProfileResult(sources_ingested=len(documents), documents=documents)

    async def ingest_composio_linkedin_self(
        self,
        req: IngestComposioLinkedInRequest,
    ) -> ComposioProfileResult:
        from core.clients.composio import get_composio_tools, invoke_tool_with_fallbacks, select_tool, stringify_tool_result

        tools = await get_composio_tools(["linkedin"])
        tool = select_tool(
            tools,
            required_terms=["info"],
            preferred_terms=["my", "profile", "linkedin"],
        )
        result = await invoke_tool_with_fallbacks(tool, [{}, {"input": "Get my LinkedIn profile information"}])
        raw_text = stringify_tool_result(result)
        ingestion = None
        if req.ingest:
            ingestion = await self._doc_pipe.ingest_text(
                raw_text,
                title="LinkedIn profile via Composio",
                source_type=SourceType.LINKEDIN_PROFILE,
                external_id="composio:linkedin:me",
                trust_level=req.trust_level,
                metadata={"ingestion_flow": "composio", "toolkit": "linkedin", "tool": getattr(tool, "name", "unknown")},
            )
        return ComposioProfileResult(
            toolkit="linkedin",
            tool_name=getattr(tool, "name", "unknown"),
            source_type=SourceType.LINKEDIN_PROFILE,
            raw_text=raw_text,
            ingestion=ingestion,
        )

    async def ingest_composio_aeroleads_linkedin(
        self,
        req: IngestComposioAeroLeadsRequest,
    ) -> ComposioProfileResult:
        from core.clients.composio import get_composio_tools, invoke_tool_with_fallbacks, select_tool, stringify_tool_result

        tools = await get_composio_tools(["aeroleads"])
        tool = select_tool(
            tools,
            required_terms=["linkedin"],
            preferred_terms=["details", "profile", "url", "prospect"],
        )
        result = await invoke_tool_with_fallbacks(
            tool,
            [
                {"linkedin_profile_url": req.linkedin_url},
                {"linkedin_url": req.linkedin_url},
                {"url": req.linkedin_url},
                {"profile_url": req.linkedin_url},
                {"input": req.linkedin_url},
            ],
        )
        raw_text = stringify_tool_result(result)
        ingestion = None
        if req.ingest:
            ingestion = await self._doc_pipe.ingest_text(
                raw_text,
                title="AeroLeads LinkedIn enrichment via Composio",
                source_type=SourceType.LINKEDIN_PROFILE,
                external_id=req.linkedin_url,
                trust_level=req.trust_level,
                metadata={"ingestion_flow": "composio", "toolkit": "aeroleads", "tool": getattr(tool, "name", "unknown")},
            )
        return ComposioProfileResult(
            toolkit="aeroleads",
            tool_name=getattr(tool, "name", "unknown"),
            source_type=SourceType.LINKEDIN_PROFILE,
            raw_text=raw_text,
            ingestion=ingestion,
        )

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
