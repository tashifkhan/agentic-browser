"""Memory gate: decides whether a candidate claim should be stored, and at what confidence."""
from __future__ import annotations
import re
from dataclasses import dataclass
from enum import Enum

from models.memory import MemoryClass, MemorySegment, EvidenceType
from models.memory import CandidateClaim


class GateDecision(str, Enum):
    STORE_AUTO        = "store_auto"        # store immediately as active
    STORE_PROVISIONAL = "store_provisional" # store with provisional status
    REJECT            = "reject"            # discard entirely


# Segments/classes that bypass the gate and auto-store
_AUTO_STORE_SEGMENTS = {
    MemorySegment.PREFERENCES,
    MemorySegment.CORE_IDENTITY,
    MemorySegment.SKILLS,
}
_AUTO_STORE_CLASSES = {
    MemoryClass.PROCEDURAL,
}

# Segments that always need confirmation (provisional)
_PROVISIONAL_SEGMENTS = {
    MemorySegment.COMMUNICATIONS,
    MemorySegment.CONTEXTUAL,
}

# Evidence types considered high-trust
_HIGH_TRUST_EVIDENCE = {
    EvidenceType.USER_STATED,
    EvidenceType.USER_CONFIRMED,
}

# Evidence types considered low-trust → provisional
_LOW_TRUST_EVIDENCE = {
    EvidenceType.INFERRED,
    EvidenceType.SYSTEM_DERIVED,
}

# Prompt-injection signals. Text from external sources (email, documents) is
# checked against all of them. The user's own chat messages are only checked
# against the strong ones: a user asking the assistant to "act as a strict
# reviewer" or to "override the default format" is a preference, not an attack.
_STRONG_INJECTION = [
    re.compile(p, re.IGNORECASE) for p in (
        r"\bignore (all |any |the )?(previous|prior|above|earlier) (instructions|messages|rules)",
        r"\bdisregard (all |any |the )?(previous|prior|above|earlier|your) (instructions|rules|guidelines)",
        r"\bforget everything\b",
        r"\b(reveal|print|show|leak) (your|the) (system prompt|instructions)",
        r"\bjailbreak",
        r"\bdeveloper mode\b",
    )
]
_WEAK_INJECTION = [
    re.compile(p, re.IGNORECASE) for p in (
        r"\bnew instructions\b",
        r"\bsystem prompt\b",
        r"\byou are now\b",
        r"\bact as\b",
        r"\boverride\b",
        r"\bdisregard\b",
    )
]
_EXTERNAL_SOURCES = {"email", "document", "gmail", "web"}


def _injection_hit(text: str, source_type: str) -> str | None:
    patterns = _STRONG_INJECTION + (_WEAK_INJECTION if source_type in _EXTERNAL_SOURCES else [])
    for pattern in patterns:
        if pattern.search(text):
            return pattern.pattern
    return None


def _cap(claim: CandidateClaim, confidence: float) -> float:
    """Only a user confirmation earns full confidence. Everything else tops out
    at 0.95, so confidence still separates confirmed facts from extracted ones."""
    ceiling = 1.0 if claim.evidence_type == EvidenceType.USER_CONFIRMED else 0.95
    return min(confidence, ceiling)


@dataclass
class GateResult:
    decision: GateDecision
    reason: str
    adjusted_confidence: float
    adjusted_importance: float


