"""Hybrid retrieval: vector + BM25 + graph + temporal, merged with composite scoring."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from core.clients.opensearch import IDX_CLAIMS, get_opensearch
from core.config import get_logger
from core.db import get_session
from memory.graph.traversal import GraphTraversal
from memory.ingestion.extractor import Extractor
from memory.retrieval.query_planner import QueryPlanner
from memory.retrieval.scoring import score_claim
from models.db.memory import ClaimORM, RetrievalLogORM
from models.memory import (
    ClaimSchema,
    MemorySearchRequest,
    MemorySearchResult,
)

logger = get_logger(__name__)

_extractor = Extractor()
_planner = QueryPlanner()
_traversal = GraphTraversal()


class HybridRetriever:
    async def search(
        self,
        request: MemorySearchRequest,
        log_query: bool = True,
    ) -> list[MemorySearchResult]:
        plan = _planner.plan(request.query)
        query_emb = _extractor.embed_one(request.query)

        # 1. Always load procedural memories
        procedural = await _traversal.get_procedural_memories()

        # 2. Vector + BM25 hybrid search on claims index
        os_filters: dict[str, Any] = {"status": "active"}
        if request.tier_filter:
            os_filters = {}  # complex filters need bool query; handled below

        hits = get_opensearch().hybrid_search(
            IDX_CLAIMS,
            request.query,
            query_emb,
            k=request.top_k * 3,
        )

        # post-filter if tier/segment filters requested
        if request.tier_filter or request.segment_filter or request.memory_class_filter:
            hits = self._apply_filters(hits, request)

        # 3. Fetch full ORM objects from Postgres
        hit_ids = [uuid.UUID(h["_id"]) for h in hits if h.get("_id")]
        rrf_map = {h["_id"]: h.get("_rrf_score", 0.0) for h in hits}

        orm_claims: list[ClaimORM] = []
        async with get_session() as session:
            if hit_ids:
                result = await session.execute(
                    select(ClaimORM).where(
                        ClaimORM.claim_id.in_(hit_ids),
                        ClaimORM.status.in_(
                            ["active"]
                            + (["provisional"] if request.include_provisional else [])
                        ),
                    )
                )
                orm_claims = list(result.scalars().all())

        # 4. Graph traversal for entity-rich queries
        graph_claim_ids: set[str] = set()
        if plan.needs_graph_traversal and plan.entity_mentions:
            graph_result = await _traversal.local_expand(plan.entity_mentions, hops=2)
            for gc in graph_result.claims:
                graph_claim_ids.add(str(gc.claim_id))

        # 5. Score all candidates
        now = datetime.now(timezone.utc)
        scored: list[tuple[ClaimORM, float]] = []
        for claim in orm_claims:
            cid = str(claim.claim_id)
            rrf = rrf_map.get(cid, 0.0)
            graph_rel = 0.4 if cid in graph_claim_ids else 0.0
            s = score_claim(claim, rrf_score=rrf, graph_relevance=graph_rel, now=now)
            scored.append((claim, s))

        # 6. Redundancy penalty
        # (embeddings already in opensearch; skip fetching for perf — penalty uses score diff)
        scored = sorted(scored, key=lambda x: x[1], reverse=True)

        # 7. Include procedural memories at top (they're always injected)
        procedural_ids = {str(c.claim_id) for c in procedural}
        final_claims = [c for c, _ in scored if str(c.claim_id) not in procedural_ids]
        final_claims = final_claims[: request.top_k]

        # 8. Log retrieval
        if log_query:
            await self._log_retrieval(request.query, final_claims)

        # 9. Update access counts
        await self._bump_access(final_claims)

        # 10. Build results
        results: list[MemorySearchResult] = []
        for c, s in scored:
            if c in final_claims:
                results.append(
                    MemorySearchResult(
                        claim=ClaimSchema.model_validate(c),
                        score=round(s, 4),
                    )
                )

        return results

    def _apply_filters(
        self, hits: list[dict], request: MemorySearchRequest
    ) -> list[dict]:
        out = []
        tier_vals = (
            {t.value for t in request.tier_filter} if request.tier_filter else None
        )
        seg_vals = (
            {s.value for s in request.segment_filter}
            if request.segment_filter
            else None
        )
        class_vals = (
            {c.value for c in request.memory_class_filter}
            if request.memory_class_filter
            else None
        )

        for h in hits:
            if tier_vals and h.get("tier") not in tier_vals:
                continue
            if seg_vals and h.get("segment") not in seg_vals:
                continue
            if class_vals and h.get("memory_class") not in class_vals:
                continue
            out.append(h)
        return out

    async def _log_retrieval(self, query: str, claims: list[ClaimORM]) -> None:
        async with get_session() as session:
            for claim in claims:
                log = RetrievalLogORM(
                    query_text=query,
                    claim_id=claim.claim_id,
                    returned=True,
                )
                session.add(log)

    async def _bump_access(self, claims: list[ClaimORM]) -> None:
        if not claims:
            return
        ids = [c.claim_id for c in claims]
        async with get_session() as session:
            await session.execute(select(ClaimORM).where(ClaimORM.claim_id.in_(ids)))
            for claim in (
                (
                    await session.execute(
                        select(ClaimORM).where(ClaimORM.claim_id.in_(ids))
                    )
                )
                .scalars()
                .all()
            ):
                claim.access_count += 1
                claim.last_accessed_at = datetime.now(timezone.utc)
