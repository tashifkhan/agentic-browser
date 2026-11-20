"""Deduplication: merge claims that state the same fact.

Write-time reconciliation catches most repeats. This pass cleans up what got
through (other ingestion paths, older data):

- Pages through every active and provisional claim with search_after,
  instead of only the newest 100-300.
- A pair counts as a duplicate only when the embeddings are very close
  (>= 0.95) AND the content words mostly overlap. Similarity alone merged
  corrections into the facts they corrected ("prefers short answers" vs
  "prefers detailed answers" embed very close).
- Groups are built with union-find, so A~B~C chains merge into one claim
  in a single pass.
- The keeper is the claim with the most support, then user-confirmed, then
  the newest. Never an older claim just because it scored higher confidence.
"""
from __future__ import annotations

import asyncio
import re
import uuid
from collections import defaultdict

import numpy as np
from sqlalchemy import select, update

from core.clients.opensearch import IDX_CLAIMS, get_opensearch
from core.config import get_logger
from core.db import get_session
from memory.graph.operations import GraphOperations
from memory.ingestion.reconcile import jaccard
from models.db.memory import ClaimORM, EvidenceORM
from models.memory import ClaimRelationType, ClaimStatus

logger = get_logger(__name__)

DEDUP_THRESHOLD = 0.95
MIN_WORD_OVERLAP = 0.6
PAGE = 500
MAX_CLAIMS = 20000
_graph_ops = GraphOperations()


def _scan(statuses: list[str]) -> list[dict]:
    client = get_opensearch().client
    out: list[dict] = []
    after = None
    while len(out) < MAX_CLAIMS:
        body = {
            "size": PAGE,
            "query": {"terms": {"status": statuses}},
            "_source": ["claim_id", "claim_text", "embedding"],
            "sort": [{"claim_id": "asc"}],
        }
        if after:
            body["search_after"] = after
        hits = client.search(index=IDX_CLAIMS, body=body)["hits"]["hits"]
        if not hits:
            break
        out.extend(hits)
        after = hits[-1]["sort"]
    return out


_NEGATION = re.compile(
    r"\b(not|no longer|never|don't|doesn't|didn't|isn't|aren't|wasn't|won't|can't|cannot|stopped|quit|no more|anymore)\b",
    re.IGNORECASE,
)


def _negated(text: str) -> bool:
    """A statement and its negation embed and overlap almost identically
    ("takes the shuttle" / "no longer takes the shuttle"); never merge across them."""
    return bool(_NEGATION.search(text))


class _UnionFind:
    def __init__(self, n: int) -> None:
        self.parent = list(range(n))

    def find(self, x: int) -> int:
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a: int, b: int) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[rb] = ra


class DeduplicationEngine:
    async def run(self, batch_size: int | None = None) -> dict:
        """`batch_size` is accepted for backwards compatibility and ignored:
        the pass always covers every active and provisional claim."""
        hits = await asyncio.to_thread(_scan, ["active", "provisional"])
        hits = [h for h in hits if h["_source"].get("embedding")]
        n = len(hits)
        if n < 2:
            return {"checked": n, "duplicates_found": 0, "merged": 0}

        ids = [h["_id"] for h in hits]
        texts = [h["_source"].get("claim_text", "") for h in hits]
        mat = np.asarray([h["_source"]["embedding"] for h in hits], dtype=np.float32)
        mat /= np.linalg.norm(mat, axis=1, keepdims=True) + 1e-9

        uf = _UnionFind(n)
        pairs = 0
        for start in range(0, n, 1000):
            block = mat[start:start + 1000] @ mat.T
            rows, cols = np.nonzero(block >= DEDUP_THRESHOLD)
            for r, c in zip(rows.tolist(), cols.tolist()):
                i = start + r
                if c <= i:
                    continue
                if jaccard(texts[i], texts[c]) >= MIN_WORD_OVERLAP and _negated(texts[i]) == _negated(texts[c]):
                    uf.union(i, c)
                    pairs += 1

        groups: dict[int, list[str]] = defaultdict(list)
        for i in range(n):
            groups[uf.find(i)].append(ids[i])
        clusters = [g for g in groups.values() if len(g) > 1]

        merged = 0
        for cluster in clusters:
            try:
                merged += await self._merge_cluster(cluster)
            except Exception as exc:
                logger.warning("Dedup merge failed for %s: %s", cluster, exc)

        logger.info("Dedup: checked=%d pairs=%d clusters=%d merged=%d", n, pairs, len(clusters), merged)
        return {"checked": n, "duplicates_found": pairs, "merged": merged}

    async def _merge_cluster(self, cluster: list[str]) -> int:
        uuids = [uuid.UUID(c) for c in cluster]
        async with get_session() as session:
            rows = list((await session.execute(
                select(ClaimORM).where(ClaimORM.claim_id.in_(uuids))
            )).scalars().all())
            rows = [r for r in rows if r.status in (ClaimStatus.ACTIVE.value, ClaimStatus.PROVISIONAL.value)]
            if len(rows) < 2:
                return 0
            rows.sort(key=lambda r: (r.support_count or 0, r.user_confirmed, r.created_at), reverse=True)
            keep, drops = rows[0], rows[1:]
            drop_ids = [d.claim_id for d in drops]

            moved_sources = list((await session.execute(
                select(EvidenceORM.source_id).where(EvidenceORM.claim_id.in_(drop_ids))
            )).scalars().all())
            await session.execute(
                update(EvidenceORM).where(EvidenceORM.claim_id.in_(drop_ids)).values(claim_id=keep.claim_id)
            )
            keep.support_count = (keep.support_count or 0) + len(drops)
            keep.confidence = min(1.0, max([keep.confidence] + [d.confidence for d in drops]))
            keep.base_importance = max([keep.base_importance] + [d.base_importance for d in drops])
            keep.access_count = (keep.access_count or 0) + sum(d.access_count or 0 for d in drops)
            keep.retrieval_hit_count = (keep.retrieval_hit_count or 0) + sum(d.retrieval_hit_count or 0 for d in drops)
            if any(d.status == ClaimStatus.ACTIVE.value for d in drops):
                keep.status = ClaimStatus.ACTIVE.value
            for d in drops:
                d.status = ClaimStatus.SUPERSEDED.value
            keep_id = str(keep.claim_id)
            keep_fields = {"status": keep.status, "confidence": keep.confidence,
                           "base_importance": keep.base_importance}

        os_client = get_opensearch()
        await asyncio.to_thread(os_client.update_document, IDX_CLAIMS, keep_id, keep_fields)
        # Mirror the moved provenance in the graph, like Postgres.
        from core.clients.neo4j import get_neo4j
        for sid in set(moved_sources):
            try:
                await get_neo4j().link_claim_to_source(keep_id, str(sid))
            except Exception as exc:
                logger.debug("Neo4j evidence move failed: %s", exc)
        for did in drop_ids:
            try:
                await asyncio.to_thread(os_client.update_document, IDX_CLAIMS, str(did), {"status": "superseded"})
                await _graph_ops.create_claim_relation(keep_id, str(did), ClaimRelationType.SUPERSEDES)
            except Exception as exc:
                logger.debug("Dedup sync for %s failed: %s", did, exc)
        return len(drop_ids)
