"""Hybrid retrieval: vector + BM25 + graph, merged with composite scoring.

What changed and why:
- Status, tier, segment and class filters run inside OpenSearch, so deleted
  and superseded claims no longer use up the k candidate slots.
- Relevance comes from cosine similarity and BM25 directly (see scoring.py),
  and results below MIN_RELEVANCE are dropped instead of always returning
  top_k.
- Near-duplicate results are penalised so the top-k covers different facts.
- Callers can exclude ids they already inject (procedural memories, profile)
  instead of procedural memories always being dropped, which hid preferences
  from the recall tool.
- Retrieval only counts an access. `last_accessed_at` moves when a memory is
  used in an answer (MemoryService.mark_retrieval_used), not every time it
  is fetched, so decay still applies to memories that are fetched and unused.
- Embedding and OpenSearch calls are async or run in a worker thread.
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import numpy as np
from sqlalchemy import func, select, update

from core.clients.opensearch import IDX_CLAIMS, get_opensearch
from core.config import get_logger
from core.db import get_session
from memory import embeddings
from memory.graph.traversal import GraphTraversal
from memory.retrieval.query_planner import QueryPlan, QueryPlanner
from memory.retrieval.scoring import (
    MIN_RELEVANCE, RELATIVE_CUTOFF, apply_redundancy_penalty, relevance, score_claim,
)
from models.db.memory import ClaimORM, RetrievalLogORM
from models.memory import ClaimSchema, MemorySearchRequest, MemorySearchResult

logger = get_logger(__name__)

_planner = QueryPlanner()
_traversal = GraphTraversal()


def _cos(a: list[float], b: list[float]) -> float:
    va, vb = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
    denom = float(np.linalg.norm(va) * np.linalg.norm(vb))
    return float(np.dot(va, vb) / denom) if denom else 0.0


class HybridRetriever:
    async def search(
        self,
        request: MemorySearchRequest,
        log_query: bool = True,
        plan: Optional[QueryPlan] = None,
        exclude_ids: Optional[set[str]] = None,
        min_relevance: float = MIN_RELEVANCE,
    ) -> list[MemorySearchResult]:
        query = (request.query or "").strip()
        if not query:
            return []
        plan_task = None if plan else asyncio.create_task(_planner.aplan(query))
        try:
            query_emb = await embeddings.embed_query(query)
        except Exception as exc:
            # Embedding outage: degrade to keyword search instead of failing.
            logger.warning("Query embedding failed, using keyword search only: %s", exc)
            query_emb = None
        plan = plan or await plan_task  # type: ignore[misc]

        statuses = ["active"] + (["provisional"] if request.include_provisional else [])
        if plan.include_history:
            # "Where did I live before...?" is answered by replaced facts.
            statuses.append("superseded")
        filters: dict[str, Any] = {"status": statuses}
        if request.tier_filter:
            filters["tier"] = [t.value for t in request.tier_filter]
        if request.segment_filter:
            filters["segment"] = [s.value for s in request.segment_filter]
        if request.memory_class_filter:
            filters["memory_class"] = [c.value for c in request.memory_class_filter]

        if query_emb is not None:
            hits_task = asyncio.to_thread(
                get_opensearch().hybrid_search, IDX_CLAIMS, query, query_emb,
                max(request.top_k * 3, 15), filters, True,
            )
        else:
            hits_task = asyncio.to_thread(
                get_opensearch().text_search, IDX_CLAIMS, query, ["claim_text"],
                max(request.top_k * 3, 15), filters,
            )
        graph_task = (
            asyncio.create_task(_traversal.local_expand(plan.entity_mentions, hops=2))
            if plan.needs_graph_traversal and plan.entity_mentions else None
        )
        hits = await hits_task
        graph_claim_ids: set[str] = set()
        if graph_task is not None:
            try:
                graph_result = await graph_task
                graph_claim_ids = {str(gc.claim_id) for gc in graph_result.claims}
            except Exception as exc:
                logger.debug("Graph expansion failed: %s", exc)

        exclude = exclude_ids or set()
        signals: dict[str, tuple[float, dict]] = {}
        claim_embs: dict[str, list[float]] = {}
        for h in hits:
            hid = h.get("_id")
            if not hid or hid in exclude:
                continue
            if query_emb is None:
                # Keyword-only mode: BM25 relative to the best hit is all we have.
                top = max((x.get("_score", 0.0) for x in hits), default=1.0) or 1.0
                signals[hid] = (0.6 * float(h.get("_score", 0.0)) / top, h)
                continue
            emb = h.get("embedding")
            cosine = h.get("_cosine")
            if cosine is None and emb:
                cosine = _cos(query_emb, emb)
            if emb:
                claim_embs[hid] = emb
            signals[hid] = (relevance(cosine, h.get("_bm25_norm", 0.0)), h)

        # Graph neighbours of mentioned entities are candidates even when
        # search didn't return them ("my sister's company" -> the company's
        # own facts). Fetch their vectors and score them like any hit.
        missing = [cid for cid in graph_claim_ids if cid not in signals and cid not in exclude][:30] if query_emb is not None else []
        if missing:
            try:
                docs = await asyncio.to_thread(
                    get_opensearch().client.mget, index=IDX_CLAIMS, body={"ids": missing},
                    _source_includes=["embedding", "status"],
                )
                for d in docs.get("docs", []):
                    src = d.get("_source") or {}
                    if d.get("found") and src.get("embedding") and src.get("status") in statuses:
                        signals[d["_id"]] = (relevance(_cos(query_emb, src["embedding"]), 0.0), {})
                        claim_embs[d["_id"]] = src["embedding"]
            except Exception as exc:
                logger.debug("Graph candidate fetch failed: %s", exc)

        best = max((rel for rel, _ in signals.values()), default=0.0)
        cutoff = max(min_relevance, RELATIVE_CUTOFF * best)
        candidate_ids = [cid for cid, (rel, _) in signals.items()
                         if rel >= cutoff or (cid in graph_claim_ids and rel >= min_relevance / 2)]
        if not candidate_ids:
            return []

        async with get_session() as session:
            conditions = [
                ClaimORM.claim_id.in_([uuid.UUID(c) for c in candidate_ids]),
                ClaimORM.status.in_(statuses),
            ]
            if request.time_range_start:
                conditions.append(func.coalesce(ClaimORM.valid_from, ClaimORM.created_at) >= request.time_range_start)
            if request.time_range_end:
                conditions.append(func.coalesce(ClaimORM.valid_from, ClaimORM.created_at) <= request.time_range_end)
            orm_claims = list((await session.execute(select(ClaimORM).where(*conditions))).scalars().all())

        # A first-person question with no one else named is about the user:
        # "what is my birthday?" must not answer with Maya's birthday.
        user_ids: set = set()
        if plan.first_person and not plan.entity_mentions:
            user_ids = await self._user_entity_ids()

        now = datetime.now(timezone.utc)
        scored: list[tuple[ClaimORM, float]] = []
        for claim in orm_claims:
            cid = str(claim.claim_id)
            rel = signals[cid][0]
            if user_ids and claim.subject_entity_id and claim.subject_entity_id not in user_ids:
                rel *= 0.35
                if rel < cutoff:
                    continue
            graph_rel = 1.0 if cid in graph_claim_ids else 0.0
            scored.append((claim, score_claim(claim, rel, graph_relevance=graph_rel, now=now)))

        scored = apply_redundancy_penalty(scored, claim_embs)[: request.top_k]
        final = [c for c, _ in scored]

        if log_query:
            await self._log_retrieval(query, final)
        await self._count_access(final)

        return [
            MemorySearchResult(claim=ClaimSchema.model_validate(c), score=round(s, 4))
            for c, s in scored
        ]

    async def _user_entity_ids(self) -> set:
        from models.db.memory import EntityORM
        async with get_session() as session:
            rows = (await session.execute(
                select(EntityORM.entity_id).where(EntityORM.canonical_name == "User", EntityORM.status == "active")
            )).scalars().all()
        return set(rows)

    async def _log_retrieval(self, query: str, claims: list[ClaimORM]) -> None:
        if not claims:
            return
        async with get_session() as session:
            for claim in claims:
                session.add(RetrievalLogORM(query_text=query[:2000], claim_id=claim.claim_id, returned=True))

    async def _count_access(self, claims: list[ClaimORM]) -> None:
        if not claims:
            return
        async with get_session() as session:
            await session.execute(
                update(ClaimORM)
                .where(ClaimORM.claim_id.in_([c.claim_id for c in claims]))
                .values(access_count=ClaimORM.access_count + 1)
            )
