from pydantic import BaseModel
from typing import Optional, List, Dict


class VideoInfoRequest(BaseModel):
    url: str
