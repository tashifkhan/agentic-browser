"""Decay engine: marks claims as stale when their effective weight drops below a threshold."""
from __future__ import annotations
import asyncio
import math
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select, update, and_

from core.config import get_logger
from core.db import get_session
from core.clients.opensearch import get_opensearch, IDX_CLAIMS
from models.memory import ClaimStatus, MemoryTier, TIER_DECAY_RATE
from models.db.memory import ClaimORM

logger = get_logger(__name__)

STALE_THRESHOLD = 0.05   # effective weight below this → mark stale
MAX_BATCH       = 500


def _effective_weight(claim: ClaimORM, now: datetime) -> float:
    """Same curve as retrieval scoring: idle time since last *use*, slowed by
    how often the memory was actually used."""
    last = claim.last_accessed_at or claim.created_at
    if last is None:
        return 0.0
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)

    delta_days = max((now - last).total_seconds() / 86400, 0)
    lam = max(TIER_DECAY_RATE.get(MemoryTier(claim.tier), 0.01), claim.decay_rate or 0.0)
    usage_mult = min(1.0 + 0.1 * (claim.retrieval_hit_count or 0), 2.0)
    return claim.base_importance * math.exp(-lam * delta_days) * usage_mult * claim.confidence


async def _pages(*conditions, page: int = MAX_BATCH):
    """Yield claim rows in claim_id order, one session per page, so a pass
    covers every matching claim instead of the same first 500 each night."""
    after: Optional[uuid.UUID] = None
    while True:
        async with get_session() as session:
            q = select(ClaimORM).where(*conditions)
            if after is not None:
                q = q.where(ClaimORM.claim_id > after)
            rows = list((await session.execute(q.order_by(ClaimORM.claim_id).limit(page))).scalars().all())
            if not rows:
                return
            yield session, rows
            after = rows[-1].claim_id


async def _sync_status(ids: list[str], status: str) -> None:
    os_client = get_opensearch()
    for cid in ids:
        try:
            await asyncio.to_thread(os_client.update_document, IDX_CLAIMS, cid, {"status": status})
        except Exception:
            pass


class DecayEngine:
    async def run(self, batch_size: int = MAX_BATCH) -> dict:
        """Mark claims stale when their weight falls below STALE_THRESHOLD.
        Permanent and user-confirmed claims never go stale."""
        now = datetime.now(timezone.utc)
        stale_ids: list[str] = []
        checked = 0
        async for _session, claims in _pages(
            ClaimORM.status.in_(["active", "provisional"]),
            ClaimORM.tier != MemoryTier.PERMANENT.value,
            ClaimORM.user_confirmed.is_(False),
            page=batch_size,
        ):
            checked += len(claims)
            for claim in claims:
                if _effective_weight(claim, now) < STALE_THRESHOLD:
                    claim.status = ClaimStatus.STALE.value
                    stale_ids.append(str(claim.claim_id))

        await _sync_status(stale_ids, "stale")
        logger.info("Decay: checked=%d, stale=%d", checked, len(stale_ids))
        return {"checked": checked, "marked_stale": len(stale_ids)}

    async def archive_stale(self, older_than_days: int = 30) -> dict:
        """Archive claims that have been stale and unused for a while."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=older_than_days)
        archived_ids: list[str] = []
        async for _session, claims in _pages(
            ClaimORM.status == ClaimStatus.STALE.value,
            ClaimORM.last_accessed_at < cutoff,
        ):
            for claim in claims:
                claim.status = ClaimStatus.ARCHIVED.value
                archived_ids.append(str(claim.claim_id))

        await _sync_status(archived_ids, "archived")
        logger.info("Archive: %d stale claims archived", len(archived_ids))
        return {"archived": len(archived_ids)}
