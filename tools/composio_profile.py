from __future__ import annotations

import json
from typing import Any

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from memory.service import MemoryService
from models.memory import IngestComposioAeroLeadsRequest, IngestComposioLinkedInRequest


def _dump(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=True, default=str, indent=2)
    except TypeError:
        return str(value)


class ComposioLinkedInMeInput(BaseModel):
    ingest: bool = Field(default=True, description="Store the fetched LinkedIn profile in memory and the knowledge graph.")


class ComposioAeroLeadsLinkedInInput(BaseModel):
    linkedin_url: str = Field(..., description="LinkedIn profile URL to enrich through AeroLeads.")
    ingest: bool = Field(default=True, description="Store the enriched profile in memory and the knowledge graph.")


async def _linkedin_me(ingest: bool = True) -> str:
    try:
        result = await MemoryService().ingest_composio_linkedin_self(
            IngestComposioLinkedInRequest(ingest=ingest)
        )
        return _dump(result.model_dump())
    except Exception as exc:
        return f"Unable to fetch LinkedIn profile through Composio: {exc}"


async def _aeroleads_linkedin(linkedin_url: str, ingest: bool = True) -> str:
    try:
        result = await MemoryService().ingest_composio_aeroleads_linkedin(
            IngestComposioAeroLeadsRequest(linkedin_url=linkedin_url, ingest=ingest)
        )
        return _dump(result.model_dump())
    except Exception as exc:
        return f"Unable to enrich LinkedIn profile through Composio AeroLeads: {exc}"


composio_linkedin_me_tool = StructuredTool(
    name="composio_linkedin_me",
    description=(
        "Fetch the authenticated user's LinkedIn profile via Composio LinkedIn and optionally "
        "ingest it into durable memory and the knowledge graph. Requires COMPOSIO_API_KEY, "
        "COMPOSIO_USER_ID, and a connected LinkedIn account in Composio."
    ),
    coroutine=_linkedin_me,
    args_schema=ComposioLinkedInMeInput,
)

composio_aeroleads_linkedin_tool = StructuredTool(
    name="composio_aeroleads_linkedin",
    description=(
        "Use Composio AeroLeads to enrich a LinkedIn profile URL, then optionally ingest the "
        "result into durable profile memory and the knowledge graph."
    ),
    coroutine=_aeroleads_linkedin,
    args_schema=ComposioAeroLeadsLinkedInInput,
)


COMPOSIO_PROFILE_TOOLS = [composio_linkedin_me_tool, composio_aeroleads_linkedin_tool]
