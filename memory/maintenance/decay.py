"""Decay engine: marks claims as stale when their effective weight drops below a threshold."""
from __future__ import annotations
import math
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
    last = claim.last_accessed_at or claim.created_at
    if last is None:
        return 0.0
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)

    delta_days = max((now - last).total_seconds() / 86400, 0)
    lam = max(TIER_DECAY_RATE.get(MemoryTier(claim.tier), 0.01), claim.decay_rate)
    usage_mult = min(1.0 + 0.05 * claim.access_count, 2.0)
    return claim.base_importance * math.exp(-lam * delta_days) * usage_mult * claim.confidence


class DecayEngine:
    async def run(self, batch_size: int = MAX_BATCH) -> dict:
        now = datetime.now(timezone.utc)
        stale_ids: list = []
        checked = 0

        async with get_session() as session:
            result = await session.execute(
                select(ClaimORM)
                .where(
                    ClaimORM.status.in_(["active", "provisional"]),
                    ClaimORM.tier != MemoryTier.PERMANENT.value,
                )
                .limit(batch_size)
            )
            claims = result.scalars().all()
            checked = len(claims)

            for claim in claims:
                w = _effective_weight(claim, now)
                if w < STALE_THRESHOLD:
                    claim.status = ClaimStatus.STALE.value
                    stale_ids.append(str(claim.claim_id))

        # Sync stale status to OpenSearch
        os_client = get_opensearch()
        for cid in stale_ids:
            try:
                os_client.update_document(IDX_CLAIMS, cid, {"status": "stale"})
            except Exception:
                pass

        logger.info("Decay: checked=%d, stale=%d", checked, len(stale_ids))
        return {"checked": checked, "marked_stale": len(stale_ids)}

    async def archive_stale(self, older_than_days: int = 30) -> dict:
        """Move long-stale claims to archived status."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=older_than_days)
        archived_ids: list = []

        async with get_session() as session:
            result = await session.execute(
                select(ClaimORM)
                .where(
                    ClaimORM.status == ClaimStatus.STALE.value,
                    ClaimORM.last_accessed_at < cutoff,
                )
                .limit(MAX_BATCH)
            )
            claims = result.scalars().all()
            for claim in claims:
                claim.status = ClaimStatus.ARCHIVED.value
                archived_ids.append(str(claim.claim_id))

        os_client = get_opensearch()
        for cid in archived_ids:
            try:
                os_client.update_document(IDX_CLAIMS, cid, {"status": "archived"})
            except Exception:
                pass

        logger.info("Archive: %d stale claims archived", len(archived_ids))
        return {"archived": len(archived_ids)}
