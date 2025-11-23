from typing import Dict, Any, Optional
from pydantic import BaseModel


class GenerateScriptRequest(BaseModel):
    goal: str
    target_url: Optional[str] = ""
    dom_structure: Optional[Dict[str, Any]] = {}
    constraints: Optional[Dict[str, Any]] = {}
