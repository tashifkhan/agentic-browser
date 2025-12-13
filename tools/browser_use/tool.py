from __future__ import annotations

import asyncio
from typing import Any, Dict, Optional

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from services.browser_use_service import AgentService


class BrowserActionInput(BaseModel):
    goal: str = Field(
        ..., description="The user's goal or instruction for the browser."
    )
    target_url: str = Field(
        default="", description="The URL to navigate to, if applicable."
    )
    dom_structure: Dict[str, Any] = Field(
        default_factory=dict, description="Optional DOM structure of the current page."
    )
    constraints: Dict[str, Any] = Field(
        default_factory=dict, description="Optional constraints for the action."
    )


async def _browser_action_tool(
    goal: str,
    target_url: str = "",
    dom_structure: Dict[str, Any] = {},
    constraints: Dict[str, Any] = {},
) -> Dict[str, Any]:
    service = AgentService()
    result = await service.generate_script(
        goal=goal,
        target_url=target_url,
        dom_structure=dom_structure,
        constraints=constraints,
    )
    return result


browser_action_agent = StructuredTool(
    name="browser_action_agent",
    description="Generate a JSON action plan to key elements in the browser like clicking, typing, or navigating.",
    coroutine=_browser_action_tool,
    args_schema=BrowserActionInput,
)
