"""Gmail ingestion pipeline.
Fetches threads via the Gmail API, reconstructs threads,
and extracts entities/claims with trust-aware classification.
"""
from __future__ import annotations
import base64
import re
import uuid
from datetime import datetime, timezone
from email import message_from_bytes
from typing import Any, Optional

from core.config import get_logger
from memory.db.postgres import get_session
from memory.db.neo4j_client import get_neo4j
from memory.db.opensearch_client import get_opensearch
from memory.ingestion.chat import _upsert_entity, _infer_tier
from memory.ingestion.extractor import Extractor, EXTRACTOR_VERSION
from memory.ingestion.memory_gate import MemoryGate, GateDecision
from memory.models.enums import ClaimStatus, MemoryTier, SourceType, SEGMENT_DECAY_RATE
from memory.models.orm import ArtifactORM, ClaimORM, EvidenceORM, SourceORM
from memory.models.schemas import GmailSyncResult

logger = get_logger(__name__)

_extractor = Extractor()
_gate      = MemoryGate()

# Trust levels by email direction
_OUTGOING_TRUST = 9   # emails the user sent — high trust for user intent
_INCOMING_TRUST = 4   # emails received — treat as external data


def _build_gmail_service(credentials_json: dict[str, Any]):
    """Build Gmail API service from OAuth credentials dict."""
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    creds = Credentials(
        token=credentials_json.get("access_token"),
        refresh_token=credentials_json.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=credentials_json.get("client_id"),
        client_secret=credentials_json.get("client_secret"),
        scopes=["https://www.googleapis.com/auth/gmail.readonly"],
    )
    return build("gmail", "v1", credentials=creds)


def _decode_body(payload: dict[str, Any]) -> str:
    """Recursively decode Gmail payload body."""
    mime_type = payload.get("mimeType", "")
    if mime_type == "text/plain":
        data = payload.get("body", {}).get("data", "")
        if data:
            return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")
    if "parts" in payload:
        parts = payload["parts"]
        for part in parts:
            decoded = _decode_body(part)
            if decoded:
                return decoded
    return ""


def _strip_quoted(text: str) -> str:
    """Remove quoted reply blocks (lines starting with >) and signatures."""
    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith(">"):
            continue
        if re.match(r"^--\s*$", stripped):  # signature delimiter
            break
        lines.append(line)
    return "\n".join(lines).strip()


def _parse_message(msg_data: dict[str, Any]) -> dict[str, Any]:
    payload = msg_data.get("payload", {})
    headers = {h["name"].lower(): h["value"] for h in payload.get("headers", [])}
    raw_body = _decode_body(payload)
    body = _strip_quoted(raw_body)

    ts_ms = int(msg_data.get("internalDate", 0))
    ts = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc) if ts_ms else datetime.utcnow()

    return {
        "message_id": msg_data.get("id", ""),
        "thread_id": msg_data.get("threadId", ""),
        "subject": headers.get("subject", ""),
        "from_addr": headers.get("from", ""),
        "to_addr": headers.get("to", ""),
        "date": ts,
        "body": body,
        "snippet": msg_data.get("snippet", ""),
    }


