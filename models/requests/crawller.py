from pydantic import BaseModel
from typing import Optional


class CrawlerRequest(BaseModel):
    question: str
    chat_history: Optional[list[dict]] = []
