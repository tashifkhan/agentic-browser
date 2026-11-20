"""Promotion and demotion engine: adjusts claim tiers based on usage and signals."""
from __future__ import annotations
import asyncio
from datetime import datetime, timezone

from sqlalchemy import select, update

from core.config import get_logger
from core.clients.opensearch import get_opensearch, IDX_CLAIMS
from core.db import get_session
from models.memory import ClaimStatus, MemorySegment, MemoryTier
from models.db.memory import ClaimORM

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


# Segments that describe who the user is. Being idle doesn't make these less
# true, so they are never demoted for idleness.
_NEVER_DEMOTE_SEGMENTS = {
    MemorySegment.CORE_IDENTITY.value,
    MemorySegment.PEOPLE.value,
    MemorySegment.PREFERENCES.value,
    MemorySegment.SKILLS.value,
}
_TIER_ORDER = {
    MemoryTier.WORKING: 0,
    MemoryTier.SHORT_TERM: 1,
    MemoryTier.LONG_TERM: 2,
    MemoryTier.PERMANENT: 3,
}


class PromotionEngine:
    async def run(self, batch_size: int = 500) -> dict:
        """Promote or demote every active/provisional claim, paging by id.

        Promotion needs real use: retrieval_hit_count only grows when an answer
        used the memory (MemoryService.mark_retrieval_used), which the chat
        service now reports after each turn.
        """
        from memory.maintenance.decay import _pages

        now = datetime.now(timezone.utc)
        promoted = 0
        demoted = 0
        changed: list[tuple[str, str, bool]] = []

        async for _session, claims in _pages(
            ClaimORM.status.in_([ClaimStatus.ACTIVE.value, ClaimStatus.PROVISIONAL.value]),
            page=batch_size,
        ):
            for claim in claims:
                current = MemoryTier(claim.tier)
                new = self._evaluate_tier(claim, current, now)
                if new == current:
                    continue
                claim.tier = new.value
                if _TIER_ORDER[new] > _TIER_ORDER[current]:
                    promoted += 1
                else:
                    demoted += 1
                if new == MemoryTier.PERMANENT and claim.confidence >= 0.8:
                    claim.user_confirmed = True
                changed.append((str(claim.claim_id), claim.tier, bool(claim.user_confirmed)))

        os_client = get_opensearch()
        for cid, tier, confirmed in changed:
            try:
                await asyncio.to_thread(os_client.update_document, IDX_CLAIMS, cid,
                                        {"tier": tier, "user_confirmed": confirmed})
            except Exception:
                pass

        logger.info("Promotion: promoted=%d, demoted=%d", promoted, demoted)
        return {"promoted": promoted, "demoted": demoted}

    def _evaluate_tier(self, claim: ClaimORM, current_tier: MemoryTier,
                       now: datetime) -> MemoryTier:
        if current_tier == MemoryTier.PERMANENT:
            return MemoryTier.PERMANENT

        access = claim.access_count or 0
        hits = claim.retrieval_hit_count or 0
        conf = claim.confidence
        support = claim.support_count or 0

        # ── Promotion ────────────────────────────────────────────────────────
        # Repeated independent mentions (support) count like uses.
        if current_tier in (MemoryTier.WORKING, MemoryTier.SHORT_TERM):
            th = _PROMOTE_ST_TO_LT
            if conf >= th["min_confidence"] and (
                (access >= th["min_access_count"] and hits >= th["min_retrieval_hits"])
                or support >= 2
            ):
                return MemoryTier.LONG_TERM

        if current_tier == MemoryTier.LONG_TERM:
            th = _PROMOTE_LT_TO_PERM
            confirmed_ok = (not th["requires_user_confirmed"] or claim.user_confirmed)
            if (access >= th["min_access_count"]
                    and hits >= th["min_retrieval_hits"]
                    and conf >= th["min_confidence"]
                    and confirmed_ok
                    and (claim.contradiction_count or 0) == 0):
                return MemoryTier.PERMANENT

        # ── Demotion ─────────────────────────────────────────────────────────
        if (current_tier == MemoryTier.LONG_TERM
                and claim.segment not in _NEVER_DEMOTE_SEGMENTS
                and not claim.user_confirmed):
            last = claim.last_accessed_at or claim.created_at
            if last:
                if last.tzinfo is None:
                    last = last.replace(tzinfo=timezone.utc)
                idle_days = (now - last).days
                hit_rate = hits / max(access, 1)
                if idle_days >= _DEMOTE_LT_DAYS and hit_rate < _DEMOTE_HIT_RATE_MAX:
                    return MemoryTier.SHORT_TERM

        return current_tier
