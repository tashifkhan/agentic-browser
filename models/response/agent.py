from typing import Dict, Any, Optional, List
from pydantic import BaseModel


class GenerateScriptResponse(BaseModel):
    ok: bool
    action_plan: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    problems: Optional[List[str]] = None
    raw_response: Optional[str] = None
