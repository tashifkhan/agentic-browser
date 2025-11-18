from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import AliasChoices, BaseModel, Field


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
    google_access_token: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("google_access_token", "google_acces_token"),
        serialization_alias="google_access_token",
        description="OAuth access token with Gmail/Calendar scope.",
    )
    pyjiit_login_response: Optional[Dict[str, Any]] = Field(
        default=None,
        validation_alias=AliasChoices("pyjiit_login_response", "pyjiit_login_responce"),
        serialization_alias="pyjiit_login_response",
        description="Persisted PyJIIT login payload for authenticated requests.",
    )

    model_config = {
        "populate_by_name": True,
    }
