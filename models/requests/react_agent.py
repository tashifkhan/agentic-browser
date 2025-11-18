from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class AgentMessage(BaseModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: str = Field(..., min_length=1)
    name: Optional[str] = None
    tool_call_id: Optional[str] = Field(default=None, alias="toolCallId")
    tool_calls: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        alias="toolCalls",
        description="Optional list of tool call payloads produced by the assistant.",
    )

    model_config = {
        "populate_by_name": True,
        "str_strip_whitespace": True,
    }


class ReactAgentRequest(BaseModel):
    messages: List[AgentMessage] = Field(..., min_length=1)
