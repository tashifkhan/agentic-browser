"""Store repair: make OpenSearch and Neo4j match Postgres again.

Postgres is the record. Search and graph writes run after the Postgres commit
(ingestion/writer.py), so a failure there leaves a committed claim that search
can't find. The document and Gmail pipelines still write the mirrors inline,
so a rolled-back transaction can leave docs and nodes with no Postgres row.
This job finds both kinds of drift and fixes them:

  - claims/entities in Postgres but missing from OpenSearch: re-embed, index
  - search docs whose Postgres row is gone or deleted: remove
  - status / tier / confidence that differ: copy from Postgres
  - claim nodes missing from Neo4j: create with their entity and source links
  - claim/entity nodes in Neo4j with no live Postgres row: remove
  - artifact docs whose Postgres row is gone: remove

It runs at the start of the hourly job and is safe to run any time.
"""
from __future__ import annotations

import asyncio
import uuid
from typing import Any

from sqlalchemy import select

from core.clients.neo4j import get_neo4j
from core.clients.opensearch import IDX_ARTIFACTS, IDX_CLAIMS, IDX_ENTITIES, get_opensearch
from core.config import get_logger
from core.db import get_session
from memory import embeddings
from models.db.memory import ArtifactORM, ClaimORM, EntityORM, EvidenceORM

logger = get_logger(__name__)

_LIVE_CLAIM = ("active", "provisional", "superseded", "stale")
_SYNCED_FIELDS = ("status", "tier", "confidence")


def _scan_ids(index: str, fields: list[str]) -> dict[str, dict[str, Any]]:
    client = get_opensearch().client
    out: dict[str, dict[str, Any]] = {}
    after = None
    while True:
        body: dict[str, Any] = {"size": 1000, "query": {"match_all": {}}, "_source": fields, "sort": [{"_id": "asc"}]}
        if after:
            body["search_after"] = after
        try:
            hits = client.search(index=index, body=body)["hits"]["hits"]
        except Exception:
            # Older OpenSearch can't sort on _id; fall back to one large page.
            body.pop("sort", None)
            body.pop("search_after", None)
            body["size"] = 10000
            return {h["_id"]: h.get("_source", {}) for h in client.search(index=index, body=body)["hits"]["hits"]}
        if not hits:
            return out
        for h in hits:
            out[h["_id"]] = h.get("_source", {})
        after = hits[-1]["sort"]


