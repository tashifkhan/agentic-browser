"""LLM-based entity and claim extractor with structured output.

Every method is async. LLM calls go through `ainvoke` and embeddings through
memory.embeddings, so extraction never blocks the event loop.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any, Optional

from langchain_core.messages import HumanMessage, SystemMessage

from core.config import get_logger
from core.llm import llm
from memory import embeddings
from prompts.memory import CHAT_EXTRACTION_RULES, EXTRACTION_SYSTEM_PROMPT
from models.memory import (
    CandidateClaim, CandidateEntity, EntityType, EvidenceType, ExtractionResult,
    MemoryClass, MemorySegment,
)

logger = get_logger(__name__)

EXTRACTOR_VERSION = "2.0.0"

# Names the extractor may use for the person talking to the assistant. They all
# resolve to one "User" entity so identity isn't split across several nodes.
USER_ENTITY_NAME = "User"
_USER_SYNONYMS = {"user", "the user", "current user", "me", "i", "myself", "self"}
_ASSISTANT_NAMES = {"assistant", "the assistant", "ai", "ai assistant", "chatbot", "bot"}


def normalize_subject(name: Optional[str]) -> Optional[str]:
    if name is None:
        return None
    if name.strip().lower() in _USER_SYNONYMS:
        return USER_ENTITY_NAME
    return name.strip()


def _clean_json(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    return raw.strip()


def response_text(response: Any) -> str:
    content = getattr(response, "content", response)
    if isinstance(content, list):
        content = " ".join(p if isinstance(p, str) else p.get("text", "") for p in content)
    return str(content)


def _parse_date(value: Any) -> Optional[datetime]:
    if not value or not isinstance(value, str):
        return None
    try:
        dt = datetime.fromisoformat(value.strip()[:19])
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


class Extractor:
    def __init__(self) -> None:
        self._llm = llm

    # ── Embeddings ─────────────────────────────────────────────────────────────

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return await embeddings.embed_documents(texts)

    async def embed_one(self, text: str) -> list[float]:
        """Embed a stored text (claim, chunk, summary)."""
        return (await embeddings.embed_documents([text]))[0]

    async def embed_query(self, text: str) -> list[float]:
        """Embed a search query. Some providers use a separate query task type."""
        return await embeddings.embed_query(text)

    # ── Extraction ─────────────────────────────────────────────────────────────

    async def extract(self, text: str, source_type: str = "chat",
                      trust_level: int = 5, context: str = "",
                      reference_date: Optional[datetime] = None) -> ExtractionResult:
        """Run LLM extraction over arbitrary text (documents, email)."""
        prompt = f"""Source type: {source_type}
Trust level: {trust_level}/10
Context: {context or 'none'}
Message date: {(reference_date or datetime.now(timezone.utc)).date().isoformat()}

TEXT TO EXTRACT FROM:
---
{text[:6000]}
---

Extract entities and claims following the JSON schema."""
        return await self._run(EXTRACTION_SYSTEM_PROMPT, prompt, trust_level)

    async def extract_chat_turn(self, user_message: str, assistant_message: str,
                                reference_date: Optional[datetime] = None,
                                trust_level: int = 9) -> ExtractionResult:
        """Extract durable facts the user stated. The assistant reply is context only."""
        prompt = f"""Source type: chat
Message date: {(reference_date or datetime.now(timezone.utc)).date().isoformat()}

USER MESSAGE (extract from this):
---
{user_message[:4000]}
---

ASSISTANT REPLY (context only, do not extract from it):
---
{assistant_message[:1500]}
---

Extract entities and claims following the JSON schema and the chat rules."""
        system = f"{EXTRACTION_SYSTEM_PROMPT}\n\n{CHAT_EXTRACTION_RULES}"
        result = await self._run(system, prompt, trust_level)
        # The model sometimes still files the user under another name or invents
        # an assistant entity. Normalise both.
        result.entities = [e for e in result.entities
                           if e.canonical_name.strip().lower() not in _ASSISTANT_NAMES]
        result.claims = [c for c in result.claims
                         if c.subject_name.strip().lower() not in _ASSISTANT_NAMES]
        return result

    async def _run(self, system: str, prompt: str, trust_level: int) -> ExtractionResult:
        source_trust = min(trust_level / 10.0, 1.0)
        messages = [SystemMessage(content=system), HumanMessage(content=prompt)]
        try:
            response = await self._llm.ainvoke(messages)
            data = json.loads(_clean_json(response_text(response)))
        except Exception as exc:
            logger.warning("Extraction failed: %s", exc)
            return ExtractionResult(source_trust=source_trust)

        entities: list[CandidateEntity] = []
        seen_entities: dict[str, CandidateEntity] = {}
        for e in data.get("entities", []) or []:
            try:
                name = normalize_subject(e["canonical_name"]) or e["canonical_name"]
                aliases = [a for a in (e.get("aliases") or []) if isinstance(a, str)]
                if name == USER_ENTITY_NAME and e["canonical_name"] != USER_ENTITY_NAME:
                    aliases.append(e["canonical_name"])
                key = name.lower()
                if key in seen_entities:
                    seen_entities[key].aliases = sorted(set(seen_entities[key].aliases) | set(aliases))
                    continue
                cand = CandidateEntity(
                    canonical_name=name,
                    entity_type=EntityType(e.get("entity_type", "topic")),
                    description=e.get("description"),
                    aliases=sorted(set(aliases)),
                )
                seen_entities[key] = cand
                entities.append(cand)
            except Exception as exc:
                logger.debug("Skipping bad entity: %s (%s)", e, exc)

        claims: list[CandidateClaim] = []
        seen_claims: set[str] = set()
        for c in data.get("claims", []) or []:
            try:
                text = str(c["claim_text"]).strip()
                key = re.sub(r"\W+", " ", text.lower()).strip()
                if not text or key in seen_claims:
                    continue
                seen_claims.add(key)
                claims.append(CandidateClaim(
                    claim_text=text,
                    predicate=c.get("predicate") or "IS",
                    subject_name=normalize_subject(c["subject_name"]) or USER_ENTITY_NAME,
                    object_name=c.get("object_name"),
                    memory_class=MemoryClass(c.get("memory_class", "semantic")),
                    segment=MemorySegment(c.get("segment", "contextual_incidents")),
                    confidence=min(max(float(c.get("confidence", 0.6)), 0.0), 1.0),
                    base_importance=min(max(float(c.get("base_importance", 0.5)), 0.0), 1.0),
                    needs_confirmation=bool(c.get("needs_confirmation", False)),
                    evidence_type=EvidenceType(c.get("evidence_type", "extracted")),
                    valid_from=_parse_date(c.get("valid_from")),
                    is_update=bool(c.get("is_update", False)),
                ))
            except Exception as exc:
                logger.debug("Skipping bad claim: %s (%s)", c, exc)

        return ExtractionResult(
            entities=entities,
            claims=claims,
            summary=data.get("summary"),
            source_trust=source_trust,
        )

    async def summarize(self, text: str, max_sentences: int = 3) -> str:
        prompt = f"Summarize the following in {max_sentences} sentences:\n\n{text[:4000]}"
        try:
            resp = await self._llm.ainvoke([HumanMessage(content=prompt)])
            return response_text(resp).strip()
        except Exception:
            return text[:300]
