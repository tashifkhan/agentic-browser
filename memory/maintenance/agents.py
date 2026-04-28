"""Curator / Skeptic / Judge maintenance agent pipeline.

Decision ladder (cheapest to most expensive):
  1. Deterministic rules (free)
  2. Curator (cheap LLM) — proposes keep/archive/merge/promote
  3. Skeptic (cheap LLM) — challenges destructive actions
  4. Judge (expensive LLM) — final call on unresolved conflicts

Only the top 5% of ambiguous cases reach the Judge.
"""
from __future__ import annotations
import json
import re
from dataclasses import dataclass
from enum import Enum
from typing import Any, Optional

from langchain_core.messages import HumanMessage, SystemMessage

from core.config import get_logger
from core.llm import llm
from models.db.memory import ClaimORM

logger = get_logger(__name__)


class AgentDecision(str, Enum):
    KEEP        = "keep"
    ARCHIVE     = "archive"
    DELETE      = "delete"
    PROMOTE     = "promote"
    DEMOTE      = "demote"
    MERGE       = "merge"
    FLAG_REVIEW = "flag_review"


@dataclass
class AgentVerdict:
    decision: AgentDecision
    reasoning: str
    confidence: float
    merge_target_id: Optional[str] = None


def _clean(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    return raw.strip()


def _claim_summary(claim: ClaimORM) -> str:
    return (
        f"ID: {claim.claim_id}\n"
        f"Text: {claim.claim_text}\n"
        f"Segment: {claim.segment} | Class: {claim.memory_class} | Tier: {claim.tier}\n"
        f"Confidence: {claim.confidence:.2f} | Importance: {claim.base_importance:.2f} | "
        f"Trust: {claim.trust_score:.2f}\n"
        f"Access: {claim.access_count} | Hits: {claim.retrieval_hit_count} | "
        f"Contradictions: {claim.contradiction_count}\n"
        f"User confirmed: {claim.user_confirmed} | Status: {claim.status}"
    )


# ── Curator ────────────────────────────────────────────────────────────────────

_CURATOR_SYSTEM = """You are the Curator agent for a personal AI memory system.
Review the given memory claim and recommend an action.

Available actions: keep, archive, delete, promote, demote, flag_review

Rules:
- NEVER delete preferences, corrections, or user-confirmed facts without strong reason.
- Archive if the claim is stale and has low utility, not if it's just old.
- Promote if the claim has high access count and retrieval success.
- Flag for review if you are uncertain — do not guess on important claims.
- Delete only clearly duplicated or provably false claims.

Respond ONLY with JSON:
{"decision": "action", "reasoning": "brief reason", "confidence": 0.0-1.0}"""


class CuratorAgent:
    def evaluate(self, claim: ClaimORM) -> AgentVerdict:
        prompt = f"Evaluate this memory:\n\n{_claim_summary(claim)}"
        messages = [SystemMessage(content=_CURATOR_SYSTEM), HumanMessage(content=prompt)]
        try:
            resp = llm.invoke(messages)
            content = resp.content
            if isinstance(content, list):
                content = " ".join(p if isinstance(p, str) else p.get("text", "") for p in content)
            data = json.loads(_clean(str(content)))
            return AgentVerdict(
                decision=AgentDecision(data.get("decision", "keep")),
                reasoning=data.get("reasoning", ""),
                confidence=float(data.get("confidence", 0.5)),
            )
        except Exception as exc:
            logger.debug("Curator LLM error: %s", exc)
            return AgentVerdict(decision=AgentDecision.KEEP, reasoning="Parse error — keeping", confidence=0.5)


# ── Skeptic ────────────────────────────────────────────────────────────────────

_SKEPTIC_SYSTEM = """You are the Skeptic agent for a personal AI memory system.
A Curator has proposed a potentially destructive action (archive, delete, or promote to permanent).
Challenge it if there is any good reason to keep the memory or question the promotion.

Respond ONLY with JSON:
{"agree": true|false, "reasoning": "brief counter-argument if disagreeing", "confidence": 0.0-1.0}"""


class SkepticAgent:
    def challenge(self, claim: ClaimORM, curator_verdict: AgentVerdict) -> dict[str, Any]:
        prompt = (
            f"Curator proposed: {curator_verdict.decision} "
            f"(confidence={curator_verdict.confidence:.2f})\n"
            f"Reason: {curator_verdict.reasoning}\n\n"
            f"Memory:\n{_claim_summary(claim)}"
        )
        messages = [SystemMessage(content=_SKEPTIC_SYSTEM), HumanMessage(content=prompt)]
        try:
            resp = llm.invoke(messages)
            content = resp.content
            if isinstance(content, list):
                content = " ".join(p if isinstance(p, str) else p.get("text", "") for p in content)
            return json.loads(_clean(str(content)))
        except Exception:
            return {"agree": True, "reasoning": "Parse error — defaulting to agree", "confidence": 0.5}


# ── Judge ──────────────────────────────────────────────────────────────────────

_JUDGE_SYSTEM = """You are the Judge agent for a personal AI memory system.
The Curator and Skeptic have disagreed. Make the final binding decision.
Be conservative — when in doubt, keep or flag, never delete important memories.

Respond ONLY with JSON:
{"decision": "action", "reasoning": "full reasoning", "confidence": 0.0-1.0}"""


class JudgeAgent:
    def adjudicate(self, claim: ClaimORM, curator: AgentVerdict,
                   skeptic_response: dict[str, Any]) -> AgentVerdict:
        prompt = (
            f"Curator proposed: {curator.decision} — '{curator.reasoning}'\n"
            f"Skeptic disagreed: '{skeptic_response.get('reasoning', '')}'\n\n"
            f"Memory:\n{_claim_summary(claim)}"
        )
        messages = [SystemMessage(content=_JUDGE_SYSTEM), HumanMessage(content=prompt)]
        try:
            resp = llm.invoke(messages)
            content = resp.content
            if isinstance(content, list):
                content = " ".join(p if isinstance(p, str) else p.get("text", "") for p in content)
            data = json.loads(_clean(str(content)))
            return AgentVerdict(
                decision=AgentDecision(data.get("decision", "keep")),
                reasoning=data.get("reasoning", ""),
                confidence=float(data.get("confidence", 0.7)),
            )
        except Exception:
            return AgentVerdict(decision=AgentDecision.FLAG_REVIEW, reasoning="Judge parse error", confidence=0.3)


# ── Pipeline ───────────────────────────────────────────────────────────────────

class MaintenanceAgentPipeline:
    def __init__(self) -> None:
        self._curator  = CuratorAgent()
        self._skeptic  = SkepticAgent()
        self._judge    = JudgeAgent()

    def run_claim(self, claim: ClaimORM) -> AgentVerdict:
        """Run the full decision ladder for a single claim."""
        # Step 1: deterministic fast-rules
        fast = self._fast_rules(claim)
        if fast is not None:
            return fast

        # Step 2: Curator
        curator_verdict = self._curator.evaluate(claim)

        # Step 3: Skeptic only for destructive or high-stakes decisions
        destructive = curator_verdict.decision in (
            AgentDecision.DELETE, AgentDecision.ARCHIVE,
        )
        high_stakes = (
            curator_verdict.decision == AgentDecision.PROMOTE
            and claim.segment == "preferences_and_corrections"
        )
        if destructive or high_stakes:
            skeptic_resp = self._skeptic.challenge(claim, curator_verdict)
            skeptic_agrees = bool(skeptic_resp.get("agree", True))
            skeptic_conf   = float(skeptic_resp.get("confidence", 0.5))

            # Step 4: Judge if disagreement and high confidence on both sides
            if not skeptic_agrees and skeptic_conf >= 0.6 and curator_verdict.confidence >= 0.6:
                return self._judge.adjudicate(claim, curator_verdict, skeptic_resp)

            if not skeptic_agrees:
                return AgentVerdict(
                    decision=AgentDecision.FLAG_REVIEW,
                    reasoning=f"Skeptic disagreed: {skeptic_resp.get('reasoning', '')}",
                    confidence=min(curator_verdict.confidence, skeptic_conf),
                )

        return curator_verdict

    def _fast_rules(self, claim: ClaimORM) -> Optional[AgentVerdict]:
        """Deterministic rules that don't require LLM."""
        # Never auto-delete confirmed permanent preferences
        if (claim.user_confirmed
                and claim.tier == "permanent"
                and claim.segment == "preferences_and_corrections"):
            return AgentVerdict(
                decision=AgentDecision.KEEP,
                reasoning="User-confirmed permanent preference — protected",
                confidence=1.0,
            )

        # Auto-archive if explicitly stale and never accessed
        if claim.status == "stale" and claim.access_count == 0:
            return AgentVerdict(
                decision=AgentDecision.ARCHIVE,
                reasoning="Stale, zero accesses — archiving",
                confidence=0.9,
            )

        # Auto-promote if high access + confirmed + no contradictions
        if (claim.access_count >= 10
                and claim.retrieval_hit_count >= 7
                and claim.contradiction_count == 0
                and claim.confidence >= 0.8):
            return AgentVerdict(
                decision=AgentDecision.PROMOTE,
                reasoning="High usage and confidence — auto-promoting",
                confidence=0.85,
            )

        return None

    async def run_batch(self, claims: list[ClaimORM]) -> dict[str, list[str]]:
        """Process a batch and return grouped IDs by decision."""
        results: dict[str, list[str]] = {d.value: [] for d in AgentDecision}
        for claim in claims:
            verdict = self.run_claim(claim)
            results[verdict.decision.value].append(str(claim.claim_id))
        return results
