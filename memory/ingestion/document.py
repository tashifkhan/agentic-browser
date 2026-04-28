"""Document ingestion pipeline: PDF, DOCX, plain text.
Handles resume detection and section-aware chunking.
"""
from __future__ import annotations
import io
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from core.config import get_logger
from memory.db.postgres import get_session
from memory.db.neo4j_client import get_neo4j
from memory.db.opensearch_client import get_opensearch
from memory.ingestion.chat import _upsert_entity, _infer_tier
from memory.ingestion.extractor import Extractor, EXTRACTOR_VERSION
from memory.ingestion.memory_gate import MemoryGate, GateDecision
from memory.models.enums import ClaimStatus, EvidenceType, MemoryTier, SourceType, SEGMENT_DECAY_RATE
from memory.models.orm import ArtifactORM, ClaimORM, EntityORM, EvidenceORM, SourceORM
from memory.models.schemas import IngestDocumentResult

logger = get_logger(__name__)

_extractor = Extractor()
_gate      = MemoryGate()

CHUNK_SIZE   = 1200  # chars
CHUNK_OVERLAP = 200

# Resume section headers (regex patterns)
_RESUME_SECTIONS = re.compile(
    r"^\s*(education|experience|skills?|projects?|publications?|certifications?|awards?|summary|objective|interests?)\s*$",
    re.IGNORECASE | re.MULTILINE,
)


def _extract_text_pdf(data: bytes) -> str:
    from pdfminer.high_level import extract_text
    return extract_text(io.BytesIO(data))


def _extract_text_docx(data: bytes) -> str:
    from docx import Document
    doc = Document(io.BytesIO(data))
    return "\n".join(p.text for p in doc.paragraphs)


def _extract_text_plain(data: bytes) -> str:
    return data.decode("utf-8", errors="replace")


