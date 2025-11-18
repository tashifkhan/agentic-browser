from __future__ import annotations

from typing import cast

from fastapi import APIRouter, HTTPException

from core import get_logger
from agents import run_react_agent
from agents.react_agent import AgentMessagePayload
from models.requests.react_agent import AgentMessage, ReactAgentRequest
from models.response.react_agent import ReactAgentResponse

router = APIRouter()
logger = get_logger(__name__)


def _to_payload(message: AgentMessage) -> AgentMessagePayload:
    data = message.model_dump(by_alias=False, exclude_none=True)
    return cast(AgentMessagePayload, data)


def _to_model(payload: AgentMessagePayload) -> AgentMessage:
    return AgentMessage.model_validate(payload)


@router.post("/", response_model=ReactAgentResponse)
async def invoke_react_agent(request: ReactAgentRequest) -> ReactAgentResponse:
    if not request.messages:
        raise HTTPException(
            status_code=400, detail="messages must contain at least one item"
        )

    try:
        payloads: list[AgentMessagePayload] = [
            _to_payload(message) for message in request.messages
        ]
        result_messages = await run_react_agent(payloads)
        models = [_to_model(payload) for payload in result_messages]
        latest = next((m for m in reversed(models) if m.role == "assistant"), None)
        output = latest.content if latest else ""
        return ReactAgentResponse(messages=models, output=output)
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.exception("react_agent invocation failed", exc_info=exc)
        raise HTTPException(status_code=500, detail=str(exc))
