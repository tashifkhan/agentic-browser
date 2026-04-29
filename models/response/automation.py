from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

from models.requests.automation import BrowserAction


class AutomationStepResponse(BaseModel):
    run_id: str
    step: int
    done: bool = False
    message: str = ""
    actions: list[BrowserAction] = Field(default_factory=list)
    expected_state: Optional[str] = None
    verification: Optional[str] = None
    reason: str = ""
