from __future__ import annotations

import json
from typing import Any, Optional

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from models.memory import MemoryClass, MemorySegment, MemoryTier
from models.memory import MemorySearchRequest, StoreClaimRequest
from memory.service import MemoryService


_SEGMENT_ALIASES: dict[str, MemorySegment] = {
    "identity": MemorySegment.CORE_IDENTITY,
    "core_identity": MemorySegment.CORE_IDENTITY,
    "preference": MemorySegment.PREFERENCES,
    "preferences": MemorySegment.PREFERENCES,
    "correction": MemorySegment.PREFERENCES,
    "preferences_and_corrections": MemorySegment.PREFERENCES,
    "project": MemorySegment.PROJECTS,
    "projects": MemorySegment.PROJECTS,
    "projects_and_goals": MemorySegment.PROJECTS,
    "relationship": MemorySegment.PEOPLE,
    "relationships": MemorySegment.PEOPLE,
    "people": MemorySegment.PEOPLE,
    "people_and_relationships": MemorySegment.PEOPLE,
    "skill": MemorySegment.SKILLS,
    "skills": MemorySegment.SKILLS,
    "skills_and_background": MemorySegment.SKILLS,
    "communication": MemorySegment.COMMUNICATIONS,
    "commitment": MemorySegment.COMMUNICATIONS,
    "communications_and_commitments": MemorySegment.COMMUNICATIONS,
    "context": MemorySegment.CONTEXTUAL,
    "contextual_incidents": MemorySegment.CONTEXTUAL,
    "reflection": MemorySegment.REFLECTIONS,
    "summary": MemorySegment.REFLECTIONS,
    "reflections_and_summaries": MemorySegment.REFLECTIONS,
}

_CLASS_ALIASES: dict[str, MemoryClass] = {
    "working": MemoryClass.WORKING,
    "episodic": MemoryClass.EPISODIC,
    "semantic": MemoryClass.SEMANTIC,
    "procedural": MemoryClass.PROCEDURAL,
    "social": MemoryClass.SOCIAL,
    "reflective": MemoryClass.REFLECTIVE,
}

_TIER_ALIASES: dict[str, MemoryTier] = {
    "working": MemoryTier.WORKING,
    "short": MemoryTier.SHORT_TERM,
    "short_term": MemoryTier.SHORT_TERM,
    "long": MemoryTier.LONG_TERM,
    "long_term": MemoryTier.LONG_TERM,
    "permanent": MemoryTier.PERMANENT,
}


def _coerce_segment(value: Optional[str]) -> MemorySegment:
    if not value:
        return MemorySegment.CONTEXTUAL
    return _SEGMENT_ALIASES.get(value.strip().lower(), MemorySegment.CONTEXTUAL)


def _coerce_class(value: Optional[str], segment: MemorySegment) -> MemoryClass:
    if value:
        found = _CLASS_ALIASES.get(value.strip().lower())
        if found:
            return found
    if segment == MemorySegment.PREFERENCES:
        return MemoryClass.PROCEDURAL
    if segment == MemorySegment.PEOPLE:
        return MemoryClass.SOCIAL
    if segment == MemorySegment.REFLECTIONS:
        return MemoryClass.REFLECTIVE
    return MemoryClass.SEMANTIC


def _coerce_tier(value: Optional[str], segment: MemorySegment, memory_class: MemoryClass) -> MemoryTier:
    if value:
        found = _TIER_ALIASES.get(value.strip().lower())
        if found:
            return found
    if segment == MemorySegment.PREFERENCES or memory_class == MemoryClass.PROCEDURAL:
        return MemoryTier.PERMANENT
    if segment in {MemorySegment.CORE_IDENTITY, MemorySegment.SKILLS, MemorySegment.PEOPLE}:
        return MemoryTier.LONG_TERM
    return MemoryTier.SHORT_TERM


