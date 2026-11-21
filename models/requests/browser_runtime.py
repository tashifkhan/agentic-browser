from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

from models.requests.automation import ActionExecutionResult, PageSnapshot


class BrowserRuntimeStartRequest(BaseModel):
    goal: str
    page: PageSnapshot = Field(default_factory=PageSnapshot)
    # No cap by default: the loop guard stops runs that stop making progress.
    max_steps: Optional[int] = Field(default=None, ge=1)
    context: dict[str, Any] = Field(default_factory=dict)
    conversation_id: Optional[str] = None
    client_id: str = "browser-extension"
    persist: bool = False


class BrowserRuntimeStepRequest(BaseModel):
    session_id: str
    page: PageSnapshot = Field(default_factory=PageSnapshot)
    result: Optional[ActionExecutionResult] = None
