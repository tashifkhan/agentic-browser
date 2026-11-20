"""MemoryService: top-level orchestrator for all memory operations."""
from __future__ import annotations
import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import delete, func, select, update, or_

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
    ClaimRelationORM, MaintenanceRunORM,
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
        """Memory block for one agent turn.

        Plans once and loads preferences and profile alongside the search; the
        assembler packs by priority and removes repeats.
        """
        plan, procedural, profile = await asyncio.gather(
            self._planner.aplan(query),
            self._traversal.get_procedural_memories(),
            self._traversal.get_profile_claims(),
        )
        # No pre-exclusion: the assembler packs the question's facts first and
        # drops repeats from the always-on sections, so a fact is never lost
        # because a section that didn't fit claimed it.
        req = MemorySearchRequest(query=query, top_k=8)
        results = await self._retriever.search(req, log_query=True, plan=plan)

        graph_context: list[dict[str, Any]] = []
        if plan.needs_graph_traversal and plan.entity_mentions:
            seen = {str(r.claim.claim_id) for r in results}
            gr = await self._traversal.local_expand(plan.entity_mentions, limit=10)
            graph_context = [
                {"claim_id": str(c.claim_id), "claim_text": c.claim_text, "segment": c.segment}
                for c in gr.claims if str(c.claim_id) not in seen
            ]

        assembler = ContextAssembler(total_token_budget=token_budget)
        return await assembler.assemble(query, plan, results, graph_context=graph_context,
                                        procedural=procedural, profile_claims=profile)

    async def clear_all(self) -> dict[str, Any]:
        """Clear durable memory from Postgres, OpenSearch, and Neo4j."""
        postgres_counts: dict[str, int] = {}
        async with get_session() as session:
            for name, table in (
                ("feedback_events", FeedbackEventORM),
                ("retrieval_log", RetrievalLogORM),
                ("claim_relations", ClaimRelationORM),
                ("evidence", EvidenceORM),
                ("claims", ClaimORM),
                ("entities", EntityORM),
                ("artifacts", ArtifactORM),
                ("sources", SourceORM),
                ("maintenance_runs", MaintenanceRunORM),
            ):
                result = await session.execute(delete(table))
                postgres_counts[name] = int(result.rowcount or 0)

        warnings: list[str] = []
        opensearch_counts: dict[str, int] = {}
        try:
            os_client = get_opensearch()
            if not getattr(os_client, "_client", None):
                os_client.connect()
            opensearch_counts = os_client.clear_memory_indices()
        except Exception as exc:
            warnings.append(f"OpenSearch clear skipped: {exc}")

        neo4j_deleted = 0
        try:
            neo4j = get_neo4j()
            if not getattr(neo4j, "_driver", None):
                await neo4j.connect()
            neo4j_deleted = await neo4j.clear_memory_graph()
        except Exception as exc:
            warnings.append(f"Neo4j clear skipped: {exc}")

        return {
            "status": "ok" if not warnings else "partial",
            "postgres": postgres_counts,
            "opensearch": opensearch_counts,
            "neo4j": {"nodes_deleted": neo4j_deleted},
            "warnings": warnings,
        }

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
        """Store a claim given directly (write_memory tool, API, console).

        Goes through the same reconcile step as chat ingestion, so a fact the
        agent already saved with write_memory is reinforced, not duplicated,
        when post-turn ingestion extracts it again.
        """
        from memory.ingestion.extractor import Extractor
        from memory.ingestion.memory_gate import GateDecision, GateResult
        from memory.ingestion.reconcile import WRITE_LOCK
        from models.memory import CandidateClaim, EvidenceType

        cand = CandidateClaim(
            claim_text=req.claim_text.strip(),
            predicate=req.predicate or "IS",
            subject_name="User",
            object_name=req.object_literal,
            memory_class=req.memory_class,
            segment=req.segment,
            confidence=req.confidence,
            base_importance=req.base_importance,
            evidence_type=EvidenceType.USER_CONFIRMED if req.user_confirmed else EvidenceType.EXTRACTED,
        )
        gate = GateResult(GateDecision.STORE_AUTO, "stored directly",
                          min(req.confidence, 1.0), min(req.base_importance, 1.0))
        emb = await Extractor().embed_one(cand.claim_text)
        async with WRITE_LOCK:
            return await self._store_reconciled(req, cand, gate, emb)

    async def _store_reconciled(self, req, cand, gate, emb) -> ClaimSchema:
        from memory.ingestion.reconcile import Reconciler
        from memory.ingestion.writer import ClaimInput, SideEffects, upsert_entity, write_claims
        from models.memory import CandidateEntity, EntityType

        decision = (await Reconciler().plan([cand], [emb]))[0]

        effects = SideEffects()
        async with get_session() as session:
            source = SourceORM(
                source_id=uuid.uuid4(),
                source_type=SourceType.MANUAL.value,
                title="Manual claim",
                trust_level=10,
            )
            session.add(source)
            await session.flush()
            # Manual and tool-written facts are about the user, like chat facts.
            user_id = await upsert_entity(
                session,
                CandidateEntity(canonical_name="User", entity_type=EntityType.PERSON,
                                description="The person using the assistant", aliases=[]),
                effects,
            )
            _stats, rows = await write_claims(
                session,
                [ClaimInput(cand=cand, gate=gate, embedding=emb, decision=decision,
                            tier=req.tier, user_confirmed=req.user_confirmed)],
                source_id=source.source_id, artifact_id=None, source_trust=1.0,
                entity_map={"user": user_id}, effects=effects,
            )
            claim = rows[0]
            await session.flush()
            await session.refresh(claim)
            schema = ClaimSchema.model_validate(claim)
        await effects.run()
        return schema

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
        """Delete claims and entities everywhere.

        Pattern and id deletion now behave the same: the Postgres row is marked
        deleted, the OpenSearch doc and the Neo4j node are removed. (Pattern
        deletion used to leave the claim in the graph, so graph expansion could
        still surface it.) LIKE wildcards in the pattern are escaped.
        """
        claims: dict[uuid.UUID, ClaimORM] = {}
        entities: list[EntityORM] = []
        async with get_session() as session:
            if req.pattern:
                escaped = req.pattern.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                result = await session.execute(
                    select(ClaimORM)
                    .where(ClaimORM.claim_text.ilike(f"%{escaped}%", escape="\\"),
                           ClaimORM.status != ClaimStatus.DELETED.value)
                    .limit(100)
                )
                claims.update({c.claim_id: c for c in result.scalars().all()})
            if req.claim_ids:
                result = await session.execute(select(ClaimORM).where(ClaimORM.claim_id.in_(req.claim_ids)))
                claims.update({c.claim_id: c for c in result.scalars().all()})
            if req.source_ids:
                result = await session.execute(
                    select(ClaimORM).join(EvidenceORM, EvidenceORM.claim_id == ClaimORM.claim_id)
                    .where(EvidenceORM.source_id.in_(req.source_ids), ClaimORM.status != ClaimStatus.DELETED.value)
                )
                claims.update({c.claim_id: c for c in result.scalars().all()})
            for claim in claims.values():
                claim.status = ClaimStatus.DELETED.value

            # The chat turns a forgotten fact came from still hold its words,
            # and document-fact search would surface them. Redact those turns.
            redacted: list[str] = []
            if claims:
                turn_ids = (await session.execute(
                    select(ArtifactORM.artifact_id)
                    .join(EvidenceORM, EvidenceORM.artifact_id == ArtifactORM.artifact_id)
                    .where(EvidenceORM.claim_id.in_(list(claims)), ArtifactORM.artifact_type == "chat_turn")
                )).scalars().all()
                if req.source_ids:
                    turn_ids = list(turn_ids) + list((await session.execute(
                        select(ArtifactORM.artifact_id).where(ArtifactORM.source_id.in_(req.source_ids))
                    )).scalars().all())
                for aid in set(turn_ids):
                    art = await session.get(ArtifactORM, aid)
                    if art is not None:
                        art.text = "[forgotten]"
                        redacted.append(str(aid))
            if req.entity_ids:
                result = await session.execute(select(EntityORM).where(EntityORM.entity_id.in_(req.entity_ids)))
                entities = list(result.scalars().all())
                for entity in entities:
                    entity.status = "deleted"

        os_client = get_opensearch()
        neo4j = get_neo4j()
        for aid in redacted:
            await asyncio.to_thread(os_client.delete_document, IDX_ARTIFACTS, aid)
        for cid in [str(c) for c in claims]:
            await asyncio.to_thread(os_client.delete_document, IDX_CLAIMS, cid)
            try:
                await neo4j.delete_claim_node(cid)
            except Exception as exc:
                logger.warning("Neo4j delete for claim %s failed: %s", cid, exc)
        for entity in entities:
            eid = str(entity.entity_id)
            await asyncio.to_thread(os_client.delete_document, IDX_ENTITIES, eid)
            try:
                await neo4j.delete_entity(eid)
            except Exception as exc:
                logger.warning("Neo4j delete for entity %s failed: %s", eid, exc)

        return {"deleted_claims": len(claims), "deleted_entities": len(entities), "redacted_artifacts": len(redacted)}

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
        from memory import embeddings
        query_emb = await embeddings.embed_query(req.query)

        hits = await asyncio.to_thread(
            get_opensearch().hybrid_search, IDX_ARTIFACTS, req.query, query_emb, req.top_k * 3,
        )
        artifact_ids = [uuid.UUID(h["_id"]) for h in hits if h.get("_id")]
        score_map = {h["_id"]: float(h.get("_rrf_score", h.get("_score", 0.0))) for h in hits}
        allowed_types = {st.value for st in req.source_types} if req.source_types else None
        # Chat turns are already covered by extracted claims (which respect
        # forget and supersede); by default this searches documents only.
        excluded_types = set() if allowed_types else {SourceType.CHAT.value}

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
                if source.source_type in excluded_types:
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
                            confidence=func.least(ClaimORM.confidence * 1.05, 1.0),
                        )
                    )
                elif kind == FeedbackKind.THUMBS_DOWN.value:
                    await session.execute(
                        update(ClaimORM)
                        .where(ClaimORM.claim_id == cid)
                        .values(
                            trust_score=ClaimORM.trust_score * 0.9,
                            confidence=ClaimORM.confidence * 0.85,
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

        # Keep the search index's copy of the scores in step with Postgres.
        if claim_id:
            async with get_session() as session:
                row = await session.get(ClaimORM, uuid.UUID(claim_id))
                fields = {"confidence": row.confidence, "trust_score": row.trust_score} if row else None
            if fields:
                try:
                    await asyncio.to_thread(get_opensearch().update_document, IDX_CLAIMS, claim_id, fields)
                except Exception as exc:
                    logger.debug("Feedback index sync failed: %s", exc)

    async def mark_retrieval_used(self, claim_ids: list[str]) -> None:
        """Record that these memories were used in an answer.

        This is the usage signal promotion and decay read: retrieval_hit_count
        goes up and last_accessed_at moves to now. Retrieval alone only bumps
        access_count.
        """
        cids = []
        for c in claim_ids:
            try:
                cids.append(uuid.UUID(str(c)))
            except ValueError:
                continue
        if not cids:
            return
        async with get_session() as session:
            await session.execute(
                update(ClaimORM)
                .where(ClaimORM.claim_id.in_(cids))
                .values(retrieval_hit_count=ClaimORM.retrieval_hit_count + 1,
                        last_accessed_at=func.now())
            )

    # ── Maintenance ────────────────────────────────────────────────────────────

    async def run_maintenance(self, run_type: str = "nightly") -> dict:
        if run_type == "micro_reflection":
            return await self._consolidation.micro_reflection()
        if run_type == "hourly":
            return await self._consolidation.hourly()
        if run_type == "nightly":
            return await self._consolidation.nightly()
        if run_type == "weekly":
            return await self._consolidation.weekly()
        raise ValueError(f"Unknown run_type: {run_type}")
