from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class ElementSnapshot(BaseModel):
    selector: Optional[str] = None
    tag: Optional[str] = None
    role: Optional[str] = None
    text: Optional[str] = None
    aria_label: Optional[str] = None
    placeholder: Optional[str] = None
    id: Optional[str] = None
    name: Optional[str] = None
    href: Optional[str] = None
    input_type: Optional[str] = None
    value: Optional[str] = None
    clickable: bool = False
    visible: bool = True


class MediaSnapshot(BaseModel):
    has_video: bool = False
    paused: Optional[bool] = None
    muted: Optional[bool] = None
    volume: Optional[float] = None
    current_time: Optional[float] = None
    duration: Optional[float] = None


class PageSnapshot(BaseModel):
    url: str = ""
    title: str = ""
    visible_text: str = ""
    active_element: Optional[ElementSnapshot] = None
    interactive: list[ElementSnapshot] = Field(default_factory=list)
    media: Optional[MediaSnapshot] = None
    screenshot: Optional[str] = None


class BrowserAction(BaseModel):
    type: str
    selector: Optional[str] = None
    text: Optional[str] = None
    role: Optional[str] = None
    value: Optional[str] = None
    url: Optional[str] = None
    active: Optional[bool] = None
    key: Optional[str] = None
    command: Optional[str] = None
    direction: Optional[str] = None
    amount: Optional[int] = None
    ms: Optional[int] = None
    description: Optional[str] = None


class VerificationResult(BaseModel):
    passed: bool = False
    expected: str = ""
    actual: Any = None


class ActionExecutionResult(BaseModel):
    action: BrowserAction
    success: bool
    error: Optional[str] = None
    verification: Optional[VerificationResult] = None
    before: Optional[PageSnapshot] = None
    after: Optional[PageSnapshot] = None


class AutomationStepRequest(BaseModel):
    run_id: Optional[str] = None
    goal: str
    step: int = 0
    page: PageSnapshot = Field(default_factory=PageSnapshot)
    previous_results: list[ActionExecutionResult] = Field(default_factory=list)
