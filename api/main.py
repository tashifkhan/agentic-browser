from fastapi import FastAPI, HTTPException

from core.config import get_logger
from tools.website_context.request_md import return_markdown as fetch_markdown
from tools.website_context.html_md import return_html_md as html_to_md
from models.requests.website import WebsiteRequest
from models.response.website import WebsiteResponse


logger = get_logger(__name__)


app = FastAPI(title="Agentic Browser API", version="0.1.0")

# Register routers from the `routers` package for modular endpoints
from routers import (
    github_router,
    health_router,
    website_router,
    youtube_router,
    google_search_router,
)

app.include_router(health_router, prefix="/api/genai/health")
app.include_router(github_router, prefix="/api/genai/github")
app.include_router(website_router, prefix="/api/genai/website")
app.include_router(youtube_router, prefix="/api/genai/youtube")
app.include_router(google_search_router, prefix="/api/google-search")


# Optional root
@app.get("/")
def root():
    return {"name": app.title, "version": app.version}
