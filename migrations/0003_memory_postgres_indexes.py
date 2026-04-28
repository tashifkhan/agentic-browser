from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection


async def upgrade(conn: AsyncConnection) -> None:
    await conn.execute(text('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'))
    await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))

    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_sources_type ON sources (source_type)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_sources_external_id ON sources (external_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_sources_created_at ON sources (created_at)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_artifacts_source ON artifacts (source_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_entities_type ON entities (entity_type)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_entities_canonical ON entities (canonical_name)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_entities_aliases ON entities USING GIN (aliases)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_entities_name_trgm ON entities USING GIN (canonical_name gin_trgm_ops)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_claims_status ON claims (status)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_claims_tier ON claims (tier)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_claims_segment ON claims (segment)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_claims_memory_class ON claims (memory_class)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_claims_subject ON claims (subject_entity_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_claims_valid ON claims (valid_from, valid_to)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_claims_last_accessed ON claims (last_accessed_at)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_claims_importance ON claims (base_importance DESC)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_claims_text_trgm ON claims USING GIN (claim_text gin_trgm_ops)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_evidence_claim ON evidence (claim_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_evidence_source ON evidence (source_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_claim_relations_from ON claim_relations (from_claim_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_claim_relations_to ON claim_relations (to_claim_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_retrieval_log_claim ON retrieval_log (claim_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_retrieval_log_created_at ON retrieval_log (created_at)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_feedback_claim ON feedback_events (claim_id)"))

    await conn.execute(
        text(
            """
            CREATE OR REPLACE FUNCTION touch_updated_at()
            RETURNS TRIGGER LANGUAGE plpgsql AS $$
            BEGIN
                NEW.updated_at = NOW();
                RETURN NEW;
            END;
            $$
            """
        )
    )
    await conn.execute(text("DROP TRIGGER IF EXISTS trg_entities_updated_at ON entities"))
    await conn.execute(
        text(
            """
            CREATE TRIGGER trg_entities_updated_at
            BEFORE UPDATE ON entities
            FOR EACH ROW EXECUTE FUNCTION touch_updated_at()
            """
        )
    )
    await conn.execute(text("DROP TRIGGER IF EXISTS trg_claims_updated_at ON claims"))
    await conn.execute(
        text(
            """
            CREATE TRIGGER trg_claims_updated_at
            BEFORE UPDATE ON claims
            FOR EACH ROW EXECUTE FUNCTION touch_updated_at()
            """
        )
    )
