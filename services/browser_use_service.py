from __future__ import annotations

from typing import Any

from core import get_logger
from models.requests.browser_runtime import BrowserRuntimeStartRequest
from services.browser_runtime_page import build_page_snapshot_from_dom
from services.browser_runtime_service import BrowserRuntimeService

logger = get_logger(__name__)


class AgentService:
    async def generate_script(
        self,
        goal: str,
        target_url: str = "",
        dom_structure: dict[str, Any] | None = None,
        constraints: dict[str, Any] | None = None,
        client_markdown: str = "",
    ) -> dict[str, Any]:
        try:
            dom_structure = dict(dom_structure or {})
            constraints = dict(constraints or {})
            page = build_page_snapshot_from_dom(
                dom_structure=dom_structure,
                target_url=target_url,
                client_markdown=client_markdown,
            )

            step = await BrowserRuntimeService().start_session(
                BrowserRuntimeStartRequest(
                    goal=goal,
                    page=page,
                    max_steps=8,
                    context={
                        "target_url": target_url,
                        "constraints": constraints,
                        "source": "generate_script_api",
                    },
                )
            )

            action = step.action.model_dump(mode="python") if step.action else None
            result: dict[str, Any] = {
                "ok": step.status != "failed",
                "message": step.message,
                "reason": step.reason,
                "runtime_step": step.model_dump(mode="python"),
            }
            if action:
                result["action_plan"] = {"actions": [action]}
            return result
        except Exception as exc:
            logger.exception("Error generating script: %s", exc)
            return {"ok": False, "error": str(exc)}
