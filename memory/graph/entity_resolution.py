"""Entity resolution: merge duplicate entities using fuzzy + embedding similarity."""
from __future__ import annotations
import uuid
from typing import Optional

import numpy as np
from sqlalchemy import select, update, or_
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import get_logger
from core.clients.neo4j import get_neo4j
from core.clients.opensearch import get_opensearch, IDX_ENTITIES
from core.db import get_session
from memory.ingestion.extractor import _EMBEDDINGS
from models.db.memory import ClaimORM, EntityORM

logger = get_logger(__name__)

MERGE_THRESHOLD   = 0.94   # cosine similarity above which auto-merge is safe
REVIEW_THRESHOLD  = 0.85   # similarity above which to flag for human review


def _cosine(a: list[float], b: list[float]) -> float:
    va, vb = np.array(a), np.array(b)
    denom = np.linalg.norm(va) * np.linalg.norm(vb)
    return float(np.dot(va, vb) / denom) if denom > 0 else 0.0


class EntityResolver:
    async def find_duplicates(
        self, limit: int = 500
    ) -> list[tuple[str, str, float]]:
        """
        Scan entities for near-duplicate pairs.
        Returns list of (entity_id_a, entity_id_b, similarity_score).
        """
        async with get_session() as session:
            result = await session.execute(
                select(EntityORM)
                .where(EntityORM.status == "active", EntityORM.opensearch_id.isnot(None))
                .limit(limit)
            )
            entities = result.scalars().all()

        if len(entities) < 2:
            return []

        # Fetch embeddings in bulk from OpenSearch
        entity_embeddings: dict[str, list[float]] = {}
        os_client = get_opensearch()
        for entity in entities:
            try:
                hits = os_client.client.get(index=IDX_ENTITIES, id=str(entity.entity_id))
                emb = hits["_source"].get("embedding")
                if emb:
                    entity_embeddings[str(entity.entity_id)] = emb
            except Exception:
                pass

        ids = list(entity_embeddings.keys())
        duplicates: list[tuple[str, str, float]] = []

        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                id_a, id_b = ids[i], ids[j]
                sim = _cosine(entity_embeddings[id_a], entity_embeddings[id_b])
                if sim >= REVIEW_THRESHOLD:
                    duplicates.append((id_a, id_b, sim))

        return sorted(duplicates, key=lambda x: x[2], reverse=True)

    async def auto_merge(self, entity_id_keep: str, entity_id_remove: str) -> None:
        """
        Merge entity_id_remove into entity_id_keep.
        - Repoints all claim foreign keys
        - Merges aliases
        - Deletes the removed entity from all stores
        """
        async with get_session() as session:
            keep_res = await session.execute(
                select(EntityORM).where(EntityORM.entity_id == uuid.UUID(entity_id_keep))
            )
            keep = keep_res.scalar_one_or_none()
            remove_res = await session.execute(
                select(EntityORM).where(EntityORM.entity_id == uuid.UUID(entity_id_remove))
            )
            remove = remove_res.scalar_one_or_none()

            if not keep or not remove:
                logger.warning("Merge skipped: entity not found")
                return

            # Merge aliases
            merged_aliases = list(set(
                (keep.aliases or []) +
                (remove.aliases or []) +
                [remove.canonical_name]
            ))
            keep.aliases = merged_aliases

            # Repoint claim FK references
            await session.execute(
                update(ClaimORM)
                .where(ClaimORM.subject_entity_id == remove.entity_id)
                .values(subject_entity_id=keep.entity_id)
            )
            await session.execute(
                update(ClaimORM)
                .where(ClaimORM.object_entity_id == remove.entity_id)
                .values(object_entity_id=keep.entity_id)
            )

            remove.status = "deleted"

        # Neo4j: reroute edges and delete old node
        neo4j = get_neo4j()
        # transfer edges in neo4j
        cypher = """
        MATCH (old:Entity {entity_id: $old_id})
        MATCH (keep:Entity {entity_id: $keep_id})
        CALL apoc.refactor.mergeNodes([keep, old], {properties: 'combine', mergeRels: true})
        YIELD node
        RETURN node
        """
        try:
            await neo4j.run_cypher(cypher, {"old_id": entity_id_remove, "keep_id": entity_id_keep})
        except Exception as exc:
            logger.warning("Neo4j APOC merge failed (non-fatal): %s", exc)
            await neo4j.delete_entity(entity_id_remove)

        # OpenSearch: delete old entity doc
        try:
            get_opensearch().delete_document(IDX_ENTITIES, entity_id_remove)
        except Exception:
            pass

        logger.info("Merged entity %s into %s", entity_id_remove, entity_id_keep)

    async def resolve_and_merge_batch(self, dry_run: bool = False) -> dict:
        """Find and auto-merge high-confidence duplicates."""
        duplicates = await self.find_duplicates()
        auto_merged = 0
        flagged_for_review = 0

        for id_a, id_b, sim in duplicates:
            if sim >= MERGE_THRESHOLD:
                if not dry_run:
                    await self.auto_merge(entity_id_keep=id_a, entity_id_remove=id_b)
                auto_merged += 1
            elif sim >= REVIEW_THRESHOLD:
                flagged_for_review += 1
                logger.info("Flagged for review: %s ~ %s (sim=%.3f)", id_a, id_b, sim)

        return {"auto_merged": auto_merged, "flagged_for_review": flagged_for_review}
