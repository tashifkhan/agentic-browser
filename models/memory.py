from __future__ import annotations
from datetime import datetime
from enum import Enum
from typing import Any, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class SourceType(str, Enum):
    CHAT = "chat"
    EMAIL = "email"
    RESUME_PDF = "resume_pdf"
    DOCUMENT = "document"
    CALENDAR = "calendar"
    MANUAL = "manual"
    SYSTEM = "system"


class MemoryClass(str, Enum):
    WORKING = "working"
    EPISODIC = "episodic"
    SEMANTIC = "semantic"
    PROCEDURAL = "procedural"
    SOCIAL = "social"
    REFLECTIVE = "reflective"


class MemoryTier(str, Enum):
    WORKING = "working"
    SHORT_TERM = "short_term"
    LONG_TERM = "long_term"
    PERMANENT = "permanent"


class MemorySegment(str, Enum):
    CORE_IDENTITY = "core_identity"
    PREFERENCES = "preferences_and_corrections"
    PROJECTS = "projects_and_goals"
    PEOPLE = "people_and_relationships"
    SKILLS = "skills_and_background"
    COMMUNICATIONS = "communications_and_commitments"
    CONTEXTUAL = "contextual_incidents"
    REFLECTIONS = "reflections_and_summaries"


class ClaimStatus(str, Enum):
    ACTIVE = "active"
    PROVISIONAL = "provisional"
    SUPERSEDED = "superseded"
    STALE = "stale"
    ARCHIVED = "archived"
    DELETED = "deleted"


class EntityType(str, Enum):
    PERSON = "person"
    ORGANIZATION = "organization"
    PROJECT = "project"
    SKILL = "skill"
    PREFERENCE = "preference"
    CONSTRAINT = "constraint"
    TASK = "task"
    EVENT = "event"
    DOCUMENT = "document"
    TOPIC = "topic"
    LOCATION = "location"
    EMAIL_THREAD = "email_thread"
    RESUME_SECTION = "resume_section"


class EvidenceType(str, Enum):
    EXTRACTED = "extracted"
    INFERRED = "inferred"
    USER_STATED = "user_stated"
    USER_CONFIRMED = "user_confirmed"
    SYSTEM_DERIVED = "system_derived"


class FeedbackKind(str, Enum):
    EXPLICIT_CORRECTION = "explicit_correction"
    THUMBS_UP = "thumbs_up"
    THUMBS_DOWN = "thumbs_down"
    EDIT = "edit"
    IGNORED = "ignored"
    CONFIRMED = "confirmed"


class QueryType(str, Enum):
    CONVERSATIONAL = "conversational"
    FACTUAL_RECALL = "factual_recall"
    RELATIONAL = "relational"
    TEMPORAL = "temporal"
    PLANNING = "planning"
    EMAIL_SPECIFIC = "email_specific"
    PROFILE = "profile"
    PREFERENCE_SENSITIVE = "preference_sensitive"
    ACTION_TASK = "action_task"


class ClaimRelationType(str, Enum):
    SUPERSEDES = "SUPERSEDES"
    CONTRADICTS = "CONTRADICTS"
    SUPPORTS = "SUPPORTS"


class MaintenanceRunType(str, Enum):
    MICRO_REFLECTION = "micro_reflection"
    HOURLY = "hourly"
    NIGHTLY = "nightly"
    WEEKLY = "weekly"


class DecayProfile(str, Enum):
    NONE = "none"
    SLOW = "slow"
    MEDIUM = "medium"
    FAST = "fast"


TIER_DECAY_RATE: dict[MemoryTier, float] = {
    MemoryTier.WORKING: 0.15,
    MemoryTier.SHORT_TERM: 0.03,
    MemoryTier.LONG_TERM: 0.005,
    MemoryTier.PERMANENT: 0.0,
}


SEGMENT_DECAY_RATE: dict[MemorySegment, float] = {
    MemorySegment.PREFERENCES: 0.0,
    MemorySegment.CORE_IDENTITY: 0.001,
    MemorySegment.SKILLS: 0.002,
    MemorySegment.PROJECTS: 0.01,
    MemorySegment.PEOPLE: 0.003,
    MemorySegment.COMMUNICATIONS: 0.05,
    MemorySegment.CONTEXTUAL: 0.1,
    MemorySegment.REFLECTIONS: 0.002,
}


