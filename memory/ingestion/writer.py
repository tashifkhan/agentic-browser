"""Shared write path for claims and entities.

Two rules this module enforces:

1. Reconcile before insert (see reconcile.py), so a repeated fact adds
   support to the stored claim and a changed fact supersedes the old one.
2. Postgres is the record. OpenSearch and Neo4j writes are queued as
   `SideEffects` and run only after the Postgres transaction commits, so a
   failed transaction never leaves orphan search docs or graph nodes.
"""
from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Optional

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.clients.neo4j import get_neo4j
from core.clients.opensearch import IDX_CLAIMS, get_opensearch
from core.config import get_logger
from memory.ingestion.extractor import EXTRACTOR_VERSION, USER_ENTITY_NAME
from memory.ingestion.memory_gate import GateDecision, GateResult
from memory.ingestion.reconcile import Decision
from models.db.memory import ClaimORM, ClaimRelationORM, EntityORM, EvidenceORM
from models.memory import (
    CandidateClaim, CandidateEntity, ClaimRelationType, ClaimStatus, EvidenceType,
    MemoryClass, MemorySegment, MemoryTier, SEGMENT_DECAY_RATE,
)

logger = get_logger(__name__)

_HIGH_TRUST = {EvidenceType.USER_STATED, EvidenceType.USER_CONFIRMED}


# ── Deferred side effects ──────────────────────────────────────────────────────

@dataclass
class SideEffects:
    """Search-index and graph writes to run once Postgres has committed."""
    _ops: list[tuple[str, Callable[[], Awaitable[Any]]]] = field(default_factory=list)

    def add(self, label: str, op: Callable[[], Awaitable[Any]]) -> None:
        self._ops.append((label, op))

    def os(self, label: str, fn: Callable[..., Any], *args: Any, **kwargs: Any) -> None:
        """Queue a call on the (synchronous) OpenSearch client, run off the loop."""
        self.add(label, lambda: asyncio.to_thread(fn, *args, **kwargs))

    async def run(self) -> int:
        failed = 0
        for label, op in self._ops:
            try:
                await op()
            except Exception as exc:
                failed += 1
                logger.warning("Memory side effect %r failed: %s", label, exc)
        self._ops.clear()
        return failed


# ── Entities ───────────────────────────────────────────────────────────────────

async def upsert_entity(session: AsyncSession, cand: CandidateEntity,
                        effects: SideEffects | None = None,
                        embedding: list[float] | None = None) -> uuid.UUID:
    """Find an entity by name or alias, or create it.

    With `effects`, the Neo4j and OpenSearch writes are deferred until after
    commit. Without it (document and Gmail pipelines) they run inline, as
    before. Either way the entity's opensearch_id is set, which entity
    resolution relies on.
    """
    name = cand.canonical_name.strip()
    result = await session.execute(
        select(EntityORM).where(
            EntityORM.status != "deleted",
            or_(
                func.lower(EntityORM.canonical_name) == name.lower(),
                EntityORM.aliases.any(name),
            ),
        ).order_by(EntityORM.created_at.asc()).limit(1)
    )
    existing = result.scalar_one_or_none()
    if existing:
        merged = sorted(set(existing.aliases or []) | set(cand.aliases))
        if merged != sorted(existing.aliases or []):
            existing.aliases = merged
        if cand.description and not existing.description:
            existing.description = cand.description
        return existing.entity_id  # type: ignore[return-value]

    entity = EntityORM(
        entity_id=uuid.uuid4(),
        entity_type=cand.entity_type.value,
        canonical_name=name,
        description=cand.description,
        aliases=cand.aliases,
    )
    entity.opensearch_id = str(entity.entity_id)
    session.add(entity)
    await session.flush()

    eid = str(entity.entity_id)
    text = f"{name} {cand.description or ''} {' '.join(cand.aliases)}"

    async def _graph() -> None:
        await get_neo4j().upsert_entity(eid, cand.entity_type.value, name,
                                        cand.description or "", cand.aliases)

    async def _index() -> None:
        from memory import embeddings
        emb = embedding or (await embeddings.embed_documents([text]))[0]
        await asyncio.to_thread(get_opensearch().index_entity, eid, cand.entity_type.value,
                                name, cand.description or "", cand.aliases, emb)

    if effects is None:
        await _graph()
        await _index()
    else:
        effects.add(f"neo4j entity {name}", _graph)
        effects.add(f"index entity {name}", _index)
    return entity.entity_id  # type: ignore[return-value]


# ── Tiering ────────────────────────────────────────────────────────────────────