class MemoryGate:
    """
    Rules-first gate that decides what to do with a candidate claim.
    Expensive LLM judgement is only called for borderline cases.
    """

    def evaluate(self, claim: CandidateClaim, source_trust: float = 0.5,
                 source_type: str = "chat") -> GateResult:
        # ── Hard reject: prompt injection signals ─────────────────────────────
        hit = _injection_hit(claim.claim_text, source_type)
        if hit:
            return GateResult(
                decision=GateDecision.REJECT,
                reason=f"Injection pattern detected: {hit}",
                adjusted_confidence=0.0,
                adjusted_importance=0.0,
            )

        # ── Hard reject: external source with instruction-like claims ─────────
        if source_type in ("email", "document") and claim.memory_class == MemoryClass.PROCEDURAL:
            return GateResult(
                decision=GateDecision.REJECT,
                reason="Procedural claim from untrusted external source rejected",
                adjusted_confidence=0.0,
                adjusted_importance=0.0,
            )

        # ── Hard reject: too low confidence from low-trust source ─────────────
        effective_conf = claim.confidence * (0.5 + 0.5 * source_trust)
        if effective_conf < 0.2 and claim.evidence_type in _LOW_TRUST_EVIDENCE:
            return GateResult(
                decision=GateDecision.REJECT,
                reason="Confidence too low from low-trust source",
                adjusted_confidence=0.0,
                adjusted_importance=0.0,
            )

        # ── High-priority segment or class ────────────────────────────────────
        # These are injected into every prompt, so a guess must not land here
        # unchecked. Only stated (or confident, non-inferred) claims auto-store.
        high_priority = claim.segment in _AUTO_STORE_SEGMENTS or claim.memory_class in _AUTO_STORE_CLASSES
        if high_priority and (
            claim.needs_confirmation
            or claim.evidence_type in _LOW_TRUST_EVIDENCE
            or (claim.evidence_type not in _HIGH_TRUST_EVIDENCE and effective_conf < 0.6)
        ):
            return GateResult(
                decision=GateDecision.STORE_PROVISIONAL,
                reason=f"High-priority segment but not stated by the user: {claim.segment.value}",
                adjusted_confidence=effective_conf,
                adjusted_importance=claim.base_importance,
            )
        if high_priority:
            adjusted_importance = min(claim.base_importance * (0.8 + 0.4 * source_trust), 1.0)
            return GateResult(
                decision=GateDecision.STORE_AUTO,
                reason=f"High-priority segment/class: {claim.segment}/{claim.memory_class}",
                adjusted_confidence=_cap(claim, effective_conf * 1.1),
                adjusted_importance=adjusted_importance,
            )

        # ── Auto-store: explicit user-stated or confirmed evidence ────────────
        if claim.evidence_type in _HIGH_TRUST_EVIDENCE:
            return GateResult(
                decision=GateDecision.STORE_AUTO,
                reason="User-stated or confirmed evidence",
                adjusted_confidence=_cap(claim, effective_conf * 1.2),
                adjusted_importance=min(claim.base_importance * 1.1, 1.0),
            )

        # ── Provisional: marked by extractor or in provisional segments ───────
        if claim.needs_confirmation or claim.segment in _PROVISIONAL_SEGMENTS:
            return GateResult(
                decision=GateDecision.STORE_PROVISIONAL,
                reason="Needs confirmation or provisional segment",
                adjusted_confidence=effective_conf,
                adjusted_importance=claim.base_importance,
            )

        # ── Provisional: low-confidence inferred claims ───────────────────────
        if claim.evidence_type in _LOW_TRUST_EVIDENCE or effective_conf < 0.45:
            return GateResult(
                decision=GateDecision.STORE_PROVISIONAL,
                reason="Low-confidence or inferred claim",
                adjusted_confidence=effective_conf,
                adjusted_importance=claim.base_importance * 0.7,
            )

        # ── Default: store auto if confidence is reasonable ───────────────────
        return GateResult(
            decision=GateDecision.STORE_AUTO,
            reason="Passed all gate rules",
            adjusted_confidence=effective_conf,
            adjusted_importance=claim.base_importance,
        )

    def evaluate_batch(self, claims: list[CandidateClaim],
                       source_trust: float = 0.5,
                       source_type: str = "chat") -> list[tuple[CandidateClaim, GateResult]]:
        return [(c, self.evaluate(c, source_trust=source_trust, source_type=source_type))
                for c in claims]
