"""Composite memory scoring:
  S = α·semantic + β·graph + γ·time + δ·importance + ε·trust + ζ·usage - η·conflict - ρ·redundancy
"""
from __future__ import annotations
import math
from datetime import datetime, timezone
from typing import Optional

import numpy as np

from models.db.memory import ClaimORM
from models.memory import MemoryTier, TIER_DECAY_RATE

# Weights for each scoring component
W_SEMANTIC    = 0.30
W_GRAPH       = 0.15
W_TIME        = 0.15
W_IMPORTANCE  = 0.15
W_TRUST       = 0.10
W_USAGE       = 0.10
W_CONFLICT    = 0.05   # penalty
W_REDUNDANCY  = 0.05   # penalty applied externally


def _decay_weight(claim: ClaimORM, now: Optional[datetime] = None) -> float:
    """
    W(t) = I · e^(-λ·Δt) · U · C
    Δt measured in days.
    """
    now = now or datetime.now(timezone.utc)
    last = claim.last_accessed_at
    if last is None:
        last = claim.created_at
    if last is None:
        return 0.5

    # make timezone-aware if naive
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)

    delta_days = max((now - last).total_seconds() / 86400, 0)

    lam = TIER_DECAY_RATE.get(MemoryTier(claim.tier), 0.01)
    # Increase lambda from the claim's own decay_rate if it's more specific
    lam = max(lam, claim.decay_rate)

    # usage multiplier: more accesses → slower decay
    usage_mult = min(1.0 + 0.05 * claim.access_count, 2.0)
    confidence_mult = claim.confidence

    weight = claim.base_importance * math.exp(-lam * delta_days) * usage_mult * confidence_mult
    return min(weight, 1.0)


def score_claim(
    claim: ClaimORM,
    semantic_sim: float = 0.0,     # from vector search
    graph_relevance: float = 0.0,  # from graph traversal
    rrf_score: float = 0.0,        # reciprocal rank fusion score
    now: Optional[datetime] = None,
) -> float:
    """Return composite score in [0, 1]."""
    now = now or datetime.now(timezone.utc)

    time_score   = _decay_weight(claim, now)
    trust_score  = claim.trust_score
    usage_score  = min(claim.retrieval_hit_count / max(claim.access_count, 1), 1.0) if claim.access_count else 0.0
    conflict_pen = min(claim.contradiction_count * 0.15, 0.5)

    # Blend semantic: either direct similarity or RRF score (normalise RRF ≈ 0-0.016)
    sem = max(semantic_sim, min(rrf_score * 60, 1.0))

    raw = (
        W_SEMANTIC   * sem
        + W_GRAPH    * graph_relevance
        + W_TIME     * time_score
        + W_IMPORTANCE * claim.base_importance
        + W_TRUST    * trust_score
        + W_USAGE    * usage_score
        - W_CONFLICT * conflict_pen
    )
    return max(0.0, min(raw, 1.0))


def apply_redundancy_penalty(
    scored: list[tuple[ClaimORM, float]],
    claim_embeddings: dict[str, list[float]],
    penalty: float = 0.3,
    sim_threshold: float = 0.92,
) -> list[tuple[ClaimORM, float]]:
    """
    After scoring, penalise near-duplicate claims to ensure diversity.
    Modifies scores in place, sorted by score desc.
    """
    scored = sorted(scored, key=lambda x: x[1], reverse=True)
    seen_embeddings: list[list[float]] = []
    result = []

    for claim, score in scored:
        cid = str(claim.claim_id)
        emb = claim_embeddings.get(cid)
        penalised = score

        if emb and seen_embeddings:
            # cosine similarity to each already-selected embedding
            ve = np.array(emb)
            sims = [
                float(np.dot(ve, np.array(se)) /
                      (np.linalg.norm(ve) * np.linalg.norm(se) + 1e-9))
                for se in seen_embeddings
            ]
            if max(sims) >= sim_threshold:
                penalised = score * (1.0 - penalty)

        result.append((claim, penalised))
        if emb:
            seen_embeddings.append(emb)

    return sorted(result, key=lambda x: x[1], reverse=True)
