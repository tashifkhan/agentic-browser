"""Chat ingestion pipeline: processes a user/assistant turn into memory."""
from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import get_logger
from core.db import get_session
from core.clients.neo4j import get_neo4j
from core.clients.opensearch import get_opensearch, IDX_CLAIMS, IDX_ARTIFACTS
from memory.ingestion.extractor import Extractor, EXTRACTOR_VERSION
from memory.ingestion.memory_gate import MemoryGate, GateDecision
from models.memory import (
    ClaimStatus, EvidenceType, MemoryTier, SourceType, SEGMENT_DECAY_RATE,
)
from models.db.memory import (
    ArtifactORM, ClaimORM, EntityORM, EvidenceORM, SourceORM,
)
from models.memory import (
    CandidateClaim, CandidateEntity, IngestChatRequest,
)

logger = get_logger(__name__)

_extractor = Extractor()
_gate      = MemoryGate()


class ChatIngestionPipeline:
    async def process(self, req: IngestChatRequest) -> dict:
        combined = f"User: {req.user_message}\n\nAssistant: {req.assistant_message}"

        async with get_session() as session:
            # 1. Persist source record
            source = SourceORM(
                source_id=uuid.uuid4(),
                source_type=SourceType.CHAT.value,
                external_id=req.session_id,
                title=f"Chat {req.timestamp.date()}",
                trust_level=9,
                created_at=req.timestamp,
                ingested_at=datetime.utcnow(),
            )
            session.add(source)
            await session.flush()

            # 2. Embed and store artifact
            embedding = _extractor.embed_one(combined)
            artifact = ArtifactORM(
                artifact_id=uuid.uuid4(),
                source_id=source.source_id,
                artifact_type="chat_turn",
                text=combined,
                parser_version=EXTRACTOR_VERSION,
            )
            session.add(artifact)
            await session.flush()

            get_opensearch().index_artifact(
                str(artifact.artifact_id), str(source.source_id),
                "chat_turn", combined, embedding,
                created_at=artifact.created_at.isoformat() if artifact.created_at else "",
            )

            # 3. Extract entities and claims
            result = _extractor.extract(
                combined, source_type="chat", trust_level=9,
                context="Personal AI assistant conversation",
            )

            # 4. Resolve entities → ORM rows
            entity_map: dict[str, uuid.UUID] = {}
            for cand in result.entities:
                eid = await _upsert_entity(session, cand)
                entity_map[cand.canonical_name.lower()] = eid

            # 5. Run gate and write claims
            stats = {"entities": len(entity_map), "claims_auto": 0, "claims_provisional": 0, "claims_rejected": 0}
            for cand, gate_result in _gate.evaluate_batch(result.claims, source_trust=result.source_trust, source_type="chat"):
                if gate_result.decision == GateDecision.REJECT:
                    stats["claims_rejected"] += 1
                    continue

                status = (ClaimStatus.ACTIVE if gate_result.decision == GateDecision.STORE_AUTO
                          else ClaimStatus.PROVISIONAL)

                # resolve entity IDs
                subj_id = entity_map.get(cand.subject_name.lower())
                obj_id  = entity_map.get(cand.object_name.lower()) if cand.object_name else None
                obj_lit = cand.object_name if cand.object_name and not obj_id else None

                tier = _infer_tier(cand)
                decay = SEGMENT_DECAY_RATE.get(cand.segment, 0.01)

                claim_orm = ClaimORM(
                    claim_id=uuid.uuid4(),
                    claim_text=cand.claim_text,
                    subject_entity_id=subj_id,
                    predicate=cand.predicate,
                    object_entity_id=obj_id,
                    object_literal=obj_lit,
                    memory_class=cand.memory_class.value,
                    tier=tier.value,
                    segment=cand.segment.value,
                    status=status.value,
                    base_importance=gate_result.adjusted_importance,
                    confidence=gate_result.adjusted_confidence,
                    trust_score=result.source_trust,
                    decay_rate=decay,
                    valid_from=cand.valid_from,
                    valid_to=cand.valid_to,
                )
                session.add(claim_orm)
                await session.flush()

                # evidence link
                ev = EvidenceORM(
                    evidence_id=uuid.uuid4(),
                    claim_id=claim_orm.claim_id,
                    source_id=source.source_id,
                    artifact_id=artifact.artifact_id,
                    evidence_type=cand.evidence_type.value,
                    extractor_version=EXTRACTOR_VERSION,
                    confidence=gate_result.adjusted_confidence,
                )
                session.add(ev)

                # vector index
                claim_emb = _extractor.embed_one(cand.claim_text)
                os_id = get_opensearch().index_claim(
                    str(claim_orm.claim_id), cand.claim_text, claim_emb,
                    cand.segment.value, cand.memory_class.value, tier.value,
                    status.value, gate_result.adjusted_confidence,
                    gate_result.adjusted_importance, result.source_trust,
                    predicate=cand.predicate,
                )
                claim_orm.opensearch_id = os_id

                # neo4j
                neo4j = get_neo4j()
                await neo4j.upsert_claim_node(
                    str(claim_orm.claim_id), cand.claim_text,
                    predicate=cand.predicate, segment=cand.segment.value,
                    confidence=gate_result.adjusted_confidence,
                )
                if subj_id:
                    await neo4j.link_claim_to_entity(str(claim_orm.claim_id), str(subj_id), "SUBJECT")
                if obj_id:
                    await neo4j.link_claim_to_entity(str(claim_orm.claim_id), str(obj_id), "OBJECT")
                await neo4j.link_claim_to_source(str(claim_orm.claim_id), str(source.source_id))

                if status == ClaimStatus.ACTIVE:
                    stats["claims_auto"] += 1
                else:
                    stats["claims_provisional"] += 1

        logger.info("Chat ingested: %s", stats)
        return stats


