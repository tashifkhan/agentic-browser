from pydantic import BaseModel


class CrawllerResponse(BaseModel):
    answer: str