def infer_tier(cand: CandidateClaim, gate: GateResult | None = None) -> MemoryTier:
    """Pick a starting tier.

    Preferences only become permanent when the user stated them. An inferred
    preference starts long-term so it can still decay or be corrected.
    """
    stated = cand.evidence_type in _HIGH_TRUST
    if cand.segment == MemorySegment.PREFERENCES or cand.memory_class == MemoryClass.PROCEDURAL:
        if stated and (gate is None or gate.decision == GateDecision.STORE_AUTO):
            return MemoryTier.PERMANENT
        return MemoryTier.LONG_TERM
    if cand.segment in (MemorySegment.CORE_IDENTITY, MemorySegment.SKILLS, MemorySegment.PEOPLE):
        return MemoryTier.LONG_TERM
    return MemoryTier.SHORT_TERM


# ── Claims ─────────────────────────────────────────────────────────────────────

@dataclass
class ClaimInput:
    cand: CandidateClaim
    gate: GateResult
    embedding: list[float]
    decision: Decision
    tier: MemoryTier | None = None
    user_confirmed: bool = False


@dataclass
class WriteStats:
    inserted: list[str] = field(default_factory=list)
    duplicates: list[str] = field(default_factory=list)     # existing ids that got support
    superseded: list[str] = field(default_factory=list)
    contradictions: list[str] = field(default_factory=list)
    active: int = 0
    provisional: int = 0

    def as_dict(self) -> dict[str, Any]:
        return {
            "claims_auto": self.active,
            "claims_provisional": self.provisional,
            "claims_inserted": len(self.inserted),
            "claims_reinforced": len(self.duplicates),
            "claims_superseded": len(self.superseded),
            "contradictions": len(self.contradictions),
        }


async def write_claims(
    session: AsyncSession,
    items: list[ClaimInput],
    *,
    source_id: uuid.UUID,
    artifact_id: uuid.UUID | None,
    source_trust: float,
    entity_map: dict[str, uuid.UUID],
    effects: SideEffects,
    observed_at: datetime | None = None,
) -> tuple[WriteStats, list[ClaimORM | None]]:
    """Apply reconcile decisions inside `session`. Returns stats plus, per item,
    the claim row that now carries the fact (new or reinforced)."""
    now = observed_at or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    stats = WriteStats()
    rows: list[ClaimORM | None] = []

    for idx, item in enumerate(items):
        cand, gate, decision = item.cand, item.gate, item.decision

        # ── Same fact again: reinforce the stored claim ──────────────────────
        if decision.duplicate_of:
            target: ClaimORM | None
            if decision.duplicate_of.startswith("batch:"):
                target = rows[int(decision.duplicate_of.split(":", 1)[1])]
            else:
                target = await session.get(ClaimORM, uuid.UUID(decision.duplicate_of))
            if target is not None:
                await _reinforce(session, target, cand, gate, source_id, artifact_id, effects)
                stats.duplicates.append(str(target.claim_id))
                rows.append(target)
                continue

        # ── New claim ────────────────────────────────────────────────────────
        status = ClaimStatus.ACTIVE if gate.decision == GateDecision.STORE_AUTO else ClaimStatus.PROVISIONAL
        if decision.contradicts and cand.evidence_type not in _HIGH_TRUST:
            status = ClaimStatus.PROVISIONAL

        subj_id = entity_map.get(cand.subject_name.lower())
        obj_id = entity_map.get(cand.object_name.lower()) if cand.object_name else None
        tier = item.tier or infer_tier(cand, gate)
        claim = ClaimORM(
            claim_id=uuid.uuid4(),
            claim_text=cand.claim_text,
            subject_entity_id=subj_id,
            predicate=cand.predicate,
            object_entity_id=obj_id,
            object_literal=cand.object_name if cand.object_name and not obj_id else None,
            memory_class=cand.memory_class.value,
            tier=tier.value,
            segment=cand.segment.value,
            status=status.value,
            base_importance=gate.adjusted_importance,
            confidence=gate.adjusted_confidence,
            trust_score=source_trust,
            decay_rate=SEGMENT_DECAY_RATE.get(cand.segment, 0.01),
            valid_from=cand.valid_from or now,
            valid_to=cand.valid_to,
            user_confirmed=item.user_confirmed,
            contradiction_count=len(decision.contradicts),
        )
        claim.opensearch_id = str(claim.claim_id)
        session.add(claim)
        await session.flush()
        session.add(EvidenceORM(
            evidence_id=uuid.uuid4(), claim_id=claim.claim_id, source_id=source_id,
            artifact_id=artifact_id, evidence_type=cand.evidence_type.value,
            extractor_version=EXTRACTOR_VERSION, confidence=gate.adjusted_confidence,
        ))
        cid = str(claim.claim_id)
        stats.inserted.append(cid)
        if status == ClaimStatus.ACTIVE:
            stats.active += 1
        else:
            stats.provisional += 1

        effects.os(f"index claim {cid}", get_opensearch().index_claim,
                   cid, cand.claim_text, item.embedding, cand.segment.value,
                   cand.memory_class.value, tier.value, status.value,
                   gate.adjusted_confidence, gate.adjusted_importance, source_trust,
                   predicate=cand.predicate, user_confirmed=item.user_confirmed,
                   created_at=now.isoformat(), last_accessed_at=now.isoformat(),
                   valid_from=(cand.valid_from or now).isoformat(),
                   valid_to=cand.valid_to.isoformat() if cand.valid_to else None)
        effects.add(f"neo4j claim {cid}", _graph_claim(
            cid, cand, gate.adjusted_confidence, subj_id, obj_id, str(source_id)))

        # ── The fact changed: retire what it replaces ────────────────────────
        for old_id in decision.supersedes:
            old = await session.get(ClaimORM, uuid.UUID(old_id))
            if old is None or old.status in (ClaimStatus.SUPERSEDED.value, ClaimStatus.DELETED.value):
                continue
            old.status = ClaimStatus.SUPERSEDED.value
            old.valid_to = cand.valid_from or now
            await _relate(session, claim.claim_id, old.claim_id, ClaimRelationType.SUPERSEDES, effects)
            effects.os(f"supersede {old_id}", get_opensearch().update_document, IDX_CLAIMS, old_id,
                       {"status": ClaimStatus.SUPERSEDED.value, "valid_to": old.valid_to.isoformat()})
            stats.superseded.append(old_id)

        for other_id in decision.contradicts:
            other = await session.get(ClaimORM, uuid.UUID(other_id))
            if other is None:
                continue
            other.contradiction_count = (other.contradiction_count or 0) + 1
            await _relate(session, claim.claim_id, other.claim_id, ClaimRelationType.CONTRADICTS, effects)
            stats.contradictions.append(other_id)

        rows.append(claim)

    return stats, rows


