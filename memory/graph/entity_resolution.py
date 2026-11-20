"""Entity resolution: merge duplicate entities using fuzzy + embedding similarity."""
from __future__ import annotations
import asyncio
import uuid
from typing import Optional

import numpy as np
from sqlalchemy import select, update, or_
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import get_logger
from core.clients.neo4j import get_neo4j
from core.clients.opensearch import get_opensearch, IDX_ENTITIES
from core.db import get_session
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
        self, limit: int = 2000
    ) -> list[tuple[str, str, float]]:
        """Scan active entities for near-duplicate pairs of the same type.

        Returns (keep_id, remove_id, similarity). Entities whose name or alias
        matches another's get similarity 1.0. The keeper is the older entity,
        or "User" for the user's own entity.

        This used to require EntityORM.opensearch_id, which nothing set, so it
        never found anything. Ingestion now sets it, and older rows are
        backfilled here when their search doc exists.
        """
        async with get_session() as session:
            entities = list((await session.execute(
                select(EntityORM).where(EntityORM.status == "active")
                .order_by(EntityORM.created_at.asc()).limit(limit)
            )).scalars().all())

            if len(entities) < 2:
                return []

            os_client = get_opensearch()
            docs = await asyncio.to_thread(
                os_client.client.mget, index=IDX_ENTITIES,
                body={"ids": [str(e.entity_id) for e in entities]}, _source_includes=["embedding"],
            )
            embs: dict[str, list[float]] = {}
            for d in docs.get("docs", []):
                if d.get("found") and d["_source"].get("embedding"):
                    embs[d["_id"]] = d["_source"]["embedding"]
            for e in entities:
                if e.opensearch_id is None and str(e.entity_id) in embs:
                    e.opensearch_id = str(e.entity_id)

        order = {str(e.entity_id): i for i, e in enumerate(entities)}
        by_id = {str(e.entity_id): e for e in entities}

        def keeper(a: str, b: str) -> tuple[str, str]:
            ea, eb = by_id[a], by_id[b]
            if eb.canonical_name == "User" and ea.canonical_name != "User":
                return b, a
            if ea.canonical_name == "User":
                return a, b
            return (a, b) if order[a] <= order[b] else (b, a)

        def norm(n: str | None) -> str:
            return (n or "").strip().lower()

        def name_match(a: EntityORM, b: EntityORM) -> bool:
            """Same canonical name, or one's canonical name is the other's alias.

            Two entities merely sharing an alias is NOT a match: "Maya Rao" and
            "Maya Chen" can both carry the alias "Maya" and are different people.
            """
            ca, cb = norm(a.canonical_name), norm(b.canonical_name)
            if ca and ca == cb:
                return True
            return ca in {norm(x) for x in (b.aliases or [])} or cb in {norm(x) for x in (a.aliases or [])}

        pairs: dict[tuple[str, str], float] = {}
        ids = [str(e.entity_id) for e in entities]
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                a, b = ids[i], ids[j]
                ea, eb = by_id[a], by_id[b]
                if ea.entity_type != eb.entity_type:
                    continue
                if name_match(ea, eb):
                    sim = 1.0
                elif ea.entity_type == "person":
                    # People with different names are only ever flagged, never auto-merged.
                    cos = _cosine(embs[a], embs[b]) if a in embs and b in embs else 0.0
                    sim = min(cos, MERGE_THRESHOLD - 0.001)
                else:
                    sim = _cosine(embs[a], embs[b]) if a in embs and b in embs else 0.0
                if sim >= REVIEW_THRESHOLD:
                    pairs[keeper(a, b)] = sim

        return sorted(((k, r, s) for (k, r), s in pairs.items()), key=lambda x: x[2], reverse=True)

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
            merged_aliases = sorted({
                a for a in (keep.aliases or []) + (remove.aliases or []) + [remove.canonical_name]
                if a and a.lower() != keep.canonical_name.lower()
            })
            keep.aliases = merged_aliases

            subject_claims = list((await session.execute(
                select(ClaimORM.claim_id).where(ClaimORM.subject_entity_id == remove.entity_id)
            )).scalars().all())
            object_claims = list((await session.execute(
                select(ClaimORM.claim_id).where(ClaimORM.object_entity_id == remove.entity_id)
            )).scalars().all())

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
            keep_type, keep_name, keep_desc = keep.entity_type, keep.canonical_name, keep.description or ""

        # Neo4j: reroute edges and delete old node
        neo4j = get_neo4j()
        # transfer edges in neo4j
        cypher = """
        MATCH (old:Entity {entity_id: $old_id})
        MATCH (keep:Entity {entity_id: $keep_id})
        CALL apoc.refactor.mergeNodes([keep, old], {properties: 'discard', mergeRels: true})
        YIELD node
        RETURN node
        """
        try:
            # 'discard' keeps the first node's properties (the keeper's scalar
            # entity_id and name; 'combine' turned them into arrays). Aliases
            # are then written explicitly.
            await neo4j.run_cypher(cypher, {"old_id": entity_id_remove, "keep_id": entity_id_keep})
            await neo4j.upsert_entity(entity_id_keep, keep_type, keep_name, keep_desc, merged_aliases)
        except Exception as exc:
            # No APOC (Neo4j community): move the claim links by hand, then
            # drop the old node.
            logger.info("Neo4j APOC merge unavailable, relinking claims manually: %s", exc)
            for cid in subject_claims:
                await neo4j.link_claim_to_entity(str(cid), entity_id_keep, "SUBJECT")
            for cid in object_claims:
                await neo4j.link_claim_to_entity(str(cid), entity_id_keep, "OBJECT")
            await neo4j.delete_entity(entity_id_remove)
            await neo4j.upsert_entity(entity_id_keep, keep_type, keep_name, keep_desc, merged_aliases)

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

        removed: set[str] = set()
        for id_a, id_b, sim in duplicates:
            if id_a in removed or id_b in removed:
                continue
            if sim >= MERGE_THRESHOLD:
                if not dry_run:
                    await self.auto_merge(entity_id_keep=id_a, entity_id_remove=id_b)
                removed.add(id_b)
                auto_merged += 1
            elif sim >= REVIEW_THRESHOLD:
                flagged_for_review += 1
                logger.info("Flagged for review: %s ~ %s (sim=%.3f)", id_a, id_b, sim)

        return {"auto_merged": auto_merged, "flagged_for_review": flagged_for_review}
