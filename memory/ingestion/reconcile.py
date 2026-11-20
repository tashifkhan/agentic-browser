"""Write-time reconciliation: decide how a new claim relates to what is stored.

For every candidate claim we look up its nearest stored claims (active or
provisional) and classify each pair:

  duplicate    same fact again. Don't insert; add evidence and support.
  update       the fact changed. Insert the new claim, supersede the old one.
  contradicts  both can't be true and it's unclear which is right. Insert,
               link with CONTRADICTS and bump contradiction_count on both.
  unrelated    nothing to do.

Near-identical pairs are settled without an LLM. Everything in the grey zone
goes to one batched LLM call per turn. If that call fails we fall back to
similarity thresholds plus the extractor's `is_update` flag.
"""
from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

from langchain_core.messages import HumanMessage, SystemMessage

from core.clients.opensearch import IDX_CLAIMS, get_opensearch
from core.config import get_logger
from core.llm import llm
from memory.ingestion.extractor import _clean_json, response_text
from models.memory import CandidateClaim
from prompts.memory import RECONCILE_SYSTEM_PROMPT

logger = get_logger(__name__)

NEIGHBOURS = 5
NEIGHBOUR_MIN_SIM = 0.60     # below this a stored claim is not worth comparing
FAST_DUPLICATE_SIM = 0.97    # with high word overlap, a duplicate without asking the LLM
FALLBACK_DUPLICATE_SIM = 0.92
FALLBACK_UPDATE_SIM = 0.75

_STOP = {
    "a", "an", "the", "is", "are", "was", "were", "be", "to", "of", "in", "on", "at",
    "for", "and", "or", "with", "user", "users", "user's", "their", "they", "has", "have",
    "that", "this", "as", "by", "it", "its", "from",
}


class Relation(str, Enum):
    DUPLICATE = "duplicate"
    UPDATE = "update"
    CONTRADICTS = "contradicts"
    UNRELATED = "unrelated"


_PRIORITY = {Relation.DUPLICATE: 3, Relation.UPDATE: 2, Relation.CONTRADICTS: 1, Relation.UNRELATED: 0}


@dataclass
class Neighbour:
    claim_id: str
    text: str
    similarity: float
    segment: str = ""
    status: str = ""


@dataclass
class Decision:
    """What to do with one candidate claim."""
    duplicate_of: Optional[str] = None            # stored claim id, or "batch:<i>"
    supersedes: list[str] = field(default_factory=list)
    contradicts: list[str] = field(default_factory=list)


def content_words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9']+", text.lower()) if w not in _STOP}


def jaccard(a: str, b: str) -> float:
    wa, wb = content_words(a), content_words(b)
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / len(wa | wb)


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(y * y for y in b) ** 0.5
    return dot / (na * nb) if na and nb else 0.0


async def find_neighbours(embedding: list[float], k: int = NEIGHBOURS) -> list[Neighbour]:
    hits = await asyncio.to_thread(
        get_opensearch().knn_search, IDX_CLAIMS, embedding, k,
        {"status": ["active", "provisional"]},
    )
    out = []
    for h in hits:
        sim = h.get("_cosine", 0.0)
        if sim >= NEIGHBOUR_MIN_SIM:
            out.append(Neighbour(h["_id"], h.get("claim_text", ""), sim,
                                 h.get("segment", ""), h.get("status", "")))
    return out


class Reconciler:
    async def plan(self, claims: list[CandidateClaim],
                   embeddings: list[list[float]]) -> list[Decision]:
        decisions = [Decision() for _ in claims]

        # 1. Duplicates inside this batch: the model sometimes states a fact twice.
        for i in range(len(claims)):
            for j in range(i):
                if decisions[j].duplicate_of:
                    continue
                sim = cosine(embeddings[i], embeddings[j])
                if sim >= FALLBACK_DUPLICATE_SIM and jaccard(claims[i].claim_text, claims[j].claim_text) >= 0.5:
                    decisions[i].duplicate_of = f"batch:{j}"
                    break

        # 2. Neighbours in the store.
        pending = [i for i, d in enumerate(decisions) if not d.duplicate_of]
        neighbour_lists = await asyncio.gather(*(find_neighbours(embeddings[i]) for i in pending))
        neighbours = dict(zip(pending, neighbour_lists))

        ask: dict[int, list[Neighbour]] = {}
        for i, ns in neighbours.items():
            if not ns:
                continue
            top = ns[0]
            if top.similarity >= FAST_DUPLICATE_SIM and jaccard(claims[i].claim_text, top.text) >= 0.6:
                decisions[i].duplicate_of = top.claim_id
                continue
            ask[i] = ns

        if not ask:
            return decisions

        relations = await self._judge(claims, ask)
        for i, ns in ask.items():
            for n in ns:
                rel = relations.get((i, n.claim_id)) or self._fallback(claims[i], n)
                d = decisions[i]
                if rel == Relation.DUPLICATE and not d.duplicate_of:
                    d.duplicate_of = n.claim_id
                elif rel == Relation.UPDATE:
                    d.supersedes.append(n.claim_id)
                elif rel == Relation.CONTRADICTS:
                    d.contradicts.append(n.claim_id)
            # A duplicate wins over everything else for the same candidate.
            if decisions[i].duplicate_of:
                decisions[i].supersedes.clear()
                decisions[i].contradicts.clear()
        return decisions

    @staticmethod
    def _fallback(claim: CandidateClaim, n: Neighbour) -> Relation:
        if n.similarity >= FALLBACK_DUPLICATE_SIM and jaccard(claim.claim_text, n.text) >= 0.5:
            return Relation.DUPLICATE
        if claim.is_update and n.similarity >= FALLBACK_UPDATE_SIM and (
            not n.segment or n.segment == claim.segment.value
        ):
            return Relation.UPDATE
        return Relation.UNRELATED

    async def _judge(self, claims: list[CandidateClaim],
                     ask: dict[int, list[Neighbour]]) -> dict[tuple[int, str], Relation]:
        blocks = []
        for i, ns in ask.items():
            flag = " (user signalled a change)" if claims[i].is_update else ""
            lines = [f"NEW {i}{flag}: {claims[i].claim_text}"]
            lines += [f"  EXISTING {n.claim_id}: {n.text}" for n in ns]
            blocks.append("\n".join(lines))
        messages = [
            SystemMessage(content=RECONCILE_SYSTEM_PROMPT),
            HumanMessage(content="\n\n".join(blocks)),
        ]
        try:
            resp = await llm.ainvoke(messages)
            data = json.loads(_clean_json(response_text(resp)))
        except Exception as exc:
            logger.warning("Reconcile judge failed, using similarity fallback: %s", exc)
            return {}

        out: dict[tuple[int, str], Relation] = {}
        valid = {(i, n.claim_id) for i, ns in ask.items() for n in ns}
        for item in data.get("decisions", []) or []:
            try:
                key = (int(item["new"]), str(item["existing"]))
                rel = Relation(str(item["relation"]).lower())
            except (KeyError, ValueError, TypeError):
                continue
            if key in valid and _PRIORITY[rel] >= _PRIORITY.get(out.get(key, Relation.UNRELATED), 0):
                out[key] = rel
        return out
