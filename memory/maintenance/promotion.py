"""Promotion and demotion engine: adjusts claim tiers based on usage and signals."""
from __future__ import annotations
from datetime import datetime, timezone

from sqlalchemy import select, update

from core.config import get_logger
from memory.db.opensearch_client import get_opensearch, IDX_CLAIMS
from memory.db.postgres import get_session
from memory.models.enums import MemoryTier, ClaimStatus
from memory.models.orm import ClaimORM

logger = get_logger(__name__)

# Promotion thresholds
_PROMOTE_ST_TO_LT = {
    "min_access_count": 3,
    "min_retrieval_hits": 2,
    "min_confidence": 0.55,
}
_PROMOTE_LT_TO_PERM = {
    "min_access_count": 8,
    "min_retrieval_hits": 5,
    "min_confidence": 0.75,
    "requires_user_confirmed": False,  # if True, only promote user-confirmed
}

# Demotion: LT → ST if not accessed for N days and low hit rate
_DEMOTE_LT_DAYS      = 30
_DEMOTE_HIT_RATE_MAX = 0.1   # retrieval_hit_count / access_count


class PromotionEngine:
    async def run(self, batch_size: int = 300) -> dict:
        now = datetime.now(timezone.utc)
        promoted = 0
        demoted  = 0

        async with get_session() as session:
            result = await session.execute(
                select(ClaimORM)
                .where(
                    ClaimORM.status.in_([ClaimStatus.ACTIVE.value, ClaimStatus.PROVISIONAL.value]),
                )
                .limit(batch_size)
            )
            claims = result.scalars().all()

            for claim in claims:
                current_tier = MemoryTier(claim.tier)
                new_tier = self._evaluate_tier(claim, current_tier, now)

                if new_tier != current_tier:
                    claim.tier = new_tier.value
                    if new_tier.value > current_tier.value:  # comparing str — use index
                        promoted += 1
                    else:
                        demoted += 1

                    # Auto-confirm high-confidence permanent promotions
                    if new_tier == MemoryTier.PERMANENT and claim.confidence >= 0.8:
                        claim.user_confirmed = True

        # Sync tier changes to OpenSearch
        if promoted + demoted > 0:
            await self._sync_os_tiers(batch_size)

        logger.info("Promotion: promoted=%d, demoted=%d", promoted, demoted)
        return {"promoted": promoted, "demoted": demoted}

    def _evaluate_tier(self, claim: ClaimORM, current_tier: MemoryTier,
                       now: datetime) -> MemoryTier:
        # Permanent never auto-demotes
        if current_tier == MemoryTier.PERMANENT:
            return MemoryTier.PERMANENT

        access = claim.access_count
        hits   = claim.retrieval_hit_count
        conf   = claim.confidence

        # ── Promotion ────────────────────────────────────────────────────────
        if current_tier == MemoryTier.SHORT_TERM:
            th = _PROMOTE_ST_TO_LT
            if (access >= th["min_access_count"]
                    and hits >= th["min_retrieval_hits"]
                    and conf >= th["min_confidence"]):
                return MemoryTier.LONG_TERM

        if current_tier == MemoryTier.LONG_TERM:
            th = _PROMOTE_LT_TO_PERM
            confirmed_ok = (not th["requires_user_confirmed"] or claim.user_confirmed)
            if (access >= th["min_access_count"]
                    and hits >= th["min_retrieval_hits"]
                    and conf >= th["min_confidence"]
                    and confirmed_ok
                    and claim.contradiction_count == 0):
                return MemoryTier.PERMANENT

        # ── Demotion ─────────────────────────────────────────────────────────
        if current_tier == MemoryTier.LONG_TERM:
            last = claim.last_accessed_at or claim.created_at
            if last:
                if last.tzinfo is None:
                    last = last.replace(tzinfo=timezone.utc)
                idle_days = (now - last).days
                hit_rate = hits / max(access, 1)
                if idle_days >= _DEMOTE_LT_DAYS and hit_rate < _DEMOTE_HIT_RATE_MAX:
                    return MemoryTier.SHORT_TERM

        return current_tier

    async def _sync_os_tiers(self, limit: int) -> None:
        """Re-sync tier field to OpenSearch for recently updated claims."""
        async with get_session() as session:
            result = await session.execute(
                select(ClaimORM)
                .where(ClaimORM.status == ClaimStatus.ACTIVE.value)
                .order_by(ClaimORM.updated_at.desc())
                .limit(limit)
            )
            for claim in result.scalars().all():
                try:
                    get_opensearch().update_document(
                        IDX_CLAIMS, str(claim.claim_id),
                        {"tier": claim.tier, "user_confirmed": claim.user_confirmed},
                    )
                except Exception:
                    pass