class StoreRepair:
    async def run(self) -> dict[str, int]:
        stats = {"claims_reindexed": 0, "claims_unindexed": 0, "claims_resynced": 0,
                 "entities_reindexed": 0, "entities_unindexed": 0, "artifacts_unindexed": 0,
                 "graph_claims_added": 0, "graph_nodes_removed": 0}
        try:
            await self._claims(stats)
            await self._entities(stats)
            await self._artifacts(stats)
            await self._graph(stats)
        except Exception as exc:
            logger.warning("Store repair stopped early: %s", exc)
            stats["error"] = 1
        logger.info("Store repair: %s", stats)
        return stats

    async def _claims(self, stats: dict[str, int]) -> None:
        os_client = get_opensearch()
        indexed = await asyncio.to_thread(_scan_ids, IDX_CLAIMS, list(_SYNCED_FIELDS))
        async with get_session() as session:
            rows = list((await session.execute(select(ClaimORM).where(ClaimORM.status.in_(_LIVE_CLAIM)))).scalars().all())
        live = {str(c.claim_id): c for c in rows}

        missing = [c for cid, c in live.items() if cid not in indexed]
        for start in range(0, len(missing), 64):
            batch = missing[start:start + 64]
            vecs = await embeddings.embed_documents([c.claim_text for c in batch])
            for c, v in zip(batch, vecs):
                await asyncio.to_thread(
                    os_client.index_claim, str(c.claim_id), c.claim_text, v, c.segment, c.memory_class,
                    c.tier, c.status, c.confidence, c.base_importance, c.trust_score,
                    predicate=c.predicate or "", user_confirmed=c.user_confirmed,
                    created_at=c.created_at.isoformat() if c.created_at else "",
                    last_accessed_at=c.last_accessed_at.isoformat() if c.last_accessed_at else "",
                    valid_from=c.valid_from.isoformat() if c.valid_from else None,
                    valid_to=c.valid_to.isoformat() if c.valid_to else None,
                )
                stats["claims_reindexed"] += 1

        for cid in [i for i in indexed if i not in live]:
            await asyncio.to_thread(os_client.delete_document, IDX_CLAIMS, cid)
            stats["claims_unindexed"] += 1

        for cid, doc in indexed.items():
            c = live.get(cid)
            if c is None:
                continue
            fields = {f: getattr(c, f) for f in _SYNCED_FIELDS if doc.get(f) != getattr(c, f)}
            if "confidence" in fields and abs((doc.get("confidence") or 0) - c.confidence) < 1e-6:
                fields.pop("confidence")
            if fields:
                await asyncio.to_thread(os_client.update_document, IDX_CLAIMS, cid, fields)
                stats["claims_resynced"] += 1

    async def _entities(self, stats: dict[str, int]) -> None:
        os_client = get_opensearch()
        indexed = await asyncio.to_thread(_scan_ids, IDX_ENTITIES, ["canonical_name"])
        async with get_session() as session:
            rows = list((await session.execute(select(EntityORM).where(EntityORM.status == "active"))).scalars().all())
        live = {str(e.entity_id): e for e in rows}
        missing = [e for eid, e in live.items() if eid not in indexed]
        if missing:
            vecs = await embeddings.embed_documents(
                [f"{e.canonical_name} {e.description or ''} {' '.join(e.aliases or [])}" for e in missing]
            )
            for e, v in zip(missing, vecs):
                await asyncio.to_thread(os_client.index_entity, str(e.entity_id), e.entity_type, e.canonical_name,
                                        e.description or "", list(e.aliases or []), v)
                stats["entities_reindexed"] += 1
        for eid in [i for i in indexed if i not in live]:
            await asyncio.to_thread(os_client.delete_document, IDX_ENTITIES, eid)
            stats["entities_unindexed"] += 1

    async def _artifacts(self, stats: dict[str, int]) -> None:
        indexed = await asyncio.to_thread(_scan_ids, IDX_ARTIFACTS, ["artifact_type"])
        if not indexed:
            return
        ids = [uuid.UUID(i) for i in indexed if _is_uuid(i)]
        async with get_session() as session:
            live = {str(a) for a in (await session.execute(
                select(ArtifactORM.artifact_id).where(ArtifactORM.artifact_id.in_(ids))
            )).scalars().all()}
        for aid in [i for i in indexed if i not in live]:
            await asyncio.to_thread(get_opensearch().delete_document, IDX_ARTIFACTS, aid)
            stats["artifacts_unindexed"] += 1

    async def _graph(self, stats: dict[str, int]) -> None:
        neo4j = get_neo4j()
        # Nodes whose id became a list (an old APOC 'combine' merge) can't be
        # matched by id any more; drop them and recreate from Postgres below.
        broken = await neo4j.run_cypher(
            "MATCH (e:Entity) WHERE NOT e.entity_id IS :: STRING DETACH DELETE e RETURN count(*) AS n", {})
        stats["graph_nodes_removed"] += int(broken[0]["n"]) if broken else 0
        claim_nodes = {r["id"] for r in await neo4j.run_cypher("MATCH (c:Claim) RETURN c.claim_id AS id", {}) if r.get("id")}
        entity_nodes = {r["id"] for r in await neo4j.run_cypher("MATCH (e:Entity) RETURN e.entity_id AS id", {})
                        if isinstance(r.get("id"), str)}
        async with get_session() as session:
            claims = list((await session.execute(select(ClaimORM).where(ClaimORM.status.in_(_LIVE_CLAIM)))).scalars().all())
            entity_rows = list((await session.execute(
                select(EntityORM).where(EntityORM.status == "active"))).scalars().all())
            entities = {str(e.entity_id) for e in entity_rows}
            sources: dict[str, list[str]] = {}
            for cid, sid in (await session.execute(select(EvidenceORM.claim_id, EvidenceORM.source_id))).all():
                sources.setdefault(str(cid), []).append(str(sid))
        live_claims = {str(c.claim_id) for c in claims}

        recreated = set()
        for e in entity_rows:
            eid = str(e.entity_id)
            if eid not in entity_nodes:
                await neo4j.upsert_entity(eid, e.entity_type, e.canonical_name, e.description or "", list(e.aliases or []))
                recreated.add(eid)
                stats["graph_entities_added"] = stats.get("graph_entities_added", 0) + 1
        # Claims pointing at a recreated entity need their edges back.
        for c in claims:
            cid = str(c.claim_id)
            if cid in claim_nodes and c.subject_entity_id and str(c.subject_entity_id) in recreated:
                await neo4j.link_claim_to_entity(cid, str(c.subject_entity_id), "SUBJECT")
            if cid in claim_nodes and c.object_entity_id and str(c.object_entity_id) in recreated:
                await neo4j.link_claim_to_entity(cid, str(c.object_entity_id), "OBJECT")

        for c in claims:
            cid = str(c.claim_id)
            if cid in claim_nodes:
                continue
            await neo4j.upsert_claim_node(cid, c.claim_text, predicate=c.predicate or "", segment=c.segment,
                                          confidence=c.confidence)
            if c.subject_entity_id:
                await neo4j.link_claim_to_entity(cid, str(c.subject_entity_id), "SUBJECT")
            if c.object_entity_id:
                await neo4j.link_claim_to_entity(cid, str(c.object_entity_id), "OBJECT")
            for sid in sources.get(cid, []):
                await neo4j.link_claim_to_source(cid, sid)
            stats["graph_claims_added"] += 1

        for cid in claim_nodes - live_claims:
            await neo4j.delete_claim_node(cid)
            stats["graph_nodes_removed"] += 1
        for eid in entity_nodes - entities:
            await neo4j.delete_entity(eid)
            stats["graph_nodes_removed"] += 1


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
        return True
    except ValueError:
        return False
