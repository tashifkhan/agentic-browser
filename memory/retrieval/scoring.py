"""Composite memory scoring.

    relevance = 0.75 * vector + 0.25 * lexical
    score     = 0.60 * relevance + 0.10 * graph + 0.10 * time + 0.10 * importance
              + 0.05 * trust + 0.05 * usage - conflict

`vector` is cosine similarity rescaled so unrelated text sits near 0 and a
near-paraphrase near 1. `lexical` is BM25 relative to the best BM25 hit.
Relevance carries most of the weight, and weak results are dropped
(MIN_RELEVANCE, RELATIVE_CUTOFF), so a question only returns memories that are about it. (Before this,
RRF ranks were squeezed into a narrow band and importance, recency and trust
decided the order, so every query returned the same identity facts.)
"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Optional

import numpy as np

from models.db.memory import ClaimORM
from models.memory import TIER_DECAY_RATE, MemoryTier

W_RELEVANCE = 0.60
W_GRAPH = 0.10
W_TIME = 0.10
W_IMPORTANCE = 0.10
W_TRUST = 0.05
W_USAGE = 0.05
W_CONFLICT = 0.10

# Cosine range mapped onto [0, 1]. Calibrated on gemini-embedding-2 (query
# vs document vectors) with a live probe: claims that only share "User ..."
# with the question sit at 0.55-0.62, direct answers at 0.70-0.92.
COS_FLOOR = 0.58
COS_CEIL = 0.85
# A result is kept when relevance >= MIN_RELEVANCE and >= RELATIVE_CUTOFF x
# the best relevance in the result set, so one strong match doesn't come
# padded with weak ones.
MIN_RELEVANCE = 0.22
RELATIVE_CUTOFF = 0.4


def vector_relevance(cosine: float | None) -> float:
    if cosine is None:
        return 0.0
    return min(max((cosine - COS_FLOOR) / (COS_CEIL - COS_FLOOR), 0.0), 1.0)


def relevance(cosine: float | None, bm25_norm: float = 0.0) -> float:
    return 0.75 * vector_relevance(cosine) + 0.25 * min(max(bm25_norm, 0.0), 1.0)


def _decay_weight(claim: ClaimORM, now: Optional[datetime] = None) -> float:
    """W(t) = I · e^(-λ·Δt) · U · C, Δt in days since the claim was last used.

    `last_accessed_at` only moves when a memory was actually used in an answer
    (see MemoryService.mark_retrieval_used), and U grows with
    retrieval_hit_count, so being retrieved alone no longer keeps a claim fresh.
    """
    now = now or datetime.now(timezone.utc)
    last = claim.last_accessed_at or claim.created_at
    if last is None:
        return 0.5
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)

    delta_days = max((now - last).total_seconds() / 86400, 0)
    lam = max(TIER_DECAY_RATE.get(MemoryTier(claim.tier), 0.01), claim.decay_rate or 0.0)
    if claim.tier == MemoryTier.PERMANENT.value:
        lam = 0.0
    usage_mult = min(1.0 + 0.1 * (claim.retrieval_hit_count or 0), 2.0)
    weight = claim.base_importance * math.exp(-lam * delta_days) * usage_mult * claim.confidence
    return min(weight, 1.0)


def score_claim(
    claim: ClaimORM,
    rel: float,
    graph_relevance: float = 0.0,
    now: Optional[datetime] = None,
) -> float:
    """Return the composite score in [0, 1] for a claim with relevance `rel`."""
    now = now or datetime.now(timezone.utc)
    usage = (
        min((claim.retrieval_hit_count or 0) / max(claim.access_count or 0, 1), 1.0)
        if claim.access_count else 0.0
    )
    conflict = min((claim.contradiction_count or 0) * 0.5, 1.0)
    raw = (
        W_RELEVANCE * rel
        + W_GRAPH * graph_relevance
        + W_TIME * _decay_weight(claim, now)
        + W_IMPORTANCE * claim.base_importance
        + W_TRUST * (claim.trust_score or 0.0)
        + W_USAGE * usage
        - W_CONFLICT * conflict
    )
    return max(0.0, min(raw, 1.0))


def apply_redundancy_penalty(
    scored: list[tuple[ClaimORM, float]],
    claim_embeddings: dict[str, list[float]],
    penalty: float = 0.3,
    sim_threshold: float = 0.92,
) -> list[tuple[ClaimORM, float]]:
    """Penalise claims that nearly repeat a higher-ranked one, so the top-k
    covers different facts. Returns the list re-sorted by score."""
    scored = sorted(scored, key=lambda x: x[1], reverse=True)
    kept: list[np.ndarray] = []
    out: list[tuple[ClaimORM, float]] = []
    for claim, score in scored:
        emb = claim_embeddings.get(str(claim.claim_id))
        if emb is None:
            out.append((claim, score))
            continue
        v = np.asarray(emb, dtype=float)
        v = v / (np.linalg.norm(v) or 1.0)
        if kept and max(float(np.dot(v, k)) for k in kept) >= sim_threshold:
            score *= 1.0 - penalty
        kept.append(v)
        out.append((claim, score))
    return sorted(out, key=lambda x: x[1], reverse=True)
