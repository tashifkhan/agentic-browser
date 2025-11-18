from pydantic import BaseModel
from typing import Optional, List, Dict


class SubtitlesRequest(BaseModel):
    url: str
    lang: Optional[str] = "en"