class RecallMemoryInput(BaseModel):
    query: str = Field(..., description="Topic, user preference, project, person, or fact to search memory for.")
    top_k: int = Field(default=8, ge=1, le=20, description="Maximum memories to return.")
    include_provisional: bool = Field(
        default=False,
        description="Include provisional memories when uncertainty is acceptable.",
    )


class WriteMemoryInput(BaseModel):
    content: str = Field(..., description="Durable fact to remember, as one clear sentence.")
    segment: Optional[str] = Field(
        default=None,
        description=(
            "Memory category. Use identity, preference, correction, project, relationship, "
            "skill, communication, context, or reflection."
        ),
    )
    importance: float = Field(default=0.6, ge=0, le=1, description="How important this is to retain.")
    confidence: float = Field(default=0.75, ge=0, le=1, description="Confidence that the fact is true.")
    tier: Optional[str] = Field(default=None, description="Optional: working, short_term, long_term, permanent.")
    memory_class: Optional[str] = Field(
        default=None,
        description="Optional: working, episodic, semantic, procedural, social, reflective.",
    )
    predicate: Optional[str] = Field(default=None, description="Optional relation label, e.g. PREFERS, IS, WORKS_ON.")
    object_literal: Optional[str] = Field(default=None, description="Optional object/value for the claim.")


async def _recall_memory(query: str, top_k: int = 8, include_provisional: bool = False) -> str:
    try:
        results = await MemoryService().search(
            MemorySearchRequest(
                query=query,
                top_k=top_k,
                include_provisional=include_provisional,
            )
        )
    except Exception as exc:
        return f"Memory recall is unavailable: {exc}"

    if not results:
        return "No relevant memories found."

    lines = []
    for result in results:
        claim = result.claim
        lines.append(
            f"- [{claim.claim_id}] score={result.score:.3f} "
            f"{claim.tier.value}/{claim.segment.value} confidence={claim.confidence:.2f}: "
            f"{claim.claim_text}"
        )
    return "Relevant memories:\n" + "\n".join(lines)


async def _write_memory(
    content: str,
    segment: Optional[str] = None,
    importance: float = 0.6,
    confidence: float = 0.75,
    tier: Optional[str] = None,
    memory_class: Optional[str] = None,
    predicate: Optional[str] = None,
    object_literal: Optional[str] = None,
) -> str:
    content = content.strip()
    if not content:
        return "Memory not stored: content was empty."

    coerced_segment = _coerce_segment(segment)
    coerced_class = _coerce_class(memory_class, coerced_segment)
    coerced_tier = _coerce_tier(tier, coerced_segment, coerced_class)

    try:
        claim = await MemoryService().store_claim(
            StoreClaimRequest(
                claim_text=content,
                predicate=predicate or "IS",
                object_literal=object_literal,
                memory_class=coerced_class,
                segment=coerced_segment,
                tier=coerced_tier,
                confidence=confidence,
                base_importance=importance,
                user_confirmed=False,
            )
        )
    except Exception as exc:
        return f"Memory not stored: {exc}"

    return json.dumps(
        {
            "stored": True,
            "claim_id": str(claim.claim_id),
            "tier": claim.tier.value,
            "segment": claim.segment.value,
            "memory_class": claim.memory_class.value,
            "content": claim.claim_text,
        },
        ensure_ascii=True,
    )


memory_recall_tool = StructuredTool(
    name="recall_memory",
    description=(
        "Search durable memory for facts relevant to the current task. Call this early "
        "when the request touches user preferences, identity, projects, relationships, "
        "history, prior decisions, or recurring context."
    ),
    coroutine=_recall_memory,
    args_schema=RecallMemoryInput,
)

memory_write_tool = StructuredTool(
    name="write_memory",
    description=(
        "Persist a durable fact about the user, their preferences, identity, projects, "
        "relationships, skills, or ongoing commitments. Do not store secrets, one-time "
        "tokens, transient page state, or temporary moods."
    ),
    coroutine=_write_memory,
    args_schema=WriteMemoryInput,
)


MEMORY_TOOLS = [memory_recall_tool, memory_write_tool]
