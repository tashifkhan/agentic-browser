from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

from models.requests.automation import ActionExecutionResult, PageSnapshot


class BrowserRuntimeStartRequest(BaseModel):
    goal: str
    page: PageSnapshot = Field(default_factory=PageSnapshot)
    max_steps: int = Field(default=8, ge=1, le=20)
    context: dict[str, Any] = Field(default_factory=dict)


class BrowserRuntimeStepRequest(BaseModel):
    session_id: str
    page: PageSnapshot = Field(default_factory=PageSnapshot)
    result: Optional[ActionExecutionResult] = None
