from pydantic import BaseModel


class AskResponse(BaseModel):
    answer: str
    video_title: str
    video_channel: str
