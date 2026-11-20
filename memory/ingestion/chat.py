"""Chat ingestion: turn one user/assistant exchange into memory.

Pipeline:
  1. Skip courtesy turns ("thanks!", "ok") without any LLM call.
  2. Extract claims from the USER message only. The assistant reply is passed
     as read-only context, so assistant explanations and promises never become
     facts about the user.
  3. Embed the turn, every claim and every entity in one batched request.
  4. Gate each claim, then reconcile it against stored claims
     (duplicate / update / contradiction).
  5. Write Postgres rows, commit, then index in OpenSearch and Neo4j.

Turns are processed one at a time (module lock), so two fast turns can't both
miss each other's claims during reconciliation.
"""
from __future__ import annotations

import asyncio
import re
import uuid
from datetime import datetime, timezone

from core.clients.opensearch import get_opensearch
from core.config import get_logger
from core.db import get_session
from memory import embeddings
from memory.ingestion.extractor import EXTRACTOR_VERSION, USER_ENTITY_NAME, Extractor
from memory.ingestion.memory_gate import GateDecision, MemoryGate
from memory.ingestion.reconcile import WRITE_LOCK, Reconciler
from memory.ingestion.writer import (
    ClaimInput, SideEffects, infer_tier, upsert_entity, write_claims,
)
from models.db.memory import ArtifactORM, SourceORM
from models.memory import CandidateClaim, CandidateEntity, EntityType, IngestChatRequest, SourceType

logger = get_logger(__name__)

_extractor = Extractor()
_gate = MemoryGate()
_reconciler = Reconciler()

_COURTESY = re.compile(
    r"^(thanks?( you)?|thank u|thx|ty|ok(ay)?|k|cool|nice|great|got it|sure|yes|yep|no|nope|"
    r"hi|hello|hey|bye|good (morning|night|evening)|lol|haha|perfect|awesome|done)[\s!.?,]*$",
    re.IGNORECASE,
)


def is_trivial_turn(user_message: str) -> bool:
    text = user_message.strip()
    return not text or len(text) < 3 or bool(_COURTESY.match(text))


class ChatIngestionPipeline:
    async def process(self, req: IngestChatRequest) -> dict:
        if is_trivial_turn(req.user_message):
            return {"skipped": "trivial turn", "entities": 0, "claims_auto": 0,
                    "claims_provisional": 0, "claims_rejected": 0}

        observed_at = req.timestamp if req.timestamp.tzinfo else req.timestamp.replace(tzinfo=timezone.utc)
        result = await _extractor.extract_chat_turn(
            req.user_message, req.assistant_message, reference_date=observed_at,
        )
        if result.failed:
            # Write nothing, so a retry starts clean (no orphan artifact).
            return {"extraction_failed": True, "entities": 0, "claims_auto": 0,
                    "claims_provisional": 0, "claims_rejected": 0}

        # Claims about the user need the User entity even when the model
        # didn't list it this turn.
        if any(c.subject_name == USER_ENTITY_NAME for c in result.claims) and not any(
            e.canonical_name == USER_ENTITY_NAME for e in result.entities
        ):
            result.entities.append(CandidateEntity(
                canonical_name=USER_ENTITY_NAME, entity_type=EntityType.PERSON,
                description="The person using the assistant", aliases=[],
            ))

        gated = []
        rejected = 0
        for cand, gate in _gate.evaluate_batch(result.claims, source_trust=result.source_trust,
                                               source_type="chat"):
            if gate.decision == GateDecision.REJECT:
                rejected += 1
                logger.info("Gate rejected %r: %s", cand.claim_text, gate.reason)
            else:
                gated.append((cand, gate))

        turn_text = f"User: {req.user_message}\n\nAssistant: {req.assistant_message}"
        texts = [turn_text] + [c.claim_text for c, _ in gated] + [_entity_text(e) for e in result.entities]
        vectors = await embeddings.embed_documents(texts)
        turn_vec = vectors[0]
        claim_vecs = vectors[1:1 + len(gated)]
        entity_vecs = vectors[1 + len(gated):]

        async with WRITE_LOCK:
            decisions = await _reconciler.plan([c for c, _ in gated], claim_vecs) if gated else []
            return await self._write(req, observed_at, result.entities, entity_vecs,
                                     gated, claim_vecs, decisions, turn_text, turn_vec,
                                     result.source_trust, rejected)

    async def _write(self, req, observed_at, entities: list[CandidateEntity], entity_vecs,
                     gated: list, claim_vecs, decisions, turn_text: str, turn_vec,
                     source_trust: float, rejected: int) -> dict:
        effects = SideEffects()
        async with get_session() as session:
            source = SourceORM(
                source_id=uuid.uuid4(),
                source_type=SourceType.CHAT.value,
                external_id=req.session_id,
                title=f"Chat {observed_at.date()}",
                trust_level=9,
                created_at=observed_at,
                ingested_at=datetime.now(timezone.utc),
            )
            session.add(source)
            artifact = ArtifactORM(
                artifact_id=uuid.uuid4(),
                source_id=source.source_id,
                artifact_type="chat_turn",
                text=turn_text,
                parser_version=EXTRACTOR_VERSION,
            )
            session.add(artifact)
            await session.flush()
            effects.os("index chat turn", get_opensearch().index_artifact,
                       str(artifact.artifact_id), str(source.source_id), "chat_turn",
                       turn_text, turn_vec, created_at=observed_at.isoformat())

            entity_map: dict[str, uuid.UUID] = {}
            for cand, vec in zip(entities, entity_vecs):
                eid = await upsert_entity(session, cand, effects, embedding=vec)
                entity_map[cand.canonical_name.lower()] = eid
                for alias in cand.aliases:
                    entity_map.setdefault(alias.lower(), eid)

            items = [
                ClaimInput(cand=c, gate=g, embedding=v, decision=d, tier=infer_tier(c, g))
                for (c, g), v, d in zip(gated, claim_vecs, decisions)
            ]
            stats, _rows = await write_claims(
                session, items, source_id=source.source_id, artifact_id=artifact.artifact_id,
                source_trust=source_trust, entity_map=entity_map, effects=effects,
                observed_at=observed_at,
            )

        # Postgres has committed; now the search index and the graph.
        failed = await effects.run()
        out = {"entities": len(entity_map), "claims_rejected": rejected, **stats.as_dict()}
        if failed:
            out["index_failures"] = failed
        logger.info("Chat ingested: %s", out)
        return out


def _entity_text(e: CandidateEntity) -> str:
    return f"{e.canonical_name} {e.description or ''} {' '.join(e.aliases)}"


# Kept for the document and Gmail pipelines, which import these names.
async def _upsert_entity(session, cand: CandidateEntity) -> uuid.UUID:
    return await upsert_entity(session, cand)


def _infer_tier(cand: CandidateClaim):
    return infer_tier(cand)
