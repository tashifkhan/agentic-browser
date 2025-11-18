from pydantic import BaseModel, HttpUrl


class GitHubRequest(BaseModel):
    url: HttpUrl
    question: str
    chat_history: list[dict] = []
