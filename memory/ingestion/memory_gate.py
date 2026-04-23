"""Memory gate: decides whether a candidate claim should be stored, and at what confidence."""
from __future__ import annotations
from dataclasses import dataclass
from enum import Enum

from memory.models.enums import MemoryClass, MemorySegment, EvidenceType
from memory.models.schemas import CandidateClaim


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

# Phrases that signal prompt injection / instruction from external content
_INJECTION_PATTERNS = [
    "ignore previous",
    "forget everything",
    "disregard",
    "new instructions",
    "system prompt",
    "you are now",
    "act as",
    "override",
    "jailbreak",
]


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
        text_lower = claim.claim_text.lower()

        # ── Hard reject: prompt injection signals ─────────────────────────────
        for pattern in _INJECTION_PATTERNS:
            if pattern in text_lower:
                return GateResult(
                    decision=GateDecision.REJECT,
                    reason=f"Injection pattern detected: '{pattern}'",
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

        # ── Auto-store: high-priority segment or class ────────────────────────
        if claim.segment in _AUTO_STORE_SEGMENTS or claim.memory_class in _AUTO_STORE_CLASSES:
            adjusted_importance = min(claim.base_importance * (0.8 + 0.4 * source_trust), 1.0)
            return GateResult(
                decision=GateDecision.STORE_AUTO,
                reason=f"High-priority segment/class: {claim.segment}/{claim.memory_class}",
                adjusted_confidence=min(effective_conf * 1.1, 1.0),
                adjusted_importance=adjusted_importance,
            )

        # ── Auto-store: explicit user-stated or confirmed evidence ────────────
        if claim.evidence_type in _HIGH_TRUST_EVIDENCE:
            return GateResult(
                decision=GateDecision.STORE_AUTO,
                reason="User-stated or confirmed evidence",
                adjusted_confidence=min(effective_conf * 1.2, 1.0),
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