async def _upsert_entity(session: AsyncSession, cand: CandidateEntity) -> uuid.UUID:
    """Find existing entity by name/alias or create a new one."""
    result = await session.execute(
        select(EntityORM).where(
            EntityORM.canonical_name.ilike(cand.canonical_name)
        ).limit(1)
    )
    existing = result.scalar_one_or_none()
    if existing:
        # merge aliases
        new_aliases = list(set(existing.aliases or []) | set(cand.aliases))
        existing.aliases = new_aliases
        if cand.description and not existing.description:
            existing.description = cand.description
        return existing.entity_id  # type: ignore[return-value]

    entity = EntityORM(
        entity_id=uuid.uuid4(),
        entity_type=cand.entity_type.value,
        canonical_name=cand.canonical_name,
        description=cand.description,
        aliases=cand.aliases,
    )
    session.add(entity)
    await session.flush()

    # neo4j mirror
    neo4j = get_neo4j()
    await neo4j.upsert_entity(
        str(entity.entity_id), cand.entity_type.value,
        cand.canonical_name, cand.description or "", cand.aliases,
    )

    # opensearch
    emb = _extractor.embed_one(
        f"{cand.canonical_name} {cand.description or ''} {' '.join(cand.aliases)}"
    )
    get_opensearch().index_entity(
        str(entity.entity_id), cand.entity_type.value, cand.canonical_name,
        cand.description or "", cand.aliases, emb,
    )

    return entity.entity_id  # type: ignore[return-value]


def _infer_tier(cand: CandidateClaim) -> MemoryTier:
    from models.memory import MemorySegment, MemoryClass
    if cand.segment == MemorySegment.PREFERENCES or cand.memory_class == MemoryClass.PROCEDURAL:
        return MemoryTier.PERMANENT
    if cand.segment in (MemorySegment.CORE_IDENTITY, MemorySegment.SKILLS, MemorySegment.PEOPLE):
        return MemoryTier.LONG_TERM
    if cand.segment in (MemorySegment.PROJECTS, MemorySegment.COMMUNICATIONS):
        return MemoryTier.SHORT_TERM
    return MemoryTier.SHORT_TERM
