"""Context assembler: packs retrieved memories into a token-budgeted context block."""

from __future__ import annotations

from typing import Any, Optional

import tiktoken

from core.config import get_logger
from memory.graph.traversal import GraphTraversal
from memory.retrieval.query_planner import QueryPlan
from models.memory import (
    ClaimSchema,
    ContextPackage,
    MemorySearchResult,
)

logger = get_logger(__name__)

_ENC = tiktoken.get_encoding("cl100k_base")


def _count_tokens(text: str) -> int:
    return len(_ENC.encode(text))


def _claim_to_line(c: ClaimSchema, include_meta: bool = False) -> str:
    line = c.claim_text
    if include_meta:
        line += f" [confidence={c.confidence:.2f}, tier={c.tier}]"
    return line


# Token budgets as fractions of total
_BUDGET = {
    "procedural": 0.15,
    "graph": 0.25,
    "semantic": 0.25,
    "evidence": 0.20,
    "profile": 0.15,
}


_HEADER_TOKENS = 10  # "## How the user wants you to respond" and blank lines


class ContextAssembler:
    def __init__(self, total_token_budget: int = 3000) -> None:
        self.budget = total_token_budget
        self._traversal = GraphTraversal()

    async def assemble(
        self,
        query: str,
        plan: QueryPlan,
        search_results: list[MemorySearchResult],
        graph_context: Optional[list[dict[str, Any]]] = None,
        include_profile: bool = True,
        procedural: Optional[list[ClaimSchema]] = None,
        profile_claims: Optional[list[ClaimSchema]] = None,
    ) -> ContextPackage:

        # One shared budget, counted on the text as it will be rendered
        # (bullet, suffix and section headers included). Facts that answer the
        # question go in first; standing preferences next; profile last. Each
        # lower-priority section may use at most its share of what is left, so
        # a tight budget keeps the relevant facts instead of the user's diet.
        remaining = self.budget - _HEADER_TOKENS * 4
        seen: set[str] = set()

        def take(text: str, share: float, spent: list[int]) -> bool:
            nonlocal remaining
            tokens = _count_tokens(text) + 1
            if tokens > remaining or spent[0] + tokens > share * self.budget:
                return False
            remaining -= tokens
            spent[0] += tokens
            return True

        semantic_packed: list[MemorySearchResult] = []
        spent = [0]
        for res in sorted(search_results, key=lambda r: r.score, reverse=True):
            cid = str(res.claim.claim_id)
            if cid in seen:
                continue
            if take(f"- {res.claim.claim_text} (confidence={res.claim.confidence:.2f})", 0.6, spent):
                semantic_packed.append(res)
                seen.add(cid)

        procedural_claims = (procedural if procedural is not None
                             else await self._traversal.get_procedural_memories())
        procedural_packed: list[ClaimSchema] = []
        spent = [0]
        for c in procedural_claims:
            if str(c.claim_id) in seen:
                continue
            if take(f"- {c.claim_text}", 0.3, spent):
                procedural_packed.append(c)
                seen.add(str(c.claim_id))

        graph_packed: list[dict[str, Any]] = []
        spent = [0]
        for item in graph_context or []:
            cid = str(item.get("claim_id") or "")
            text = item.get("text") or item.get("claim_text") or str(item)
            if cid and cid in seen:
                continue
            if take(f"- {text}", 0.25, spent):
                graph_packed.append(item)
                if cid:
                    seen.add(cid)

        profile_packed: list[ClaimSchema] = []
        if include_profile:
            plist = profile_claims if profile_claims is not None else await self._traversal.get_profile_claims()
            spent = [0]
            for c in plist:
                if str(c.claim_id) in seen:
                    continue
                if take(f"- {c.claim_text}", 0.25, spent):
                    profile_packed.append(c)
                    seen.add(str(c.claim_id))
        profile_summary = "\n".join(f"- {c.claim_text}" for c in profile_packed)

        pkg_preview = ContextPackage(
            procedural_memories=procedural_packed, semantic_facts=semantic_packed,
            graph_context=graph_packed, profile_summary=profile_summary,
        )
        total_used = _count_tokens(self.format_for_prompt(pkg_preview))
        logger.debug(
            "Context assembled: procedural=%d, semantic=%d, graph=%d, profile=%d, tokens=%d",
            len(procedural_packed), len(semantic_packed), len(graph_packed), len(profile_packed), total_used,
        )

        return ContextPackage(
            procedural_memories=procedural_packed,
            semantic_facts=semantic_packed,
            graph_context=graph_packed,
            source_evidence=[],
            profile_summary=profile_summary,
            profile_claims=profile_packed,
            total_tokens_estimate=total_used,
            query_type=plan.query_type,
        )

    def format_for_prompt(self, pkg: ContextPackage) -> str:
        """Render the context package as a structured text block for the LLM."""
        sections: list[str] = []

        if pkg.profile_summary:
            sections.append(f"## About the user\n{pkg.profile_summary}")

        if pkg.procedural_memories:
            lines = "\n".join(f"- {c.claim_text}" for c in pkg.procedural_memories)
            sections.append(f"## How the user wants you to respond\n{lines}")

        if pkg.semantic_facts:
            lines = "\n".join(
                f"- {r.claim.claim_text} (confidence={r.claim.confidence:.2f})"
                for r in pkg.semantic_facts
            )
            sections.append(f"## Relevant memories\n{lines}")

        if pkg.graph_context:
            lines = "\n".join(
                f"- {item.get('text') or item.get('claim_text') or str(item)}"
                for item in pkg.graph_context
            )
            sections.append(f"## Related memories\n{lines}")

        return "\n\n".join(sections)
