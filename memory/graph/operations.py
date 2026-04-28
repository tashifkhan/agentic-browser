"""High-level graph operations that keep Postgres and Neo4j in sync."""
from __future__ import annotations
import uuid
from typing import Any, Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import get_logger
from core.clients.neo4j import get_neo4j
from core.db import get_session
from models.db.memory import ClaimORM, EntityORM, ClaimRelationORM
from models.memory import ClaimRelationType

logger = get_logger(__name__)


class GraphOperations:
    """Wraps graph writes so callers don't need to know about dual-write details."""

    # ── Entity operations ──────────────────────────────────────────────────────

    async def sync_entity_to_neo4j(self, entity_id: str) -> None:
        """Push an entity from Postgres to Neo4j."""
        async with get_session() as session:
            result = await session.execute(
                select(EntityORM).where(EntityORM.entity_id == uuid.UUID(entity_id))
            )
            entity = result.scalar_one_or_none()
            if not entity:
                return

        neo4j = get_neo4j()
        node_id = await neo4j.upsert_entity(
            entity_id=str(entity.entity_id),
            entity_type=entity.entity_type,
            canonical_name=entity.canonical_name,
            description=entity.description or "",
            aliases=entity.aliases or [],
        )
        async with get_session() as session:
            await session.execute(
                update(EntityORM)
                .where(EntityORM.entity_id == entity.entity_id)
                .values(neo4j_node_id=node_id)
            )

    async def add_entity_relation(self, from_entity_id: str, to_entity_id: str,
                                  rel_type: str, properties: dict[str, Any] | None = None) -> None:
        neo4j = get_neo4j()
        await neo4j.create_entity_relation(from_entity_id, to_entity_id, rel_type, properties)

    async def delete_entity(self, entity_id: str) -> None:
        neo4j = get_neo4j()
        await neo4j.delete_entity(entity_id)
        async with get_session() as session:
            result = await session.execute(
                select(EntityORM).where(EntityORM.entity_id == uuid.UUID(entity_id))
            )
            entity = result.scalar_one_or_none()
            if entity:
                entity.status = "deleted"

    # ── Claim operations ───────────────────────────────────────────────────────

    async def sync_claim_to_neo4j(self, claim_id: str) -> None:
        async with get_session() as session:
            result = await session.execute(
                select(ClaimORM).where(ClaimORM.claim_id == uuid.UUID(claim_id))
            )
            claim = result.scalar_one_or_none()
            if not claim:
                return

        neo4j = get_neo4j()
        await neo4j.upsert_claim_node(
            str(claim.claim_id), claim.claim_text,
            predicate=claim.predicate or "",
            segment=claim.segment,
            confidence=claim.confidence,
        )

        if claim.subject_entity_id:
            await neo4j.link_claim_to_entity(str(claim.claim_id), str(claim.subject_entity_id), "SUBJECT")
        if claim.object_entity_id:
            await neo4j.link_claim_to_entity(str(claim.claim_id), str(claim.object_entity_id), "OBJECT")

    async def create_claim_relation(self, from_claim_id: str, to_claim_id: str,
                                    rel_type: ClaimRelationType) -> None:
        """Write claim relation to both Postgres and Neo4j."""
        from models.memory import ClaimRelationType as CRT
        async with get_session() as session:
            rel = ClaimRelationORM(
                from_claim_id=uuid.UUID(from_claim_id),
                to_claim_id=uuid.UUID(to_claim_id),
                relation_type=rel_type.value if hasattr(rel_type, "value") else rel_type,
            )
            session.add(rel)

        neo4j = get_neo4j()
        await neo4j.create_claim_relation(from_claim_id, to_claim_id,
                                          rel_type.value if hasattr(rel_type, "value") else rel_type)

    # ── Relationship shortcuts ─────────────────────────────────────────────────

    async def mark_supersedes(self, new_claim_id: str, old_claim_id: str) -> None:
        await self.create_claim_relation(new_claim_id, old_claim_id, ClaimRelationType.SUPERSEDES)
        async with get_session() as session:
            await session.execute(
                update(ClaimORM)
                .where(ClaimORM.claim_id == uuid.UUID(old_claim_id))
                .values(status="superseded")
            )

    async def mark_contradicts(self, claim_a_id: str, claim_b_id: str) -> None:
        await self.create_claim_relation(claim_a_id, claim_b_id, ClaimRelationType.CONTRADICTS)
        async with get_session() as session:
            await session.execute(
                update(ClaimORM)
                .where(ClaimORM.claim_id == uuid.UUID(claim_b_id))
                .values(contradiction_count=ClaimORM.contradiction_count + 1)
            )
            await session.execute(
                update(ClaimORM)
                .where(ClaimORM.claim_id == uuid.UUID(claim_a_id))
                .values(contradiction_count=ClaimORM.contradiction_count + 1)
            )
