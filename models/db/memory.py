from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Integer,
    SmallInteger, String, Text, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


def _uuid():
    return str(uuid.uuid4())


class SourceORM(Base):
    __tablename__ = "sources"

    source_id   = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_type = Column(String(32), nullable=False)
    external_id = Column(Text)
    title       = Column(Text)
    author      = Column(Text)
    trust_level = Column(SmallInteger, nullable=False, default=5)
    raw_uri     = Column(Text)
    checksum    = Column(Text)
    created_at  = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    ingested_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    metadata_   = Column("metadata", JSONB, nullable=False, default=dict)

    artifacts = relationship("ArtifactORM", back_populates="source", cascade="all, delete-orphan")
    evidence  = relationship("EvidenceORM",  back_populates="source")


class ArtifactORM(Base):
    __tablename__ = "artifacts"

    artifact_id      = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_id        = Column(UUID(as_uuid=True), ForeignKey("sources.source_id", ondelete="CASCADE"), nullable=False)
    artifact_type    = Column(Text, nullable=False)
    text             = Column(Text, nullable=False)
    char_start       = Column(Integer)
    char_end         = Column(Integer)
    parser_version   = Column(Text)
    opensearch_id    = Column(Text)
    created_at       = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    source   = relationship("SourceORM", back_populates="artifacts")
    evidence = relationship("EvidenceORM", back_populates="artifact")


class EntityORM(Base):
    __tablename__ = "entities"

    entity_id      = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_type    = Column(String(32), nullable=False)
    canonical_name = Column(Text, nullable=False)
    description    = Column(Text)
    aliases        = Column(ARRAY(Text), nullable=False, default=list)
    opensearch_id  = Column(Text)
    neo4j_node_id  = Column(Text)
    status         = Column(Text, nullable=False, default="active")
    created_at     = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at     = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    subject_claims = relationship("ClaimORM", foreign_keys="ClaimORM.subject_entity_id", back_populates="subject_entity")
    object_claims  = relationship("ClaimORM", foreign_keys="ClaimORM.object_entity_id",  back_populates="object_entity")


class ClaimORM(Base):
    __tablename__ = "claims"

    claim_id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    claim_text          = Column(Text, nullable=False)
    subject_entity_id   = Column(UUID(as_uuid=True), ForeignKey("entities.entity_id", ondelete="SET NULL"))
    predicate           = Column(Text)
    object_entity_id    = Column(UUID(as_uuid=True), ForeignKey("entities.entity_id", ondelete="SET NULL"))
    object_literal      = Column(Text)
    memory_class        = Column(String(32), nullable=False)
    tier                = Column(String(32), nullable=False, default="short_term")
    segment             = Column(String(64), nullable=False)
    status              = Column(String(32), nullable=False, default="active")
    base_importance     = Column(Float, nullable=False, default=0.5)
    confidence          = Column(Float, nullable=False, default=0.5)
    trust_score         = Column(Float, nullable=False, default=0.5)
    decay_rate          = Column(Float, nullable=False, default=0.01)
    access_count        = Column(Integer, nullable=False, default=0)
    retrieval_hit_count = Column(Integer, nullable=False, default=0)
    support_count       = Column(Integer, nullable=False, default=0)
    contradiction_count = Column(Integer, nullable=False, default=0)
    user_confirmed      = Column(Boolean, nullable=False, default=False)
    source_priority     = Column(SmallInteger, nullable=False, default=5)
    valid_from          = Column(DateTime(timezone=True))
    valid_to            = Column(DateTime(timezone=True))
    created_at          = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    last_accessed_at    = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at          = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    neo4j_node_id       = Column(Text)
    opensearch_id       = Column(Text)

    subject_entity = relationship("EntityORM", foreign_keys=[subject_entity_id], back_populates="subject_claims")
    object_entity  = relationship("EntityORM", foreign_keys=[object_entity_id],  back_populates="object_claims")
    evidence       = relationship("EvidenceORM", back_populates="claim", cascade="all, delete-orphan")

    from_relations = relationship("ClaimRelationORM", foreign_keys="ClaimRelationORM.from_claim_id", back_populates="from_claim", cascade="all, delete-orphan")
    to_relations   = relationship("ClaimRelationORM", foreign_keys="ClaimRelationORM.to_claim_id",   back_populates="to_claim",   cascade="all, delete-orphan")


class EvidenceORM(Base):
    __tablename__ = "evidence"

    evidence_id       = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    claim_id          = Column(UUID(as_uuid=True), ForeignKey("claims.claim_id", ondelete="CASCADE"), nullable=False)
    source_id         = Column(UUID(as_uuid=True), ForeignKey("sources.source_id", ondelete="CASCADE"), nullable=False)
    artifact_id       = Column(UUID(as_uuid=True), ForeignKey("artifacts.artifact_id", ondelete="SET NULL"))
    span_start        = Column(Integer)
    span_end          = Column(Integer)
    evidence_type     = Column(String(32), nullable=False, default="extracted")
    extractor_version = Column(Text)
    confidence        = Column(Float, nullable=False, default=0.5)
    created_at        = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    claim    = relationship("ClaimORM",    back_populates="evidence")
    source   = relationship("SourceORM",   back_populates="evidence")
    artifact = relationship("ArtifactORM", back_populates="evidence")


class ClaimRelationORM(Base):
    __tablename__ = "claim_relations"
    __table_args__ = (
        UniqueConstraint("from_claim_id", "to_claim_id", "relation_type"),
    )

    id            = Column(Integer, primary_key=True, autoincrement=True)
    from_claim_id = Column(UUID(as_uuid=True), ForeignKey("claims.claim_id", ondelete="CASCADE"), nullable=False)
    to_claim_id   = Column(UUID(as_uuid=True), ForeignKey("claims.claim_id", ondelete="CASCADE"), nullable=False)
    relation_type = Column(Text, nullable=False)
    created_at    = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    from_claim = relationship("ClaimORM", foreign_keys=[from_claim_id], back_populates="from_relations")
    to_claim   = relationship("ClaimORM", foreign_keys=[to_claim_id],   back_populates="to_relations")


class RetrievalLogORM(Base):
    __tablename__ = "retrieval_log"

    retrieval_id       = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    query_text         = Column(Text)
    query_embedding_id = Column(Text)
    claim_id           = Column(UUID(as_uuid=True), ForeignKey("claims.claim_id", ondelete="SET NULL"))
    artifact_id        = Column(UUID(as_uuid=True), ForeignKey("artifacts.artifact_id", ondelete="SET NULL"))
    returned           = Column(Boolean, nullable=False, default=True)
    used_in_answer     = Column(Boolean, nullable=False, default=False)
    retrieval_score    = Column(Float)
    user_feedback      = Column(SmallInteger)
    outcome_score      = Column(Float)
    created_at         = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class FeedbackEventORM(Base):
    __tablename__ = "feedback_events"

    feedback_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kind        = Column(String(32), nullable=False)
    claim_id    = Column(UUID(as_uuid=True), ForeignKey("claims.claim_id", ondelete="SET NULL"))
    comment     = Column(Text)
    created_at  = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class MaintenanceRunORM(Base):
    __tablename__ = "maintenance_runs"

    run_id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_type        = Column(Text, nullable=False)
    status          = Column(Text, nullable=False, default="running")
    claims_reviewed = Column(Integer)
    claims_updated  = Column(Integer)
    claims_archived = Column(Integer)
    error           = Column(Text)
    started_at      = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    finished_at     = Column(DateTime(timezone=True))