# ── Core domain schemas ────────────────────────────────────────────────────────

class SourceSchema(BaseModel):
    source_id: UUID = Field(default_factory=uuid4)
    source_type: SourceType
    external_id: Optional[str] = None
    title: Optional[str] = None
    author: Optional[str] = None
    trust_level: int = Field(default=5, ge=1, le=10)
    raw_uri: Optional[str] = None
    checksum: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    ingested_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = {"from_attributes": True}


class ArtifactSchema(BaseModel):
    artifact_id: UUID = Field(default_factory=uuid4)
    source_id: UUID
    artifact_type: str
    text: str
    char_start: Optional[int] = None
    char_end: Optional[int] = None
    parser_version: Optional[str] = None
    opensearch_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"from_attributes": True}


class EntitySchema(BaseModel):
    entity_id: UUID = Field(default_factory=uuid4)
    entity_type: EntityType
    canonical_name: str
    description: Optional[str] = None
    aliases: list[str] = Field(default_factory=list)
    opensearch_id: Optional[str] = None
    neo4j_node_id: Optional[str] = None
    status: str = "active"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"from_attributes": True}


class ClaimSchema(BaseModel):
    claim_id: UUID = Field(default_factory=uuid4)
    claim_text: str
    subject_entity_id: Optional[UUID] = None
    predicate: Optional[str] = None
    object_entity_id: Optional[UUID] = None
    object_literal: Optional[str] = None
    memory_class: MemoryClass
    tier: MemoryTier = MemoryTier.SHORT_TERM
    segment: MemorySegment
    status: ClaimStatus = ClaimStatus.ACTIVE
    base_importance: float = Field(default=0.5, ge=0, le=1)
    confidence: float = Field(default=0.5, ge=0, le=1)
    trust_score: float = Field(default=0.5, ge=0, le=1)
    decay_rate: float = 0.01
    access_count: int = 0
    retrieval_hit_count: int = 0
    support_count: int = 0
    contradiction_count: int = 0
    user_confirmed: bool = False
    source_priority: int = 5
    valid_from: Optional[datetime] = None
    valid_to: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_accessed_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    neo4j_node_id: Optional[str] = None
    opensearch_id: Optional[str] = None

    model_config = {"from_attributes": True}


class EvidenceSchema(BaseModel):
    evidence_id: UUID = Field(default_factory=uuid4)
    claim_id: UUID
    source_id: UUID
    artifact_id: Optional[UUID] = None
    span_start: Optional[int] = None
    span_end: Optional[int] = None
    evidence_type: EvidenceType = EvidenceType.EXTRACTED
    extractor_version: Optional[str] = None
    confidence: float = Field(default=0.5, ge=0, le=1)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"from_attributes": True}


class ClaimRelationSchema(BaseModel):
    id: Optional[int] = None
    from_claim_id: UUID
    to_claim_id: UUID
    relation_type: ClaimRelationType
    created_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"from_attributes": True}


class RetrievalLogSchema(BaseModel):
    retrieval_id: UUID = Field(default_factory=uuid4)
    query_text: Optional[str] = None
    query_embedding_id: Optional[str] = None
    claim_id: Optional[UUID] = None
    artifact_id: Optional[UUID] = None
    returned: bool = True
    used_in_answer: bool = False
    retrieval_score: Optional[float] = None
    user_feedback: Optional[int] = None
    outcome_score: Optional[float] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"from_attributes": True}


class FeedbackEventSchema(BaseModel):
    feedback_id: UUID = Field(default_factory=uuid4)
    kind: FeedbackKind
    claim_id: Optional[UUID] = None
    comment: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"from_attributes": True}


class MaintenanceRunSchema(BaseModel):
    run_id: UUID = Field(default_factory=uuid4)
    run_type: str
    status: str = "running"
    claims_reviewed: Optional[int] = None
    claims_updated: Optional[int] = None
    claims_archived: Optional[int] = None
    error: Optional[str] = None
    started_at: datetime = Field(default_factory=datetime.utcnow)
    finished_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ── Extraction results ─────────────────────────────────────────────────────────

