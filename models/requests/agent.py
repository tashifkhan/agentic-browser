from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class GenerateScriptRequest(BaseModel):
    goal: str
    target_url: Optional[str] = ""
    dom_structure: Dict[str, Any] = Field(default_factory=dict)
    constraints: Dict[str, Any] = Field(default_factory=dict)
