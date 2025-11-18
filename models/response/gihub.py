from pydantic import BaseModel


class GitHubResponse(BaseModel):
    content: str