class CandidateEntity(BaseModel):
    canonical_name: str
    entity_type: EntityType
    description: Optional[str] = None
    aliases: list[str] = Field(default_factory=list)


class CandidateClaim(BaseModel):
    claim_text: str
    predicate: str
    subject_name: str                   # resolved to entity_id later
    object_name: Optional[str] = None   # resolved to entity_id or literal
    memory_class: MemoryClass
    segment: MemorySegment
    confidence: float = Field(default=0.6, ge=0, le=1)
    base_importance: float = Field(default=0.5, ge=0, le=1)
    valid_from: Optional[datetime] = None
    valid_to: Optional[datetime] = None
    needs_confirmation: bool = False
    evidence_type: EvidenceType = EvidenceType.EXTRACTED


class ExtractionResult(BaseModel):
    entities: list[CandidateEntity] = Field(default_factory=list)
    claims: list[CandidateClaim] = Field(default_factory=list)
    summary: Optional[str] = None
    source_trust: float = Field(default=0.5, ge=0, le=1)


# ── API request / response models ─────────────────────────────────────────────

class MemorySearchRequest(BaseModel):
    query: str
    top_k: int = Field(default=10, ge=1, le=50)
    tier_filter: Optional[list[MemoryTier]] = None
    segment_filter: Optional[list[MemorySegment]] = None
    memory_class_filter: Optional[list[MemoryClass]] = None
    include_provisional: bool = False
    time_range_start: Optional[datetime] = None
    time_range_end: Optional[datetime] = None


class MemorySearchResult(BaseModel):
    claim: ClaimSchema
    score: float
    subject_entity: Optional[EntitySchema] = None
    object_entity: Optional[EntitySchema] = None
    evidence_count: int = 0


class ContextPackage(BaseModel):
    procedural_memories: list[ClaimSchema] = Field(default_factory=list)
    semantic_facts: list[MemorySearchResult] = Field(default_factory=list)
    graph_context: list[dict[str, Any]] = Field(default_factory=list)
    source_evidence: list[ArtifactSchema] = Field(default_factory=list)
    profile_summary: Optional[str] = None
    total_tokens_estimate: int = 0
    query_type: Optional[QueryType] = None


class StoreClaimRequest(BaseModel):
    claim_text: str
    memory_class: MemoryClass
    segment: MemorySegment
    predicate: Optional[str] = None
    subject_name: Optional[str] = None
    object_literal: Optional[str] = None
    tier: MemoryTier = MemoryTier.SHORT_TERM
    confidence: float = 0.7
    base_importance: float = 0.5
    user_confirmed: bool = False


class UpdateClaimRequest(BaseModel):
    claim_text: Optional[str] = None
    status: Optional[ClaimStatus] = None
    confidence: Optional[float] = None
    base_importance: Optional[float] = None
    tier: Optional[MemoryTier] = None
    user_confirmed: Optional[bool] = None
    valid_to: Optional[datetime] = None


class ForgetRequest(BaseModel):
    claim_ids: Optional[list[UUID]] = None
    entity_ids: Optional[list[UUID]] = None
    source_ids: Optional[list[UUID]] = None
    pattern: Optional[str] = None     # fuzzy match on claim_text


class GraphExpandRequest(BaseModel):
    entity_id: Optional[UUID] = None
    entity_name: Optional[str] = None
    hops: int = Field(default=2, ge=1, le=4)
    edge_types: Optional[list[str]] = None
    limit: int = Field(default=50, ge=1, le=200)


class GraphExpandResult(BaseModel):
    seed_entity: Optional[EntitySchema] = None
    nodes: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)
    claims: list[ClaimSchema] = Field(default_factory=list)


class TimelineRequest(BaseModel):
    entity_name: Optional[str] = None
    topic: Optional[str] = None
    start: Optional[datetime] = None
    end: Optional[datetime] = None
    limit: int = Field(default=20, ge=1, le=100)


class IngestChatRequest(BaseModel):
    user_message: str
    assistant_message: str
    session_id: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class IngestDocumentResult(BaseModel):
    source_id: UUID
    artifacts_created: int
    entities_created: int
    claims_created: int
    claims_provisional: int


class GmailSyncResult(BaseModel):
    threads_processed: int
    entities_created: int
    claims_created: int
    claims_provisional: int
