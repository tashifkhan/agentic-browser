from __future__ import annotations

from typing import Optional

from pydantic import BaseModel

from models.requests.automation import BrowserAction


class BrowserRuntimeStepResponse(BaseModel):
    session_id: str
    step: int
    done: bool = False
    status: str = "running"
    message: str = ""
    action: Optional[BrowserAction] = None
    expected_state: Optional[str] = None
    verification: Optional[str] = None
    reason: str = ""
    requires_user_input: bool = False
    conversation_id: Optional[str] = None
    run_id: Optional[str] = None
