import json
from dataclasses import dataclass, field

import httpx
from core.config import get_settings

_settings = get_settings()
_STREAM_URL = f"http://localhost:{_settings.backend_port}/api/genai/react/stream"
_AUTOMATION_EVENTS = {
    "automation_started",
    "automation_plan",
    "automation_observation",
}


@dataclass
class AgentResult:
    answer: str = ""
    tool_calls: list[str] = field(default_factory=list)
    conversation_id: str | None = None
    error: str | None = None


async def stream_response(question: str, conversation_id: str | None, remote_actions: bool = False) -> AgentResult:
    payload: dict = {
        "question": question,
        "client_id": "telegram-bot",
        # Browser tasks and Composio actions only for users on the allow list.
        "client_context": {"remote_actions": remote_actions, "surface": "telegram"},
    }
    if conversation_id:
        payload["conversation_id"] = conversation_id

    result = AgentResult()
    seen_tools: set[str] = set()

    try:
        # Browser tasks can run for many minutes.
        async with httpx.AsyncClient(timeout=httpx.Timeout(1200, connect=10)) as client:
            async with client.stream("POST", _STREAM_URL, json=payload) as response:
                response.raise_for_status()
                async for raw_line in response.aiter_lines():
                    if not raw_line.startswith("data: "):
                        continue
                    try:
                        event = json.loads(raw_line[6:])
                    except json.JSONDecodeError:
                        continue

                    event_type = event.get("event", "")

                    if event_type in _AUTOMATION_EVENTS:
                        continue

                    if event_type == "conversation":
                        result.conversation_id = event.get("conversation_id")

                    elif event_type == "subagent_tool_call":
                        tool = event.get("tool", "")
                        if tool and tool not in seen_tools:
                            seen_tools.add(tool)
                            result.tool_calls.append(tool)

                    elif event_type == "answer_delta":
                        result.answer = event.get("delta", "")

                    elif event_type == "final":
                        if not result.answer:
                            result.answer = event.get("answer", "")
                        break

                    elif event_type == "error":
                        result.error = event.get("message", "Unknown error from agent.")
                        break

    except httpx.HTTPStatusError as exc:
        result.error = f"Backend returned {exc.response.status_code}."
    except httpx.RequestError as exc:
        result.error = f"Could not reach backend: {exc}"
    except Exception as exc:
        result.error = f"Unexpected error: {exc}"

    return result
