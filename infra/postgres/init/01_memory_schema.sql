-- ─────────────────────────────────────────────────────────────────────────────
-- Agentic Memory — PostgreSQL schema (single-user)
-- ─────────────────────────────────────────────────────────────────────────────

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- trigram similarity for fuzzy entity matching

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE source_type AS ENUM (
    'chat', 'email', 'resume_pdf', 'document', 'calendar', 'manual', 'system'
);

CREATE TYPE memory_class AS ENUM (
    'working', 'episodic', 'semantic', 'procedural', 'social', 'reflective'
);

CREATE TYPE memory_tier AS ENUM (
    'working', 'short_term', 'long_term', 'permanent'
);

CREATE TYPE memory_segment AS ENUM (
    'core_identity',
    'preferences_and_corrections',
    'projects_and_goals',
    'people_and_relationships',
    'skills_and_background',
    'communications_and_commitments',
    'contextual_incidents',
    'reflections_and_summaries'
);

CREATE TYPE claim_status AS ENUM (
    'active', 'provisional', 'superseded', 'stale', 'archived', 'deleted'
);

CREATE TYPE entity_type AS ENUM (
    'person', 'organization', 'project', 'skill', 'preference',
    'constraint', 'task', 'event', 'document', 'topic', 'location',
    'email_thread', 'resume_section'
);

CREATE TYPE evidence_type AS ENUM (
    'extracted', 'inferred', 'user_stated', 'user_confirmed', 'system_derived'
);

CREATE TYPE feedback_kind AS ENUM (
    'explicit_correction', 'thumbs_up', 'thumbs_down', 'edit', 'ignored', 'confirmed'
);

-- ── Sources ──────────────────────────────────────────────────────────────────
-- Raw ingested sources (chat logs, emails, uploaded files, etc.)

