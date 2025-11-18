from pydantic import BaseModel


class SubtitlesResponse(BaseModel):
    subtitles: str
