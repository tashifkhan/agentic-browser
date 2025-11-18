from __future__ import annotations

from typing import List

from pydantic import BaseModel, Field

from models.requests.react_agent import AgentMessage


class ReactAgentResponse(BaseModel):
    messages: List[AgentMessage] = Field(
        ..., description="Final conversation state including the agent reply."
    )
    output: str = Field(..., description="Content of the latest assistant message.")
