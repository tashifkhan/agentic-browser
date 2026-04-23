"""Query understanding and retrieval strategy planning."""
from __future__ import annotations
import json
import re
from dataclasses import dataclass, field
from typing import Optional

from langchain_core.messages import HumanMessage, SystemMessage

from core.config import get_logger
from core.llm import llm
from memory.models.enums import QueryType

logger = get_logger(__name__)

_SYSTEM = """You are a retrieval planner for a personal AI memory system.
Given a user query, classify it and extract signals for retrieval.

Respond ONLY with valid JSON:
{
  "query_type": "conversational|factual_recall|relational|temporal|planning|email_specific|profile|preference_sensitive|action_task",
  "entity_mentions": ["entity names mentioned or implied"],
  "time_constraint": "past|recent|specific_date|none",
  "needs_graph_traversal": true|false,
  "needs_email_context": true|false,
  "needs_resume_context": true|false,
  "preference_sensitive": true|false,
  "suggested_segments": ["segment names most likely to contain answer"],
  "suggested_predicates": ["predicate types to prioritize"]
}"""


def _clean(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    return raw.strip()


@dataclass
class QueryPlan:
    query_type: QueryType = QueryType.CONVERSATIONAL
    entity_mentions: list[str] = field(default_factory=list)
    time_constraint: str = "none"
    needs_graph_traversal: bool = False
    needs_email_context: bool = False
    needs_resume_context: bool = False
    preference_sensitive: bool = False
    suggested_segments: list[str] = field(default_factory=list)
    suggested_predicates: list[str] = field(default_factory=list)


class QueryPlanner:
    def plan(self, query: str) -> QueryPlan:
        """Classify query and build retrieval plan using cheap LLM call."""
        messages = [SystemMessage(content=_SYSTEM), HumanMessage(content=query)]
        try:
            resp = llm.invoke(messages)
            content = resp.content
            if isinstance(content, list):
                content = " ".join(p if isinstance(p, str) else p.get("text", "") for p in content)
            data = json.loads(_clean(str(content)))
        except Exception as exc:
            logger.debug("QueryPlanner LLM failed, using heuristics: %s", exc)
            return self._heuristic_plan(query)

        return QueryPlan(
            query_type=QueryType(data.get("query_type", "conversational")),
            entity_mentions=data.get("entity_mentions", []),
            time_constraint=data.get("time_constraint", "none"),
            needs_graph_traversal=bool(data.get("needs_graph_traversal", False)),
            needs_email_context=bool(data.get("needs_email_context", False)),
            needs_resume_context=bool(data.get("needs_resume_context", False)),
            preference_sensitive=bool(data.get("preference_sensitive", False)),
            suggested_segments=data.get("suggested_segments", []),
            suggested_predicates=data.get("suggested_predicates", []),
        )

    def _heuristic_plan(self, query: str) -> QueryPlan:
        """Fallback: regex/keyword-based planning."""
        q = query.lower()
        qt = QueryType.CONVERSATIONAL
        entity_mentions: list[str] = []
        needs_graph = False
        needs_email = False
        needs_resume = False
        pref_sensitive = False
        segments: list[str] = []

        if any(w in q for w in ("email", "gmail", "recruiter", "reply", "sent", "received")):
            qt = QueryType.EMAIL_SPECIFIC
            needs_email = True
            segments.append("communications_and_commitments")

        elif any(w in q for w in ("resume", "cv", "experience", "worked at", "degree", "studied")):
            qt = QueryType.PROFILE
            needs_resume = True
            segments += ["skills_and_background", "core_identity"]

        elif any(w in q for w in ("prefer", "don't", "always", "never", "stop", "remember", "setting")):
            qt = QueryType.PREFERENCE_SENSITIVE
            pref_sensitive = True
            segments.append("preferences_and_corrections")

        elif any(w in q for w in ("who", "knows", "works with", "colleague", "friend")):
            qt = QueryType.RELATIONAL
            needs_graph = True
            segments.append("people_and_relationships")

        elif any(w in q for w in ("when", "last time", "date", "ago", "history")):
            qt = QueryType.TEMPORAL

        elif any(w in q for w in ("project", "task", "goal", "deadline", "working on")):
            qt = QueryType.PLANNING
            segments.append("projects_and_goals")

        elif any(w in q for w in ("what", "who", "where", "tell me", "what is")):
            qt = QueryType.FACTUAL_RECALL

        return QueryPlan(
            query_type=qt,
            entity_mentions=entity_mentions,
            needs_graph_traversal=needs_graph,
            needs_email_context=needs_email,
            needs_resume_context=needs_resume,
            preference_sensitive=pref_sensitive,
            suggested_segments=segments,
        )