CREATE TABLE sources (
    source_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_type     source_type NOT NULL,
    external_id     TEXT,                       -- e.g. Gmail thread id, file hash
    title           TEXT,
    author          TEXT,
    trust_level     SMALLINT NOT NULL DEFAULT 5 CHECK (trust_level BETWEEN 1 AND 10),
    raw_uri         TEXT,                       -- S3/local path to original payload
    checksum        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata        JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_sources_type        ON sources (source_type);
CREATE INDEX idx_sources_external_id ON sources (external_id);
CREATE INDEX idx_sources_created_at  ON sources (created_at);

-- ── Artifacts ─────────────────────────────────────────────────────────────────
-- Parsed/chunked text derived from sources.
-- Embeddings stored here are low-dimensional metadata; actual vectors live in OpenSearch.

CREATE TABLE artifacts (
    artifact_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id       UUID NOT NULL REFERENCES sources (source_id) ON DELETE CASCADE,
    artifact_type   TEXT NOT NULL,              -- 'chunk', 'summary', 'thread_summary', 'ocr_text'
    text            TEXT NOT NULL,
    char_start      INT,
    char_end        INT,
    parser_version  TEXT,
    opensearch_id   TEXT,                       -- doc id in OpenSearch for vector lookup
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_artifacts_source ON artifacts (source_id);

-- ── Entities ──────────────────────────────────────────────────────────────────
-- Canonical objects that appear in the knowledge graph (mirrored in Neo4j).

CREATE TABLE entities (
    entity_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type     entity_type NOT NULL,
    canonical_name  TEXT NOT NULL,
    description     TEXT,
    aliases         TEXT[] NOT NULL DEFAULT '{}',
    opensearch_id   TEXT,                       -- entity embedding in OpenSearch
    status          TEXT NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_entities_type          ON entities (entity_type);
CREATE INDEX idx_entities_canonical     ON entities (canonical_name);
CREATE INDEX idx_entities_aliases       ON entities USING GIN (aliases);
CREATE INDEX idx_entities_name_trgm     ON entities USING GIN (canonical_name gin_trgm_ops);

-- ── Claims ────────────────────────────────────────────────────────────────────
-- Core belief units. Each claim is a structured statement the system holds.

CREATE TABLE claims (
    claim_id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- What the claim says
    claim_text          TEXT NOT NULL,
    subject_entity_id   UUID REFERENCES entities (entity_id) ON DELETE SET NULL,
    predicate           TEXT,                   -- e.g. 'PREFERS', 'STUDIES', 'WORKS_ON'
    object_entity_id    UUID REFERENCES entities (entity_id) ON DELETE SET NULL,
    object_literal      TEXT,                   -- used when object is a value, not an entity

    -- Classification
    memory_class        memory_class NOT NULL,
    tier                memory_tier NOT NULL DEFAULT 'short_term',
    segment             memory_segment NOT NULL,
    status              claim_status NOT NULL DEFAULT 'active',

    -- Scoring
    base_importance     REAL NOT NULL DEFAULT 0.5 CHECK (base_importance BETWEEN 0 AND 1),
    confidence          REAL NOT NULL DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
    trust_score         REAL NOT NULL DEFAULT 0.5 CHECK (trust_score BETWEEN 0 AND 1),
    decay_rate          REAL NOT NULL DEFAULT 0.01,   -- lambda in decay formula
    access_count        INT NOT NULL DEFAULT 0,
    retrieval_hit_count INT NOT NULL DEFAULT 0,       -- times this claim actually helped
    support_count       INT NOT NULL DEFAULT 0,
    contradiction_count INT NOT NULL DEFAULT 0,

    -- Provenance
    user_confirmed      BOOLEAN NOT NULL DEFAULT FALSE,
    source_priority     SMALLINT NOT NULL DEFAULT 5,

    -- Temporal
    valid_from          TIMESTAMPTZ,
    valid_to            TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_accessed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Graph sync
    neo4j_node_id       TEXT,                   -- id of corresponding Claim node in Neo4j

    -- Vector search
    opensearch_id       TEXT                    -- doc id for claim embedding in OpenSearch
);

CREATE INDEX idx_claims_status          ON claims (status);
CREATE INDEX idx_claims_tier            ON claims (tier);
CREATE INDEX idx_claims_segment         ON claims (segment);
CREATE INDEX idx_claims_memory_class    ON claims (memory_class);
CREATE INDEX idx_claims_subject         ON claims (subject_entity_id);
CREATE INDEX idx_claims_valid           ON claims (valid_from, valid_to);
CREATE INDEX idx_claims_last_accessed   ON claims (last_accessed_at);
CREATE INDEX idx_claims_importance      ON claims (base_importance DESC);
CREATE INDEX idx_claims_text_trgm       ON claims USING GIN (claim_text gin_trgm_ops);

-- ── Evidence ──────────────────────────────────────────────────────────────────
-- Links claims back to their source artifacts with span info.

CREATE TABLE evidence (
    evidence_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_id            UUID NOT NULL REFERENCES claims (claim_id) ON DELETE CASCADE,
    source_id           UUID NOT NULL REFERENCES sources (source_id) ON DELETE CASCADE,
    artifact_id         UUID REFERENCES artifacts (artifact_id) ON DELETE SET NULL,
    span_start          INT,
    span_end            INT,
    evidence_type       evidence_type NOT NULL DEFAULT 'extracted',
    extractor_version   TEXT,
    confidence          REAL NOT NULL DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_evidence_claim  ON evidence (claim_id);
CREATE INDEX idx_evidence_source ON evidence (source_id);

-- ── Claim Supersession ────────────────────────────────────────────────────────
-- Tracks when one claim replaces or contradicts another.

CREATE TABLE claim_relations (
    id              BIGSERIAL PRIMARY KEY,
    from_claim_id   UUID NOT NULL REFERENCES claims (claim_id) ON DELETE CASCADE,
    to_claim_id     UUID NOT NULL REFERENCES claims (claim_id) ON DELETE CASCADE,
    relation_type   TEXT NOT NULL,              -- 'SUPERSEDES', 'CONTRADICTS', 'SUPPORTS'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (from_claim_id, to_claim_id, relation_type)
);

CREATE INDEX idx_claim_relations_from ON claim_relations (from_claim_id);
CREATE INDEX idx_claim_relations_to   ON claim_relations (to_claim_id);

-- ── Retrieval Log ─────────────────────────────────────────────────────────────
-- Outcome tracking for self-evolution.

CREATE TABLE retrieval_log (
    retrieval_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_text          TEXT,
    query_embedding_id  TEXT,                   -- OpenSearch query doc id if stored
    claim_id            UUID REFERENCES claims (claim_id) ON DELETE SET NULL,
    artifact_id         UUID REFERENCES artifacts (artifact_id) ON DELETE SET NULL,
    returned            BOOLEAN NOT NULL DEFAULT TRUE,
    used_in_answer      BOOLEAN NOT NULL DEFAULT FALSE,
    retrieval_score     REAL,
    user_feedback       SMALLINT,               -- -1 bad, 0 neutral, 1 good
    outcome_score       REAL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_retrieval_log_claim      ON retrieval_log (claim_id);
CREATE INDEX idx_retrieval_log_created_at ON retrieval_log (created_at);

-- ── Feedback Events ───────────────────────────────────────────────────────────

CREATE TABLE feedback_events (
    feedback_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kind            feedback_kind NOT NULL,
    claim_id        UUID REFERENCES claims (claim_id) ON DELETE SET NULL,
    comment         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_feedback_claim ON feedback_events (claim_id);

-- ── Maintenance Jobs ──────────────────────────────────────────────────────────
-- Audit trail for background consolidation runs.

CREATE TABLE maintenance_runs (
    run_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_type        TEXT NOT NULL,              -- 'micro_reflection', 'hourly', 'nightly', 'weekly'
    status          TEXT NOT NULL DEFAULT 'running',
    claims_reviewed INT,
    claims_updated  INT,
    claims_archived INT,
    error           TEXT,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at     TIMESTAMPTZ
);

-- ── Helper: auto-update updated_at ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_entities_updated_at
    BEFORE UPDATE ON entities
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_claims_updated_at
    BEFORE UPDATE ON claims
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
