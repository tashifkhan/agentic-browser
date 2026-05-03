from __future__ import annotations

from typing import Any, Dict

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from models.requests.browser_runtime import BrowserRuntimeStartRequest
from services.browser_runtime_page import build_page_snapshot_from_dom
from services.browser_runtime_service import BrowserRuntimeService


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
    dom_structure: Dict[str, Any] | None = None,
    constraints: Dict[str, Any] | None = None,
    *,
    _client_markdown: str = "",
) -> Dict[str, Any]:
    dom_structure = dict(dom_structure or {})
    constraints = dict(constraints or {})

    if not dom_structure and _client_markdown:
        dom_structure = {"interactive": [], "url": target_url, "title": "Current Page"}

    page = build_page_snapshot_from_dom(
        dom_structure=dom_structure,
        target_url=target_url,
        client_markdown=_client_markdown,
    )

    runtime = BrowserRuntimeService()
    step = await runtime.start_session(
        BrowserRuntimeStartRequest(
            goal=goal,
            page=page,
            max_steps=8,
            context={
                "target_url": target_url,
                "constraints": constraints,
                "source": "browser_action_agent",
            },
        )
    )

    action = step.action.model_dump(mode="python") if step.action else None
    result: Dict[str, Any] = {
        "ok": step.status != "failed",
        "message": step.message,
        "reason": step.reason,
        "runtime_step": step.model_dump(mode="python"),
        "requires_dom_refresh": bool(action),
    }
    if action:
        result["action_plan"] = {"actions": [action]}
    return result


browser_action_agent = StructuredTool(
    name="browser_action_agent",
    description="Plan the next browser runtime action for clicking, typing, navigating, and other page interactions.",
    coroutine=_browser_action_tool,
    args_schema=BrowserActionInput,
)
