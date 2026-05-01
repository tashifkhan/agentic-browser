from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from core import get_logger
from core.llm import llm
from models.requests.automation import ActionExecutionResult, BrowserAction, PageSnapshot
from models.requests.browser_runtime import (
    BrowserRuntimeStartRequest,
    BrowserRuntimeStepRequest,
)
from models.response.browser_runtime import BrowserRuntimeStepResponse
from prompts.browser_use import (
    build_runtime_prompt_payload,
    get_runtime_system_prompt,
)

logger = get_logger(__name__)


@dataclass
class BrowserRuntimeSession:
    session_id: str
    goal: str
    max_steps: int
    created_at: float = field(default_factory=time.time)
    step: int = 0
    last_page_signature: str = ""
    last_action_signature: str = ""
    stagnant_page_streak: int = 0
    repeated_action_streak: int = 0
    recent_history: list[dict[str, Any]] = field(default_factory=list)


class BrowserRuntimeService:
    _sessions: dict[str, BrowserRuntimeSession] = {}
    allowed_actions = {
        "NAVIGATE",
        "OPEN_TAB",
        "CLICK",
        "TYPE",
        "KEY_PRESS",
        "HOVER",
        "SCROLL",
        "WAIT",
        "MEDIA_CONTROL",
    }

    async def start_session(
        self,
        request: BrowserRuntimeStartRequest,
    ) -> BrowserRuntimeStepResponse:
        session = BrowserRuntimeSession(
            session_id=f"brt_{uuid.uuid4().hex}",
            goal=request.goal.strip(),
            max_steps=request.max_steps,
            last_page_signature=self._page_signature(request.page),
        )
        self._sessions[session.session_id] = session
        return await self._plan_next_step(
            session=session,
            page=request.page,
            latest_result=None,
            extra_context=request.context,
        )

    async def continue_session(
        self,
        request: BrowserRuntimeStepRequest,
    ) -> BrowserRuntimeStepResponse:
        session = self._sessions.get(request.session_id)
        if not session:
            raise ValueError(f"Unknown browser runtime session: {request.session_id}")

        self._record_progress(session, request.page, request.result)
        return await self._plan_next_step(
            session=session,
            page=request.page,
            latest_result=request.result,
            extra_context={},
        )

    def _record_progress(
        self,
        session: BrowserRuntimeSession,
        page: PageSnapshot,
        result: ActionExecutionResult | None,
    ) -> None:
        page_signature = self._page_signature(page)
        if page_signature == session.last_page_signature:
            session.stagnant_page_streak += 1
        else:
            session.stagnant_page_streak = 0
        session.last_page_signature = page_signature

        if result is not None:
            action_signature = self._action_signature(result.action)
            if action_signature == session.last_action_signature:
                session.repeated_action_streak += 1
            else:
                session.repeated_action_streak = 0
            session.last_action_signature = action_signature

            session.recent_history.append(
                {
                    "action": result.action.model_dump(mode="python"),
                    "success": result.success,
                    "error": result.error,
                    "verification": result.verification.model_dump(mode="python")
                    if result.verification
                    else None,
                    "after": {
                        "url": result.after.url if result.after else "",
                        "title": result.after.title if result.after else "",
                    },
                }
            )
            session.recent_history = session.recent_history[-6:]

    async def _plan_next_step(
        self,
        *,
        session: BrowserRuntimeSession,
        page: PageSnapshot,
        latest_result: ActionExecutionResult | None,
        extra_context: dict[str, Any],
    ) -> BrowserRuntimeStepResponse:
        if not session.goal:
            return self._final_response(
                session,
                message="Missing browser goal.",
                reason="Goal is required.",
                status="failed",
            )

        blocker = self._detect_user_blocker(page, session.goal)
        if blocker:
            return self._final_response(
                session,
                message=blocker,
                reason="Browser runtime detected a blocker that requires user intervention.",
                status="blocked",
                requires_user_input=True,
            )

        if latest_result and not latest_result.success and session.repeated_action_streak >= 2:
            return self._final_response(
                session,
                message="I stopped because the same browser action kept failing on the same page state.",
                reason="Repeated action failure guard reached.",
                status="blocked",
            )

        if session.stagnant_page_streak >= 3:
            return self._final_response(
                session,
                message="I stopped because the page state did not change across multiple browser steps.",
                reason="Stagnant page guard reached.",
                status="blocked",
            )

        if session.step >= session.max_steps:
            return self._final_response(
                session,
                message="I stopped after the maximum browser steps to avoid looping.",
                reason="Max browser step guard reached.",
                status="blocked",
            )

        system = get_runtime_system_prompt()
        prompt = build_runtime_prompt_payload(
            goal=session.goal,
            step=session.step + 1,
            max_steps=session.max_steps,
            session_state={
                "stagnant_page_streak": session.stagnant_page_streak,
                "repeated_action_streak": session.repeated_action_streak,
                "recent_history": session.recent_history[-4:],
            },
            current_page=self._serialise_page(page),
            latest_result=self._serialise_result(latest_result),
            extra_context=extra_context,
        )

        content: str | list[dict[str, Any]]
        if page.screenshot:
            content = [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": page.screenshot},
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
        except Exception as exc:
            logger.warning("Browser runtime planner failed: %s", exc)
            return self._final_response(
                session,
                message="I couldn't plan a reliable next browser action.",
                reason=str(exc),
                status="failed",
            )

        done = bool(parsed.get("done", False))
        action = self._parse_action(parsed.get("action"))
        message = str(parsed.get("message") or ("Done." if done else ""))
        expected_state = str(parsed.get("expected_state") or "")
        verification = str(parsed.get("verification") or "")
        reason = str(parsed.get("reason") or "Browser runtime planner.")

        if done or action is None:
            return self._final_response(
                session,
                message=message or "I could not identify a safe next browser action.",
                reason=reason,
                status="completed" if done else "blocked",
            )

        session.step += 1
        return BrowserRuntimeStepResponse(
            session_id=session.session_id,
            step=session.step,
            done=False,
            status="running",
            message=message,
            action=action,
            expected_state=expected_state,
            verification=verification,
            reason=reason,
            requires_user_input=False,
        )

    def _final_response(
        self,
        session: BrowserRuntimeSession,
        *,
        message: str,
        reason: str,
        status: str,
        requires_user_input: bool = False,
    ) -> BrowserRuntimeStepResponse:
        self._sessions.pop(session.session_id, None)
        return BrowserRuntimeStepResponse(
            session_id=session.session_id,
            step=session.step,
            done=True,
            status=status,
            message=message,
            action=None,
            expected_state="",
            verification="",
            reason=reason,
            requires_user_input=requires_user_input,
        )

    def _parse_action(self, value: Any) -> BrowserAction | None:
        if not isinstance(value, dict):
            return None
        action_type = str(value.get("type") or "").upper()
        if action_type not in self.allowed_actions:
            return None
        try:
            return BrowserAction(**{**value, "type": action_type})
        except Exception:
            logger.warning("Skipping invalid browser runtime action: %s", value)
            return None

    def _serialise_page(self, page: PageSnapshot) -> dict[str, Any]:
        data = page.model_dump(mode="python")
        data.pop("screenshot", None)
        data["visible_text"] = (data.get("visible_text") or "")[:5000]
        data["interactive"] = list(data.get("interactive") or [])[:80]
        return data

    def _serialise_result(self, result: ActionExecutionResult | None) -> dict[str, Any] | None:
        if result is None:
            return None
        data = result.model_dump(mode="python")
        before = data.get("before") or {}
        after = data.get("after") or {}
        if isinstance(before, dict):
            before.pop("screenshot", None)
        if isinstance(after, dict):
            after.pop("screenshot", None)
        return data

    def _page_signature(self, page: PageSnapshot) -> str:
        visible_text = (page.visible_text or "")[:600]
        interactive = [
            {
                "selector": item.selector,
                "text": item.text,
                "role": item.role,
            }
            for item in page.interactive[:12]
        ]
        return json.dumps(
            {
                "url": page.url,
                "title": page.title,
                "visible_text": visible_text,
                "interactive": interactive,
                "media": page.media.model_dump(mode="python") if page.media else None,
            },
            ensure_ascii=True,
            sort_keys=True,
            default=str,
        )

    def _action_signature(self, action: BrowserAction) -> str:
        return json.dumps(action.model_dump(mode="python"), ensure_ascii=True, sort_keys=True, default=str)

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

    def _extract_json(self, text: str) -> dict[str, Any]:
        candidate = text.strip()
        start = candidate.find("{")
        end = candidate.rfind("}")
        if start != -1 and end != -1 and end > start:
            candidate = candidate[start : end + 1]
        data = json.loads(candidate)
        if not isinstance(data, dict):
            raise ValueError("Browser runtime planner returned JSON that is not an object")
        return data

    def _detect_user_blocker(self, page: PageSnapshot, goal: str) -> str | None:
        haystack = " ".join(
            [
                page.title or "",
                page.visible_text or "",
                " ".join((item.text or "") for item in page.interactive[:40]),
            ]
        ).lower()
        goal_text = (goal or "").lower()
        login_allowed = any(term in goal_text for term in ("login", "log in", "sign in", "password", "otp"))
        if "captcha" in haystack or "i'm not a robot" in haystack or "i am not a robot" in haystack:
            return "This flow is blocked by a captcha and needs you to solve it in the browser first."
        if not login_allowed and ("sign in" in haystack or "log in" in haystack or "password" in haystack):
            return "This flow appears to be blocked by a login screen and needs your account interaction first."
        if "browser permission" in haystack or "allow notifications" in haystack or "permission request" in haystack:
            return "This flow is waiting on a browser or site permission prompt."
        return None
