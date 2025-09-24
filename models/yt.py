from typing import List, Optional
from pydantic import BaseModel, Field


class YTVideoInfo(BaseModel):
    title: str = Field(default="Unknown")
    description: str = Field(default="")
    duration: int = Field(default=0)
    uploader: str = Field(default="Unknown")
    upload_date: str = Field(default="")
    view_count: int = Field(default=0)
    like_count: int = Field(default=0)
    tags: List[str] = Field(default_factory=list)
    categories: List[str] = Field(default_factory=list)
    captions: Optional[str] = None
    transcript: Optional[str] = None
