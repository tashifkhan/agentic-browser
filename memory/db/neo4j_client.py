from __future__ import annotations
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator, Optional
import uuid

from neo4j import AsyncGraphDatabase, AsyncDriver, AsyncSession

from core.config import get_settings as _gs


class Neo4jClient:
    def __init__(self) -> None:
        self._driver: Optional[AsyncDriver] = None

    async def connect(self) -> None:
        self._driver = AsyncGraphDatabase.driver(
            _gs().neo4j_uri,
            auth=(_gs().neo4j_user, _gs().neo4j_password),
            max_connection_pool_size=20,
        )
        await self._driver.verify_connectivity()

    async def close(self) -> None:
        if self._driver:
            await self._driver.close()
            self._driver = None

    @property
    def driver(self) -> AsyncDriver:
        if not self._driver:
            raise RuntimeError("Neo4j driver not initialised — call connect() first")
        return self._driver

    @asynccontextmanager
    async def session(self) -> AsyncGenerator[AsyncSession, None]:
        async with self.driver.session() as s:
            yield s

    # ── Schema constraints ─────────────────────────────────────────────────────

    async def create_constraints(self) -> None:
        constraints = [
            "CREATE CONSTRAINT entity_id IF NOT EXISTS FOR (e:Entity) REQUIRE e.entity_id IS UNIQUE",
            "CREATE CONSTRAINT claim_id  IF NOT EXISTS FOR (c:Claim)  REQUIRE c.claim_id  IS UNIQUE",
            "CREATE INDEX entity_name    IF NOT EXISTS FOR (e:Entity) ON (e.canonical_name)",
            "CREATE INDEX entity_type    IF NOT EXISTS FOR (e:Entity) ON (e.entity_type)",
        ]
        async with self.session() as s:
            for cypher in constraints:
                await s.run(cypher)

    # ── Entity CRUD ────────────────────────────────────────────────────────────

    async def upsert_entity(self, entity_id: str, entity_type: str,
                            canonical_name: str, description: str = "",
                            aliases: list[str] | None = None) -> str:
        cypher = """
        MERGE (e:Entity {entity_id: $entity_id})
        SET e.entity_type    = $entity_type,
            e.canonical_name = $canonical_name,
            e.description    = $description,
            e.aliases        = $aliases,
            e.updated_at     = datetime()
        ON CREATE SET e.created_at = datetime()
        RETURN e.entity_id AS node_id
        """
        async with self.session() as s:
            result = await s.run(cypher, entity_id=entity_id, entity_type=entity_type,
                                 canonical_name=canonical_name, description=description or "",
                                 aliases=aliases or [])
            record = await result.single()
            return record["node_id"]

    async def get_entity(self, entity_id: str) -> Optional[dict[str, Any]]:
        cypher = "MATCH (e:Entity {entity_id: $entity_id}) RETURN e"
        async with self.session() as s:
            result = await s.run(cypher, entity_id=entity_id)
            record = await result.single()
            return dict(record["e"]) if record else None

    async def delete_entity(self, entity_id: str) -> None:
        cypher = "MATCH (e:Entity {entity_id: $entity_id}) DETACH DELETE e"
        async with self.session() as s:
            await s.run(cypher, entity_id=entity_id)

    # ── Claim nodes ────────────────────────────────────────────────────────────

    async def upsert_claim_node(self, claim_id: str, claim_text: str,
                                predicate: str = "", segment: str = "",
                                confidence: float = 0.5) -> str:
        cypher = """
        MERGE (c:Claim {claim_id: $claim_id})
        SET c.claim_text  = $claim_text,
            c.predicate   = $predicate,
            c.segment     = $segment,
            c.confidence  = $confidence,
            c.updated_at  = datetime()
        ON CREATE SET c.created_at = datetime()
        RETURN c.claim_id AS node_id
        """
        async with self.session() as s:
            result = await s.run(cypher, claim_id=claim_id, claim_text=claim_text,
                                 predicate=predicate, segment=segment, confidence=confidence)
            record = await result.single()
            return record["node_id"]

    async def delete_claim_node(self, claim_id: str) -> None:
        cypher = "MATCH (c:Claim {claim_id: $claim_id}) DETACH DELETE c"
        async with self.session() as s:
            await s.run(cypher, claim_id=claim_id)

    # ── Relationships ──────────────────────────────────────────────────────────

    async def create_entity_relation(self, from_id: str, to_id: str,
                                     rel_type: str, properties: dict[str, Any] | None = None) -> None:
        props = properties or {}
        cypher = f"""
        MATCH (a:Entity {{entity_id: $from_id}})
        MATCH (b:Entity {{entity_id: $to_id}})
        MERGE (a)-[r:{rel_type}]->(b)
        SET r += $props, r.updated_at = datetime()
        ON CREATE SET r.created_at = datetime()
        """
        async with self.session() as s:
            await s.run(cypher, from_id=from_id, to_id=to_id, props=props)

    async def link_claim_to_entity(self, claim_id: str, entity_id: str,
                                   role: str = "SUBJECT") -> None:
        cypher = f"""
        MATCH (c:Claim  {{claim_id:  $claim_id}})
        MATCH (e:Entity {{entity_id: $entity_id}})
        MERGE (c)-[:{role}]->(e)
        """
        async with self.session() as s:
            await s.run(cypher, claim_id=claim_id, entity_id=entity_id)

    async def link_claim_to_source(self, claim_id: str, source_id: str) -> None:
        cypher = """
        MERGE (s:Source {source_id: $source_id})
        WITH s
        MATCH (c:Claim {claim_id: $claim_id})
        MERGE (c)-[:SUPPORTED_BY]->(s)
        """
        async with self.session() as s:
            await s.run(cypher, claim_id=claim_id, source_id=source_id)

    async def create_claim_relation(self, from_claim_id: str, to_claim_id: str,
                                    rel_type: str) -> None:
        cypher = f"""
        MATCH (a:Claim {{claim_id: $from_id}})
        MATCH (b:Claim {{claim_id: $to_id}})
        MERGE (a)-[:{rel_type}]->(b)
        ON CREATE SET r.created_at = datetime()
        """
        # note: MERGE doesn't bind r in ON CREATE without alias — use separate SET
        cypher = f"""
        MATCH (a:Claim {{claim_id: $from_id}})
        MATCH (b:Claim {{claim_id: $to_id}})
        MERGE (a)-[r:{rel_type}]->(b)
        ON CREATE SET r.created_at = datetime()
        """
        async with self.session() as s:
            await s.run(cypher, from_id=from_claim_id, to_id=to_claim_id)

    # ── Graph traversal ────────────────────────────────────────────────────────

    async def expand_entity(self, entity_id: str, hops: int = 2,
                            edge_types: list[str] | None = None,
                            limit: int = 50) -> dict[str, Any]:
        if edge_types:
            rel_filter = "|".join(edge_types)
            rel_clause = f"[*1..{hops}:{rel_filter}]"
        else:
            rel_clause = f"[*1..{hops}]"

        cypher = f"""
        MATCH (seed:Entity {{entity_id: $entity_id}})
        CALL {{
            WITH seed
            MATCH path = (seed)-{rel_clause}-(neighbor)
            RETURN nodes(path) AS ns, relationships(path) AS rs
            LIMIT $limit
        }}
        UNWIND ns AS n
        UNWIND rs AS r
        RETURN DISTINCT
            n.entity_id AS node_id, n.canonical_name AS name, n.entity_type AS type,
            type(r) AS rel_type,
            startNode(r).entity_id AS from_id,
            endNode(r).entity_id   AS to_id
        """
        nodes, edges = {}, []
        async with self.session() as s:
            result = await s.run(cypher, entity_id=entity_id, limit=limit)
            async for record in result:
                nid = record["node_id"]
                if nid:
                    nodes[nid] = {"entity_id": nid, "name": record["name"], "type": record["type"]}
                if record["from_id"] and record["to_id"]:
                    edges.append({
                        "from_id": record["from_id"],
                        "to_id": record["to_id"],
                        "type": record["rel_type"],
                    })
        return {"nodes": list(nodes.values()), "edges": edges}

    async def get_claims_for_entity(self, entity_id: str) -> list[dict[str, Any]]:
        cypher = """
        MATCH (c:Claim)-[:SUBJECT|:OBJECT]->(e:Entity {entity_id: $entity_id})
        RETURN c.claim_id AS claim_id, c.claim_text AS text,
               c.predicate AS predicate, c.confidence AS confidence
        LIMIT 100
        """
        claims = []
        async with self.session() as s:
            result = await s.run(cypher, entity_id=entity_id)
            async for record in result:
                claims.append(dict(record))
        return claims

    async def find_entity_by_name(self, name: str) -> list[dict[str, Any]]:
        cypher = """
        MATCH (e:Entity)
        WHERE e.canonical_name =~ $pattern OR $name IN e.aliases
        RETURN e.entity_id AS entity_id, e.canonical_name AS name,
               e.entity_type AS type, e.description AS description
        LIMIT 10
        """
        results = []
        async with self.session() as s:
            result = await s.run(cypher, pattern=f"(?i).*{name}.*", name=name)
            async for record in result:
                results.append(dict(record))
        return results

    async def run_cypher(self, cypher: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        results = []
        async with self.session() as s:
            result = await s.run(cypher, **(params or {}))
            async for record in result:
                results.append(dict(record))
        return results


# ── Module-level singleton ─────────────────────────────────────────────────────

_neo4j_client: Optional[Neo4jClient] = None


def get_neo4j() -> Neo4jClient:
    global _neo4j_client
    if _neo4j_client is None:
        _neo4j_client = Neo4jClient()
    return _neo4j_client
