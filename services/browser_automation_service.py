from __future__ import annotations

import json
import uuid
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from core import get_logger
from core.llm import llm
from models.requests.automation import AutomationStepRequest, BrowserAction
from models.response.automation import AutomationStepResponse

logger = get_logger(__name__)


class BrowserAutomationService:
    max_steps = 8
    allowed_actions = {
        "NAVIGATE",
        "OPEN_TAB",
        "CLICK",
        "TYPE",
        "KEY_PRESS",
        "HOVER",
        "SCROLL",
        "MEDIA_CONTROL",
        "WAIT",
    }

    async def plan_step(self, request: AutomationStepRequest) -> AutomationStepResponse:
        run_id = request.run_id or f"auto_{uuid.uuid4().hex}"
        step = request.step + 1

        if step > self.max_steps:
            return AutomationStepResponse(
                run_id=run_id,
                step=step,
                done=True,
                message="I stopped after the maximum automation steps to avoid looping.",
                reason="Max step guard reached.",
            )

        return await self._llm_plan(request, run_id, step)

    async def _llm_plan(
        self,
        request: AutomationStepRequest,
        run_id: str,
        step: int,
    ) -> AutomationStepResponse:
        system = """
You are a browser automation planner. You do not execute actions. You only choose the next safe browser action(s) based on:
- the user's goal
- the current page snapshot
- the current viewport screenshot, when provided
- previous execution results from the extension

Return ONLY valid JSON. No markdown, no prose outside JSON.

Required JSON shape:
{
  "done": boolean,
  "message": string,
  "actions": [
    {
      "type": "NAVIGATE" | "OPEN_TAB" | "CLICK" | "TYPE" | "KEY_PRESS" | "HOVER" | "SCROLL" | "MEDIA_CONTROL" | "WAIT",
      "url": string?,
      "selector": string?,
      "text": string?,
      "role": string?,
      "value": string?,
      "key": string?,
      "command": "mute" | "unmute" | "play" | "pause"?,
      "direction": "up" | "down" | "top" | "bottom"?,
      "amount": number?,
      "ms": number?,
      "description": string
    }
  ],
  "expected_state": string,
  "verification": string,
  "reason": string
}

Rules:
- Generate at most 2 actions per step.
- If the task is already complete according to current page state and previous results, set done=true and actions=[].
- Do not claim success unless the current page snapshot or previous result proves it.
- Use the screenshot for visual understanding of overlays, modals, cards, and layout. Use the structured page snapshot for selectors/text that actions can target.
- If an action failed, adapt using page state; do not repeat the same failed action unless there is a clear reason.
- For opening websites or searches, infer the target URL from the user's words. Prefer direct navigation when it is safer than typing into a page.
- For relative references like "him", "her", "this channel", "this page", infer the referent from the current page title, URL, visible text, and interactive elements.
- Treat required modals, overlays, cookie banners, region pickers, and login prompts as part of navigation. If the user's goal includes the missing value, complete that prerequisite before continuing.
- For multi-step website tasks, decompose the next step into the current visible blocker: choose location/region, close or accept non-essential overlays, search, select an exact visible result, then select dates/shows/seats as needed.
- If the requested item, city, option, movie, show, or result is visible in current_page.visible_text or current_page.interactive, prefer CLICK with exact visible text/selector over typing into search again.
- If a search field is visible and the target is not visible, TYPE the smallest useful query into that field and then KEY_PRESS Enter or click a matching suggestion on the next step.
- If a previous TYPE did not change the page or produced no matching result, do not keep typing the same value. Try clicking a visible option, clearing/refocusing the field, pressing Enter, or using another visible search/control.
- For video/media tasks, first ensure the requested video/page is actually open. Only then use MEDIA_CONTROL for play/pause/mute/unmute.
- For YouTube or other search result pages, choose CLICK with selector/text when a visible result matches the requested target.
- For clicking, prefer stable selectors from the provided interactive elements. Include exact text as an additional matching hint when useful; the executor can click visible text inside cards/divs, not just links/buttons.
- Ask for clarification by setting done=true with a concise message if the goal is ambiguous and cannot be safely inferred.
""".strip()

        screenshot = request.page.screenshot
        payload = {
            "goal": request.goal,
            "step": step,
            "max_steps": self.max_steps,
            "current_page": self._without_screenshot(request.page.model_dump()),
            "previous_results": [self._without_screenshot(result.model_dump()) for result in request.previous_results[-6:]],
        }
        prompt = json.dumps(payload, ensure_ascii=True, default=str)
        content: str | list[dict[str, Any]]
        if screenshot:
            content = [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": screenshot},
            ]
        else:
            content = prompt

        try:
            raw = await llm.ainvoke(
                [
                    SystemMessage(content=system),
                    HumanMessage(content=content),
                ]
            )
            parsed = self._extract_json(self._normalise_content(getattr(raw, "content", raw)))
            actions = self._parse_actions(parsed.get("actions", []))
            done = bool(parsed.get("done", False))

            if done:
                actions = []

            return AutomationStepResponse(
                run_id=run_id,
                step=step,
                done=done,
                message=str(parsed.get("message") or ("Done." if done else "")),
                actions=actions,
                expected_state=str(parsed.get("expected_state") or ""),
                verification=str(parsed.get("verification") or ""),
                reason=str(parsed.get("reason") or "LLM automation planner."),
            )
        except Exception as exc:
            logger.warning("Automation planner failed: %s", exc)
            return AutomationStepResponse(
                run_id=run_id,
                step=step,
                done=True,
                message="I couldn't plan a reliable browser action for that request.",
                reason=str(exc),
            )

    def _parse_actions(self, value: Any) -> list[BrowserAction]:
        if not isinstance(value, list):
            return []

        actions: list[BrowserAction] = []
        for item in value[:2]:
            if not isinstance(item, dict):
                continue
            action_type = str(item.get("type") or "").upper()
            if action_type not in self.allowed_actions:
                continue
            item = {**item, "type": action_type}
            try:
                actions.append(BrowserAction(**item))
            except Exception:
                logger.warning("Skipping invalid automation action: %s", item)
        return actions

    def _normalise_content(self, content: Any) -> str:
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts: list[str] = []
            for part in content:
                if isinstance(part, str):
                    parts.append(part)
                elif isinstance(part, dict) and part.get("type") == "text":
                    parts.append(str(part.get("text") or ""))
            if parts:
                return "".join(parts)
        return str(content)

    def _without_screenshot(self, value: Any) -> Any:
        if isinstance(value, dict):
            return {
                key: self._without_screenshot(item)
                for key, item in value.items()
                if key != "screenshot"
            }
        if isinstance(value, list):
            return [self._without_screenshot(item) for item in value]
        return value

    def _extract_json(self, text: str) -> dict[str, Any]:
        candidate = text.strip()
        start = candidate.find("{")
        end = candidate.rfind("}")
        if start != -1 and end != -1 and end > start:
            candidate = candidate[start : end + 1]
        data = json.loads(candidate)
        if not isinstance(data, dict):
            raise ValueError("Planner returned JSON that is not an object")
        return data