def _split_chunks(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping character-level chunks."""
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return [c for c in chunks if c.strip()]


def _is_resume(text: str, filename: str = "") -> bool:
    fn = filename.lower()
    if any(kw in fn for kw in ("resume", "cv", "curriculum")):
        return True
    matches = _RESUME_SECTIONS.findall(text)
    return len(matches) >= 3


def _split_resume_sections(text: str) -> list[tuple[str, str]]:
    """Return list of (section_title, section_text) pairs."""
    boundaries = [(m.start(), m.group().strip()) for m in _RESUME_SECTIONS.finditer(text)]
    if not boundaries:
        return [("full", text)]
    sections = []
    for i, (start, title) in enumerate(boundaries):
        end = boundaries[i + 1][0] if i + 1 < len(boundaries) else len(text)
        sections.append((title.lower(), text[start:end]))
    return sections


class DocumentIngestionPipeline:
    async def ingest_bytes(
        self,
        data: bytes,
        filename: str,
        mimetype: str = "application/octet-stream",
        title: Optional[str] = None,
        author: Optional[str] = None,
        trust_level: int = 7,
    ) -> IngestDocumentResult:
        # ── Extract raw text ──────────────────────────────────────────────────
        if mimetype == "application/pdf" or filename.endswith(".pdf"):
            raw_text = _extract_text_pdf(data)
            source_type = SourceType.RESUME_PDF
        elif mimetype in ("application/vnd.openxmlformats-officedocument.wordprocessingml.document",) or filename.endswith(".docx"):
            raw_text = _extract_text_docx(data)
            source_type = SourceType.DOCUMENT
        else:
            raw_text = _extract_text_plain(data)
            source_type = SourceType.DOCUMENT

        is_resume = _is_resume(raw_text, filename)
        if is_resume:
            source_type = SourceType.RESUME_PDF

        async with get_session() as session:
            # ── Persist source ────────────────────────────────────────────────
            source = SourceORM(
                source_id=uuid.uuid4(),
                source_type=source_type.value,
                title=title or filename,
                author=author,
                trust_level=trust_level,
                checksum=str(hash(data)),
                ingested_at=datetime.utcnow(),
            )
            session.add(source)
            await session.flush()

            # ── Chunk and index artifacts ─────────────────────────────────────
            if is_resume:
                sections = _split_resume_sections(raw_text)
                chunks: list[tuple[str, str]] = [
                    (sec_title, chunk)
                    for sec_title, sec_text in sections
                    for chunk in _split_chunks(sec_text, chunk_size=800, overlap=100)
                ]
            else:
                chunks = [("document", c) for c in _split_chunks(raw_text)]

            artifacts_created = 0
            entities_created = 0
            claims_auto = 0
            claims_provisional = 0
            entity_map: dict[str, uuid.UUID] = {}

            for sec_title, chunk_text in chunks:
                if not chunk_text.strip():
                    continue

                chunk_emb = _extractor.embed_one(chunk_text)
                char_start = raw_text.find(chunk_text[:80])
                artifact = ArtifactORM(
                    artifact_id=uuid.uuid4(),
                    source_id=source.source_id,
                    artifact_type=f"chunk_{sec_title}",
                    text=chunk_text,
                    char_start=char_start if char_start >= 0 else None,
                    char_end=(char_start + len(chunk_text)) if char_start >= 0 else None,
                    parser_version=EXTRACTOR_VERSION,
                )
                session.add(artifact)
                await session.flush()

                get_opensearch().index_artifact(
                    str(artifact.artifact_id), str(source.source_id),
                    artifact.artifact_type, chunk_text, chunk_emb,
                )
                artifacts_created += 1

                # context hints for resume
                context = f"This is from a {'resume' if is_resume else 'document'} section: {sec_title}"
                result = _extractor.extract(
                    chunk_text,
                    source_type=source_type.value,
                    trust_level=trust_level,
                    context=context,
                )

                for cand in result.entities:
                    name_key = cand.canonical_name.lower()
                    if name_key not in entity_map:
                        eid = await _upsert_entity(session, cand)
                        entity_map[name_key] = eid
                        entities_created += 1

                for cand, gate_result in _gate.evaluate_batch(
                    result.claims, source_trust=result.source_trust, source_type=source_type.value
                ):
                    if gate_result.decision == GateDecision.REJECT:
                        continue

                    status = (ClaimStatus.ACTIVE if gate_result.decision == GateDecision.STORE_AUTO
                              else ClaimStatus.PROVISIONAL)

                    # Resume claims start as long_term, not permanent — they may become stale
                    tier = MemoryTier.LONG_TERM if is_resume else _infer_tier(cand)
                    decay = SEGMENT_DECAY_RATE.get(cand.segment, 0.01)

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
                        valid_from=cand.valid_from,
                        valid_to=cand.valid_to,
                    )
                    session.add(claim_orm)
                    await session.flush()

                    ev = EvidenceORM(
                        evidence_id=uuid.uuid4(),
                        claim_id=claim_orm.claim_id,
                        source_id=source.source_id,
                        artifact_id=artifact.artifact_id,
                        span_start=artifact.char_start,
                        span_end=artifact.char_end,
                        evidence_type=cand.evidence_type.value,
                        extractor_version=EXTRACTOR_VERSION,
                        confidence=gate_result.adjusted_confidence,
                    )
                    session.add(ev)

                    # vector index
                    claim_emb = _extractor.embed_one(cand.claim_text)
                    get_opensearch().index_claim(
                        str(claim_orm.claim_id), cand.claim_text, claim_emb,
                        cand.segment.value, cand.memory_class.value, tier.value,
                        status.value, gate_result.adjusted_confidence,
                        gate_result.adjusted_importance, result.source_trust,
                        predicate=cand.predicate,
                    )

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
                        claims_auto += 1
                    else:
                        claims_provisional += 1

            # Full-document summary artifact
            if len(raw_text) > 500:
                summary = _extractor.summarize(raw_text, max_sentences=5)
                sum_emb = _extractor.embed_one(summary)
                sum_artifact = ArtifactORM(
                    artifact_id=uuid.uuid4(),
                    source_id=source.source_id,
                    artifact_type="document_summary",
                    text=summary,
                    parser_version=EXTRACTOR_VERSION,
                )
                session.add(sum_artifact)
                await session.flush()
                get_opensearch().index_artifact(
                    str(sum_artifact.artifact_id), str(source.source_id),
                    "document_summary", summary, sum_emb,
                )
                artifacts_created += 1

        return IngestDocumentResult(
            source_id=source.source_id,
            artifacts_created=artifacts_created,
            entities_created=entities_created,
            claims_created=claims_auto,
            claims_provisional=claims_provisional,
        )