async def _reinforce(session: AsyncSession, target: ClaimORM, cand: CandidateClaim,
                     gate: GateResult, source_id: uuid.UUID, artifact_id: uuid.UUID | None,
                     effects: SideEffects) -> None:
    """A second source for a stored fact: more support, slightly more confidence."""
    target.support_count = (target.support_count or 0) + 1
    ceiling = 1.0 if (target.user_confirmed or cand.evidence_type == EvidenceType.USER_CONFIRMED) else 0.95
    target.confidence = min(ceiling, max(target.confidence, gate.adjusted_confidence) + 0.05)
    target.base_importance = max(target.base_importance, gate.adjusted_importance)
    fields: dict[str, Any] = {"confidence": target.confidence,
                              "base_importance": target.base_importance}
    if target.status == ClaimStatus.PROVISIONAL.value and (
        cand.evidence_type in _HIGH_TRUST or target.support_count >= 2
    ):
        target.status = ClaimStatus.ACTIVE.value
        fields["status"] = target.status
    session.add(EvidenceORM(
        evidence_id=uuid.uuid4(), claim_id=target.claim_id, source_id=source_id,
        artifact_id=artifact_id, evidence_type=cand.evidence_type.value,
        extractor_version=EXTRACTOR_VERSION, confidence=gate.adjusted_confidence,
    ))
    effects.os(f"reinforce {target.claim_id}", get_opensearch().update_document,
               IDX_CLAIMS, str(target.claim_id), fields)
    effects.add(f"neo4j source link {target.claim_id}",
                lambda cid=str(target.claim_id), sid=str(source_id):
                get_neo4j().link_claim_to_source(cid, sid))


async def _relate(session: AsyncSession, from_id: uuid.UUID, to_id: uuid.UUID,
                  rel: ClaimRelationType, effects: SideEffects) -> None:
    existing = await session.execute(
        select(ClaimRelationORM.id).where(
            ClaimRelationORM.from_claim_id == from_id,
            ClaimRelationORM.to_claim_id == to_id,
            ClaimRelationORM.relation_type == rel.value,
        )
    )
    if existing.first() is None:
        session.add(ClaimRelationORM(from_claim_id=from_id, to_claim_id=to_id, relation_type=rel.value))
    effects.add(f"neo4j {rel.value}",
                lambda: get_neo4j().create_claim_relation(str(from_id), str(to_id), rel.value))


def _graph_claim(cid: str, cand: CandidateClaim, confidence: float,
                 subj_id: Optional[uuid.UUID], obj_id: Optional[uuid.UUID],
                 source_id: str) -> Callable[[], Awaitable[None]]:
    async def run() -> None:
        neo4j = get_neo4j()
        await neo4j.upsert_claim_node(cid, cand.claim_text, predicate=cand.predicate,
                                      segment=cand.segment.value, confidence=confidence)
        if subj_id:
            await neo4j.link_claim_to_entity(cid, str(subj_id), "SUBJECT")
        if obj_id:
            await neo4j.link_claim_to_entity(cid, str(obj_id), "OBJECT")
        await neo4j.link_claim_to_source(cid, source_id)
    return run


__all__ = [
    "ClaimInput", "SideEffects", "WriteStats", "infer_tier", "upsert_entity",
    "write_claims", "USER_ENTITY_NAME",
]