class GmailIngestionPipeline:
    def __init__(self, user_email: str) -> None:
        self.user_email = user_email.lower()

    def _is_outgoing(self, from_addr: str) -> bool:
        return self.user_email in from_addr.lower()

    async def sync(
        self,
        credentials_json: dict[str, Any],
        max_threads: int = 50,
        label_ids: Optional[list[str]] = None,
    ) -> GmailSyncResult:
        service = _build_gmail_service(credentials_json)
        threads_processed = 0
        entities_created = 0
        claims_created = 0
        claims_provisional = 0

        # List threads
        list_params: dict[str, Any] = {"userId": "me", "maxResults": max_threads}
        if label_ids:
            list_params["labelIds"] = label_ids

        thread_list = service.users().threads().list(**list_params).execute()
        threads = thread_list.get("threads", [])

        for thread_meta in threads:
            thread_id = thread_meta["id"]
            try:
                stats = await self._process_thread(service, thread_id)
                entities_created  += stats["entities"]
                claims_created    += stats["claims_auto"]
                claims_provisional+= stats["claims_provisional"]
                threads_processed += 1
            except Exception as exc:
                logger.warning("Failed to process thread %s: %s", thread_id, exc)

        return GmailSyncResult(
            threads_processed=threads_processed,
            entities_created=entities_created,
            claims_created=claims_created,
            claims_provisional=claims_provisional,
        )

    async def _process_thread(self, service: Any, thread_id: str) -> dict:
        thread_data = service.users().threads().get(
            userId="me", id=thread_id, format="full"
        ).execute()

        messages = [_parse_message(m) for m in thread_data.get("messages", [])]
        if not messages:
            return {"entities": 0, "claims_auto": 0, "claims_provisional": 0}

        subject = messages[0].get("subject", "")
        participants = list({m["from_addr"] for m in messages} | {m["to_addr"] for m in messages})
        participants = [p for p in participants if p]

        # Build thread text for summarization
        thread_text = f"Subject: {subject}\n\n"
        for m in messages:
            direction = "User" if self._is_outgoing(m["from_addr"]) else "Contact"
            thread_text += f"[{direction}] {m['from_addr']} ({m['date'].date()}):\n{m['body']}\n\n"

        async with get_session() as session:
            # Source per thread
            source = SourceORM(
                source_id=uuid.uuid4(),
                source_type=SourceType.EMAIL.value,
                external_id=thread_id,
                title=subject or f"Thread {thread_id}",
                author=messages[0]["from_addr"] if messages else None,
                trust_level=_INCOMING_TRUST,
                ingested_at=datetime.utcnow(),
            )
            session.add(source)
            await session.flush()

            entity_map: dict[str, uuid.UUID] = {}
            stats = {"entities": 0, "claims_auto": 0, "claims_provisional": 0}

            # Summary artifact
            summary_text = _extractor.summarize(thread_text, max_sentences=4)
            sum_emb = _extractor.embed_one(summary_text)
            sum_artifact = ArtifactORM(
                artifact_id=uuid.uuid4(),
                source_id=source.source_id,
                artifact_type="thread_summary",
                text=summary_text,
                parser_version=EXTRACTOR_VERSION,
            )
            session.add(sum_artifact)
            await session.flush()
            get_opensearch().index_artifact(
                str(sum_artifact.artifact_id), str(source.source_id),
                "thread_summary", summary_text, sum_emb,
            )

            # Process each message individually with appropriate trust level
            for msg in messages:
                if not msg["body"].strip():
                    continue

                trust = _OUTGOING_TRUST if self._is_outgoing(msg["from_addr"]) else _INCOMING_TRUST

                msg_artifact = ArtifactORM(
                    artifact_id=uuid.uuid4(),
                    source_id=source.source_id,
                    artifact_type="email_message",
                    text=msg["body"],
                    parser_version=EXTRACTOR_VERSION,
                )
                session.add(msg_artifact)
                await session.flush()

                msg_emb = _extractor.embed_one(msg["body"])
                get_opensearch().index_artifact(
                    str(msg_artifact.artifact_id), str(source.source_id),
                    "email_message", msg["body"], msg_emb,
                    created_at=msg["date"].isoformat(),
                )

                context = (
                    f"Email thread subject: {subject}. "
                    f"Direction: {'outgoing from user' if self._is_outgoing(msg['from_addr']) else 'incoming'}. "
                    f"Participants: {', '.join(participants[:5])}. "
                    "Extract commitments, facts about people, project mentions, and user preferences ONLY."
                )
                result = _extractor.extract(
                    msg["body"],
                    source_type="email",
                    trust_level=trust,
                    context=context,
                )

                for cand in result.entities:
                    name_key = cand.canonical_name.lower()
                    if name_key not in entity_map:
                        eid = await _upsert_entity(session, cand)
                        entity_map[name_key] = eid
                        stats["entities"] += 1

                for cand, gate_result in _gate.evaluate_batch(
                    result.claims, source_trust=result.source_trust, source_type="email"
                ):
                    if gate_result.decision == GateDecision.REJECT:
                        continue

                    status = (ClaimStatus.ACTIVE if gate_result.decision == GateDecision.STORE_AUTO
                              else ClaimStatus.PROVISIONAL)

                    tier = _infer_tier(cand)
                    decay = SEGMENT_DECAY_RATE.get(cand.segment, 0.05)

                    subj_id = entity_map.get(cand.subject_name.lower())
                    obj_id  = entity_map.get(cand.object_name.lower()) if cand.object_name else None
                    obj_lit = cand.object_name if cand.object_name and not obj_id else None

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
                        valid_from=msg["date"],
                        valid_to=cand.valid_to,
                    )
                    session.add(claim_orm)
                    await session.flush()

                    ev = EvidenceORM(
                        evidence_id=uuid.uuid4(),
                        claim_id=claim_orm.claim_id,
                        source_id=source.source_id,
                        artifact_id=msg_artifact.artifact_id,
                        evidence_type=cand.evidence_type.value,
                        extractor_version=EXTRACTOR_VERSION,
                        confidence=gate_result.adjusted_confidence,
                    )
                    session.add(ev)

                    claim_emb = _extractor.embed_one(cand.claim_text)
                    get_opensearch().index_claim(
                        str(claim_orm.claim_id), cand.claim_text, claim_emb,
                        cand.segment.value, cand.memory_class.value, tier.value,
                        status.value, gate_result.adjusted_confidence,
                        gate_result.adjusted_importance, result.source_trust,
                        predicate=cand.predicate,
                    )

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

        return stats
