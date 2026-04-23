"""Consolidation runner: orchestrates the four maintenance rhythms.

  micro_reflection  — after each interaction (cheap, fast)
  hourly            — dedup + alias merge + short-term promotion candidates
  nightly           — decay + full dedup + promotion + agent review batch
  weekly            — entity resolution + community summaries + reflection
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, update

from core.config import get_logger
from memory.db.postgres import get_session
from memory.db.opensearch_client import get_opensearch
from memory.graph.entity_resolution import EntityResolver
from memory.graph.traversal import GraphTraversal
from memory.ingestion.extractor import Extractor
from memory.maintenance.agents import MaintenanceAgentPipeline, AgentDecision
from memory.maintenance.decay import DecayEngine
from memory.maintenance.dedup import DeduplicationEngine
from memory.maintenance.promotion import PromotionEngine
from memory.models.enums import ClaimStatus
from memory.models.orm import ClaimORM, MaintenanceRunORM

logger = get_logger(__name__)

_decay      = DecayEngine()
_dedup      = DeduplicationEngine()
_promotion  = PromotionEngine()
_resolver   = EntityResolver()
_traversal  = GraphTraversal()
_extractor  = Extractor()
_agents     = MaintenanceAgentPipeline()


async def _start_run(run_type: str) -> uuid.UUID:
    async with get_session() as session:
        run = MaintenanceRunORM(
            run_id=uuid.uuid4(),
            run_type=run_type,
            status="running",
            started_at=datetime.now(timezone.utc),
        )
        session.add(run)
    return run.run_id


async def _finish_run(run_id: uuid.UUID, stats: dict, error: Optional[str] = None) -> None:
    async with get_session() as session:
        await session.execute(
            update(MaintenanceRunORM)
            .where(MaintenanceRunORM.run_id == run_id)
            .values(
                status="failed" if error else "completed",
                claims_reviewed=stats.get("claims_reviewed", 0),
                claims_updated=stats.get("claims_updated", 0),
                claims_archived=stats.get("claims_archived", 0),
                error=error,
                finished_at=datetime.now(timezone.utc),
            )
        )


class ConsolidationRunner:
    # ── Micro-reflection (after each chat turn) ─────────────────────────────
    async def micro_reflection(self, recent_claim_ids: list[str]) -> dict:
        """Cheap, real-time: bump access, log, no dedup."""
        run_id = await _start_run("micro_reflection")
        stats = {"claims_reviewed": len(recent_claim_ids), "claims_updated": 0, "claims_archived": 0}
        try:
            # Nothing heavy — just confirm stats are updated (bump_access already done in retrieval)
            await _finish_run(run_id, stats)
        except Exception as exc:
            await _finish_run(run_id, stats, str(exc))
        return stats

    # ── Hourly ──────────────────────────────────────────────────────────────
    async def hourly(self) -> dict:
        run_id = await _start_run("hourly")
        stats = {}
        try:
            dedup_stats = await _dedup.run(batch_size=100)
            promo_stats = await _promotion.run(batch_size=100)
            stats = {
                "claims_reviewed": dedup_stats.get("duplicates_found", 0),
                "claims_updated": promo_stats.get("promoted", 0),
                "claims_archived": dedup_stats.get("merged", 0),
            }
            await _finish_run(run_id, stats)
        except Exception as exc:
            await _finish_run(run_id, stats, str(exc))
            logger.error("Hourly consolidation failed: %s", exc)
        return stats

    # ── Nightly ─────────────────────────────────────────────────────────────
    async def nightly(self) -> dict:
        run_id = await _start_run("nightly")
        stats: dict = {}
        try:
            # 1. Decay pass
            decay_stats = await _decay.run(batch_size=500)

            # 2. Archive long-stale
            archive_stats = await _decay.archive_stale(older_than_days=14)

            # 3. Full dedup
            dedup_stats = await _dedup.run(batch_size=300)

            # 4. Promotion pass
            promo_stats = await _promotion.run(batch_size=300)

            # 5. Agent review on stale provisional claims
            agent_reviewed = await self._agent_review_batch(batch_size=50)

            stats = {
                "claims_reviewed": decay_stats.get("checked", 0) + agent_reviewed,
                "claims_updated": promo_stats.get("promoted", 0) + promo_stats.get("demoted", 0),
                "claims_archived": archive_stats.get("archived", 0) + dedup_stats.get("merged", 0),
            }
            await _finish_run(run_id, stats)
        except Exception as exc:
            await _finish_run(run_id, stats, str(exc))
            logger.error("Nightly consolidation failed: %s", exc)
        return stats

    # ── Weekly ──────────────────────────────────────────────────────────────
    async def weekly(self) -> dict:
        run_id = await _start_run("weekly")
        stats: dict = {}
        try:
            # 1. Entity resolution
            entity_stats = await _resolver.resolve_and_merge_batch()

            # 2. Community summaries via graph
            community_stats = await self._generate_community_summaries()

            # 3. Full nightly + reflection summary
            nightly_stats = await self.nightly()

            stats = {
                "claims_reviewed": nightly_stats.get("claims_reviewed", 0),
                "claims_updated": nightly_stats.get("claims_updated", 0)
                                  + entity_stats.get("auto_merged", 0),
                "claims_archived": nightly_stats.get("claims_archived", 0),
            }
            await _finish_run(run_id, stats)
        except Exception as exc:
            await _finish_run(run_id, stats, str(exc))
            logger.error("Weekly consolidation failed: %s", exc)
        return stats

    # ── Internal helpers ─────────────────────────────────────────────────────

    async def _agent_review_batch(self, batch_size: int = 50) -> int:
        """Run Curator/Skeptic/Judge pipeline on provisional and borderline claims."""
        async with get_session() as session:
            result = await session.execute(
                select(ClaimORM)
                .where(ClaimORM.status.in_(["provisional", "stale"]))
                .order_by(ClaimORM.created_at.asc())
                .limit(batch_size)
            )
            claims = result.scalars().all()

        if not claims:
            return 0

        decision_map = await _agents.run_batch(list(claims))

        # Apply decisions
        async with get_session() as session:
            for decision_str, claim_ids in decision_map.items():
                if not claim_ids:
                    continue

                if decision_str == AgentDecision.ARCHIVE.value:
                    await session.execute(
                        update(ClaimORM)
                        .where(ClaimORM.claim_id.in_(
                            [uuid.UUID(cid) for cid in claim_ids]
                        ))
                        .values(status=ClaimStatus.ARCHIVED.value)
                    )
                elif decision_str == AgentDecision.PROMOTE.value:
                    # Bump tier: provisional→active and short_term→long_term
                    for cid in claim_ids:
                        r = await session.execute(
                            select(ClaimORM).where(ClaimORM.claim_id == uuid.UUID(cid))
                        )
                        c = r.scalar_one_or_none()
                        if c:
                            if c.status == "provisional":
                                c.status = ClaimStatus.ACTIVE.value
                            if c.tier == "short_term":
                                c.tier = "long_term"

        return len(claims)

    async def _generate_community_summaries(self) -> dict:
        """Generate summary artifacts for top-N entity communities via simple clustering."""
        # Simple approach: group claims by segment and summarise each
        from memory.db.postgres import get_session
        from memory.models.orm import ClaimORM, ArtifactORM, SourceORM
        from memory.models.enums import SourceType
        import uuid

        segments = [
            "core_identity", "skills_and_background", "projects_and_goals",
            "people_and_relationships", "preferences_and_corrections",
        ]
        summaries_created = 0

        for segment in segments:
            async with get_session() as session:
                result = await session.execute(
                    select(ClaimORM)
                    .where(ClaimORM.segment == segment, ClaimORM.status == "active")
                    .order_by(ClaimORM.base_importance.desc())
                    .limit(30)
                )
                claims = result.scalars().all()

            if not claims:
                continue

            combined = "\n".join(c.claim_text for c in claims)
            summary = _extractor.summarize(combined, max_sentences=5)
            summary_text = f"[{segment.upper()} SUMMARY]\n{summary}"
            emb = _extractor.embed_one(summary_text)

            async with get_session() as session:
                # Upsert a synthetic source for summaries
                source = SourceORM(
                    source_id=uuid.uuid4(),
                    source_type=SourceType.SYSTEM.value,
                    title=f"community_summary_{segment}",
                    trust_level=8,
                )
                session.add(source)
                await session.flush()

                artifact = ArtifactORM(
                    artifact_id=uuid.uuid4(),
                    source_id=source.source_id,
                    artifact_type="community_summary",
                    text=summary_text,
                    parser_version="consolidation_v1",
                )
                session.add(artifact)
                await session.flush()

                get_opensearch().index_artifact(
                    str(artifact.artifact_id), str(source.source_id),
                    "community_summary", summary_text, emb,
                )
                summaries_created += 1

        return {"summaries_created": summaries_created}
