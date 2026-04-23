"""Context assembler: packs retrieved memories into a token-budgeted context block."""
from __future__ import annotations
from typing import Any, Optional

import tiktoken

from core.config import get_logger
from memory.graph.traversal import GraphTraversal
from memory.models.schemas import (
    ArtifactSchema, ClaimSchema, ContextPackage, MemorySearchResult,
)
from memory.retrieval.query_planner import QueryPlan

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
    "procedural":  0.15,
    "graph":       0.25,
    "semantic":    0.25,
    "evidence":    0.20,
    "profile":     0.15,
}


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
    ) -> ContextPackage:

        budgets = {k: int(v * self.budget) for k, v in _BUDGET.items()}
        used: dict[str, int] = {k: 0 for k in budgets}

        # 1. Procedural memories (always first)
        procedural_claims = await self._traversal.get_procedural_memories()
        procedural_packed: list[ClaimSchema] = []
        for c in procedural_claims:
            line = _claim_to_line(c)
            tokens = _count_tokens(line)
            if used["procedural"] + tokens <= budgets["procedural"]:
                procedural_packed.append(c)
                used["procedural"] += tokens

        # 2. Profile summary
        profile_summary = ""
        if include_profile:
            raw_profile = await self._traversal.get_profile_summary()
            if raw_profile:
                tokens = _count_tokens(raw_profile)
                if tokens <= budgets["profile"]:
                    profile_summary = raw_profile
                    used["profile"] = tokens
                else:
                    # truncate
                    lines = raw_profile.splitlines()
                    kept = []
                    tok_count = 0
                    for line in lines:
                        lt = _count_tokens(line)
                        if tok_count + lt > budgets["profile"]:
                            break
                        kept.append(line)
                        tok_count += lt
                    profile_summary = "\n".join(kept)
                    used["profile"] = tok_count

        # 3. Semantic search results
        semantic_packed: list[MemorySearchResult] = []
        for res in sorted(search_results, key=lambda r: r.score, reverse=True):
            line = _claim_to_line(res.claim)
            tokens = _count_tokens(line)
            if used["semantic"] + tokens <= budgets["semantic"]:
                semantic_packed.append(res)
                used["semantic"] += tokens
            else:
                break

        # 4. Graph context
        graph_packed: list[dict[str, Any]] = []
        if graph_context:
            for item in graph_context:
                text = item.get("text") or item.get("claim_text") or str(item)
                tokens = _count_tokens(text)
                if used["graph"] + tokens <= budgets["graph"]:
                    graph_packed.append(item)
                    used["graph"] += tokens
                else:
                    break

        total_used = sum(used.values())
        logger.debug(
            "Context assembled: procedural=%d, semantic=%d, graph=%d, profile=%d, total_tokens≈%d",
            len(procedural_packed), len(semantic_packed), len(graph_packed),
            bool(profile_summary), total_used,
        )

        return ContextPackage(
            procedural_memories=procedural_packed,
            semantic_facts=semantic_packed,
            graph_context=graph_packed,
            source_evidence=[],
            profile_summary=profile_summary,
            total_tokens_estimate=total_used,
            query_type=plan.query_type,
        )

    def format_for_prompt(self, pkg: ContextPackage) -> str:
        """Render the context package as a structured text block for the LLM."""
        sections: list[str] = []

        if pkg.profile_summary:
            sections.append(f"## User Profile\n{pkg.profile_summary}")

        if pkg.procedural_memories:
            lines = "\n".join(f"- {c.claim_text}" for c in pkg.procedural_memories)
            sections.append(f"## Preferences & Instructions\n{lines}")

        if pkg.semantic_facts:
            lines = "\n".join(
                f"- {r.claim.claim_text} (confidence={r.claim.confidence:.2f})"
                for r in pkg.semantic_facts
            )
            sections.append(f"## Relevant Facts\n{lines}")

        if pkg.graph_context:
            lines = "\n".join(
                f"- {item.get('text') or item.get('claim_text') or str(item)}"
                for item in pkg.graph_context
            )
            sections.append(f"## Graph Context\n{lines}")

        return "\n\n".join(sections)
