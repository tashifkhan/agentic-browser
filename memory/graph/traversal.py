"""Graph RAG traversal — local (1-2 hop) and global (community summary)."""
from __future__ import annotations
import uuid
from typing import Any, Optional

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import get_logger
from core.clients.neo4j import get_neo4j
from core.clients.opensearch import get_opensearch, IDX_CLAIMS
from core.db import get_session
from models.db.memory import ClaimORM, EntityORM
from models.memory import ClaimSchema, EntitySchema, GraphExpandResult

logger = get_logger(__name__)


class GraphTraversal:
    # ── Local Graph RAG ────────────────────────────────────────────────────────

    async def local_expand(
        self,
        seed_entity_names: list[str],
        hops: int = 2,
        edge_types: Optional[list[str]] = None,
        limit: int = 50,
    ) -> GraphExpandResult:
        """Given entity name hints, find and expand the local subgraph."""
        neo4j = get_neo4j()

        # Resolve entity names to IDs
        seed_entities: list[EntitySchema] = []
        all_graph_nodes: list[dict] = []
        all_graph_edges: list[dict] = []
        graph_claim_ids: set[str] = set()

        for name in seed_entity_names:
            matches = await neo4j.find_entity_by_name(name)
            if not matches:
                continue

            best = matches[0]
            entity_id = best["entity_id"]

            # Expand from this entity
            subgraph = await neo4j.expand_entity(entity_id, hops=hops,
                                                  edge_types=edge_types, limit=limit)
            all_graph_nodes.extend(subgraph["nodes"])
            all_graph_edges.extend(subgraph["edges"])

            # Fetch claims attached to this entity
            neo4j_claims = await neo4j.get_claims_for_entity(entity_id)
            for nc in neo4j_claims:
                graph_claim_ids.add(nc["claim_id"])

            # Resolve seed entity from Postgres
            async with get_session() as session:
                result = await session.execute(
                    select(EntityORM).where(EntityORM.entity_id == uuid.UUID(entity_id))
                )
                entity_orm = result.scalar_one_or_none()
                if entity_orm:
                    seed_entities.append(EntitySchema.model_validate(entity_orm))

        # Fetch claim details from Postgres
        claims: list[ClaimSchema] = []
        if graph_claim_ids:
            async with get_session() as session:
                result = await session.execute(
                    select(ClaimORM)
                    .where(
                        ClaimORM.claim_id.in_([uuid.UUID(cid) for cid in graph_claim_ids]),
                        ClaimORM.status.in_(["active", "provisional"]),
                    )
                    .limit(limit)
                )
                for claim_orm in result.scalars().all():
                    claims.append(ClaimSchema.model_validate(claim_orm))

        # Deduplicate nodes
        seen_node_ids: set[str] = set()
        unique_nodes = []
        for node in all_graph_nodes:
            nid = node.get("entity_id", "")
            if nid not in seen_node_ids:
                seen_node_ids.add(nid)
                unique_nodes.append(node)

        return GraphExpandResult(
            seed_entity=seed_entities[0] if seed_entities else None,
            nodes=unique_nodes,
            edges=all_graph_edges,
            claims=claims,
        )

    # ── Timeline retrieval ─────────────────────────────────────────────────────

    async def timeline(
        self,
        entity_name: Optional[str] = None,
        topic: Optional[str] = None,
        start=None,
        end=None,
        limit: int = 20,
    ) -> list[ClaimSchema]:
        from sqlalchemy import and_, or_
        async with get_session() as session:
            conditions = [
                ClaimORM.status.in_(["active", "provisional"]),
                ClaimORM.valid_from.isnot(None),
            ]
            if start:
                conditions.append(ClaimORM.valid_from >= start)
            if end:
                conditions.append(ClaimORM.valid_from <= end)

            if entity_name:
                # find entity first
                ent_result = await session.execute(
                    select(EntityORM).where(EntityORM.canonical_name.ilike(f"%{entity_name}%")).limit(1)
                )
                entity = ent_result.scalar_one_or_none()
                if entity:
                    conditions.append(
                        or_(
                            ClaimORM.subject_entity_id == entity.entity_id,
                            ClaimORM.object_entity_id == entity.entity_id,
                        )
                    )

            result = await session.execute(
                select(ClaimORM)
                .where(*conditions)
                .order_by(ClaimORM.valid_from.asc())
                .limit(limit)
            )
            return [ClaimSchema.model_validate(c) for c in result.scalars().all()]

    # ── Global Graph RAG ───────────────────────────────────────────────────────

    async def community_summary_search(
        self, query_embedding: list[float], top_k: int = 5
    ) -> list[dict[str, Any]]:
        """Retrieve top-k community summary artifacts via vector search."""
        hits = get_opensearch().knn_search(
            "memory_artifacts",
            embedding=query_embedding,
            k=top_k,
            filters={"artifact_type": "community_summary"},
        )
        return hits

    async def get_procedural_memories(self) -> list[ClaimSchema]:
        """Always-loaded procedural/preference memories."""
        async with get_session() as session:
            result = await session.execute(
                select(ClaimORM)
                .where(
                    ClaimORM.memory_class.in_(["procedural", "semantic"]),
                    ClaimORM.segment == "preferences_and_corrections",
                    ClaimORM.status == "active",
                )
                .order_by(ClaimORM.base_importance.desc())
                .limit(30)
            )
            return [ClaimSchema.model_validate(c) for c in result.scalars().all()]

    async def get_profile_summary(self) -> str:
        """Build a compact profile summary from core_identity + skills claims."""
        async with get_session() as session:
            result = await session.execute(
                select(ClaimORM)
                .where(
                    ClaimORM.segment.in_(["core_identity", "skills_and_background"]),
                    ClaimORM.status == "active",
                    ClaimORM.tier.in_(["long_term", "permanent"]),
                )
                .order_by(ClaimORM.base_importance.desc())
                .limit(20)
            )
            claims = result.scalars().all()

        if not claims:
            return ""

        lines = [c.claim_text for c in claims]
        return "\n".join(f"- {line}" for line in lines)
