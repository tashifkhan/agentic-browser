from pydantic import BaseModel, Field
from typing import Optional, List

class SkillDetails(BaseModel):
    id: str
    name: str
    description: str

class SkillsListResponse(BaseModel):
    skills: List[SkillDetails]

class ExecuteSkillRequest(BaseModel):
    skill_name: str
    prompt: Optional[str] = ""
    chat_history: Optional[List[dict]] = None
    google_access_token: Optional[str] = None
    pyjiit_login_response: Optional[dict] = None
    client_html: Optional[str] = None
    attached_file_path: Optional[str] = None

class ExecuteSkillResponse(BaseModel):
    answer: str
