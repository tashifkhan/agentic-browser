from fastapi import FastAPI, HTTPException

from core.config import get_logger
from models.requests.website import WebsiteRequest
from models.response.website import WebsiteResponse
from tools.website_context.html_md import return_html_md as html_to_md
from tools.website_context.request_md import return_markdown as fetch_markdown

logger = get_logger(__name__)


app = FastAPI(title="Agentic Browser API", version="0.1.0")

from routers import (
    calendar_router,
    github_router,
    gmail_router,
    google_search_router,
    health_router,
    pyjiit_router,
    react_agent_router,
    website_router,
    website_validator_router,
    youtube_router,
    agent_router,
)

app.include_router(health_router, prefix="/api/genai/health")
app.include_router(github_router, prefix="/api/genai/github")
app.include_router(website_router, prefix="/api/genai/website")
app.include_router(youtube_router, prefix="/api/genai/youtube")
app.include_router(google_search_router, prefix="/api/google-search")
app.include_router(gmail_router, prefix="/api/gmail")
app.include_router(calendar_router, prefix="/api/calendar")
app.include_router(pyjiit_router, prefix="/api/pyjiit")
app.include_router(react_agent_router, prefix="/api/genai/react")
app.include_router(website_validator_router, prefix="/api/validator")
app.include_router(agent_router, prefix="/api/agent")


# Optional root
@app.get("/")
def root():
    return {"name": app.title, "version": app.version}
