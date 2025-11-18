from pydantic import BaseModel
from typing import Optional


class WebsiteRequest(BaseModel):
    url: str
    question: str
    chat_history: Optional[list[dict]] = []
