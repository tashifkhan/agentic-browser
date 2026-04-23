"""Deduplication engine: find and merge semantically identical claims."""
from __future__ import annotations
import uuid
from typing import Optional

import numpy as np
from sqlalchemy import select, update

from core.config import get_logger
from memory.db.opensearch_client import get_opensearch, IDX_CLAIMS
from memory.db.postgres import get_session
from memory.graph.operations import GraphOperations
from memory.models.enums import ClaimStatus, ClaimRelationType
from memory.models.orm import ClaimORM, EvidenceORM

logger = get_logger(__name__)

DEDUP_THRESHOLD = 0.93   # cosine similarity above which two claims are duplicates
_graph_ops = GraphOperations()


def _cosine(a: list[float], b: list[float]) -> float:
    va, vb = np.array(a, dtype=float), np.array(b, dtype=float)
    denom = np.linalg.norm(va) * np.linalg.norm(vb)
    return float(np.dot(va, vb) / denom) if denom > 0 else 0.0


class DeduplicationEngine:
    async def run(self, batch_size: int = 200) -> dict:
        """Find near-duplicate active claims and merge lower-confidence one into higher."""
        os_client = get_opensearch()

        # Fetch recent active claims with their embeddings
        response = os_client.client.search(
            index=IDX_CLAIMS,
            body={
                "size": batch_size,
                "query": {"term": {"status": "active"}},
                "_source": ["claim_id", "embedding", "confidence", "base_importance"],
                "sort": [{"created_at": "desc"}],
            },
        )
        hits = response["hits"]["hits"]
        if len(hits) < 2:
            return {"duplicates_found": 0, "merged": 0}

        ids   = [h["_id"] for h in hits]
        embs  = [h["_source"].get("embedding", []) for h in hits]
        confs = [h["_source"].get("confidence", 0.5) for h in hits]

        duplicates: list[tuple[int, int]] = []
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                if not embs[i] or not embs[j]:
                    continue
                sim = _cosine(embs[i], embs[j])
                if sim >= DEDUP_THRESHOLD:
                    duplicates.append((i, j))

        merged = 0
        for i, j in duplicates:
            # Keep higher-confidence claim
            keep_idx, drop_idx = (i, j) if confs[i] >= confs[j] else (j, i)
            keep_id = ids[keep_idx]
            drop_id = ids[drop_idx]

            try:
                await self._merge(keep_id, drop_id)
                merged += 1
            except Exception as exc:
                logger.warning("Dedup merge failed %s→%s: %s", drop_id, keep_id, exc)

        logger.info("Dedup: found=%d, merged=%d", len(duplicates), merged)
        return {"duplicates_found": len(duplicates), "merged": merged}

    async def _merge(self, keep_id: str, drop_id: str) -> None:
        """Merge drop_id claim into keep_id — repoint evidence, mark dropped superseded."""
        async with get_session() as session:
            # Re-point evidence
            await session.execute(
                update(EvidenceORM)
                .where(EvidenceORM.claim_id == uuid.UUID(drop_id))
                .values(claim_id=uuid.UUID(keep_id))
            )
            # Bump support count on keeper
            await session.execute(
                update(ClaimORM)
                .where(ClaimORM.claim_id == uuid.UUID(keep_id))
                .values(support_count=ClaimORM.support_count + 1)
            )
            # Mark duplicate as superseded
            await session.execute(
                update(ClaimORM)
                .where(ClaimORM.claim_id == uuid.UUID(drop_id))
                .values(status=ClaimStatus.SUPERSEDED.value)
            )

        # Graph relation
        await _graph_ops.create_claim_relation(keep_id, drop_id, ClaimRelationType.SUPERSEDES)

        # OpenSearch: mark stale
        try:
            get_opensearch().update_document(IDX_CLAIMS, drop_id, {"status": "superseded"})
        except Exception:
            pass
