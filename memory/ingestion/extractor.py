"""LLM-based entity and claim extractor with structured output."""
from __future__ import annotations
import json
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import GoogleGenerativeAIEmbeddings

from core.config import get_settings, get_logger
from core.llm import llm
from prompts.memory import EXTRACTION_SYSTEM_PROMPT
from models.memory import (
    EntityType, MemoryClass, MemorySegment, EvidenceType,
)
from models.memory import (
    CandidateClaim, CandidateEntity, ExtractionResult,
)

logger = get_logger(__name__)

_EMBEDDINGS = GoogleGenerativeAIEmbeddings(
    model="models/text-embedding-004",
    google_api_key=get_settings().google_api_key,
)

EXTRACTOR_VERSION = "1.0.0"

def _clean_json(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    return raw.strip()


class Extractor:
    def __init__(self) -> None:
        self._llm = llm

    def embed(self, texts: list[str]) -> list[list[float]]:
        return _EMBEDDINGS.embed_documents(texts)

    def embed_one(self, text: str) -> list[float]:
        return _EMBEDDINGS.embed_query(text)

    def extract(self, text: str, source_type: str = "chat",
                trust_level: int = 5, context: str = "") -> ExtractionResult:
        """Run LLM extraction and return structured result."""
        source_trust = min(trust_level / 10.0, 1.0)
        prompt = f"""Source type: {source_type}
Trust level: {trust_level}/10
Context: {context or 'none'}

TEXT TO EXTRACT FROM:
---
{text[:6000]}
---

Extract entities and claims following the JSON schema."""

        messages = [SystemMessage(content=EXTRACTION_SYSTEM_PROMPT), HumanMessage(content=prompt)]
        try:
            response = self._llm.invoke(messages)
            content = response.content
            if isinstance(content, list):
                content = " ".join(
                    p if isinstance(p, str) else p.get("text", "") for p in content
                )
            raw = _clean_json(str(content))
            data = json.loads(raw)
        except (json.JSONDecodeError, Exception) as exc:
            logger.warning("Extraction parse failed: %s", exc)
            return ExtractionResult(source_trust=source_trust)

        entities = []
        for e in data.get("entities", []):
            try:
                entities.append(CandidateEntity(
                    canonical_name=e["canonical_name"],
                    entity_type=EntityType(e.get("entity_type", "topic")),
                    description=e.get("description"),
                    aliases=e.get("aliases", []),
                ))
            except Exception as exc:
                logger.debug("Skipping bad entity: %s — %s", e, exc)

        claims = []
        for c in data.get("claims", []):
            try:
                claims.append(CandidateClaim(
                    claim_text=c["claim_text"],
                    predicate=c.get("predicate", "IS"),
                    subject_name=c["subject_name"],
                    object_name=c.get("object_name"),
                    memory_class=MemoryClass(c.get("memory_class", "semantic")),
                    segment=MemorySegment(c.get("segment", "contextual_incidents")),
                    confidence=float(c.get("confidence", 0.6)),
                    base_importance=float(c.get("base_importance", 0.5)),
                    needs_confirmation=bool(c.get("needs_confirmation", False)),
                    evidence_type=EvidenceType(c.get("evidence_type", "extracted")),
                ))
            except Exception as exc:
                logger.debug("Skipping bad claim: %s — %s", c, exc)

        return ExtractionResult(
            entities=entities,
            claims=claims,
            summary=data.get("summary"),
            source_trust=source_trust,
        )

    def summarize(self, text: str, max_sentences: int = 3) -> str:
        prompt = f"Summarize the following in {max_sentences} sentences:\n\n{text[:4000]}"
        messages = [HumanMessage(content=prompt)]
        try:
            resp = self._llm.invoke(messages)
            content = resp.content
            if isinstance(content, list):
                content = " ".join(p if isinstance(p, str) else p.get("text", "") for p in content)
            return str(content).strip()
        except Exception:
            return text[:300]
