from pydantic import BaseModel
from typing import Optional


class WebsiteRequest(BaseModel):
    url: str
    question: str
    chat_history: Optional[list[dict]] = []
    client_html: Optional[str] = None
    attached_file_path: Optional[str] = None
