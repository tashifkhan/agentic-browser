from pydantic import BaseModel


class WebsiteResponse(BaseModel):
    answer: str
