from enum import Enum


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
    NONE = "none"          # permanent / procedural — never decays
    SLOW = "slow"          # long-term facts (lambda ~0.003)
    MEDIUM = "medium"      # episodic / short-term (lambda ~0.02)
    FAST = "fast"          # working / contextual (lambda ~0.1)


# Default decay rates per tier
TIER_DECAY_RATE: dict[MemoryTier, float] = {
    MemoryTier.WORKING: 0.15,
    MemoryTier.SHORT_TERM: 0.03,
    MemoryTier.LONG_TERM: 0.005,
    MemoryTier.PERMANENT: 0.0,
}

# Default decay rates per segment (overrides tier when more specific)
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
