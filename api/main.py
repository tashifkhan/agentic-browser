from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from core.config import get_logger
from models.requests.website import WebsiteRequest
from models.response.website import WebsiteResponse
from tools.website_context.html_md import return_html_md as html_to_md
from tools.website_context.request_md import return_markdown as fetch_markdown

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Connect memory stores on startup, disconnect on shutdown."""
    from memory.db.neo4j_client import get_neo4j
    from memory.db.opensearch_client import get_opensearch
    from memory.db.postgres import init_db

    logger.info("Initialising memory stores...")
    try:
        await init_db()
        logger.info("Postgres: ready")
    except Exception as exc:
        logger.warning("Postgres init skipped: %s", exc)

    try:
        neo4j = get_neo4j()
        await neo4j.connect()
        await neo4j.create_constraints()
        logger.info("Neo4j: connected")
    except Exception as exc:
        logger.warning("Neo4j init skipped: %s", exc)

    try:
        os_client = get_opensearch()
        os_client.connect()
        os_client.ensure_indices()
        logger.info("OpenSearch: connected, indices ready")
    except Exception as exc:
        logger.warning("OpenSearch init skipped: %s", exc)

    # Register APScheduler for background maintenance
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from memory.maintenance.consolidation import ConsolidationRunner

        runner = ConsolidationRunner()
        scheduler = AsyncIOScheduler()
        scheduler.add_job(runner.hourly,  "interval", hours=1,  id="memory_hourly")
        scheduler.add_job(runner.nightly, "cron",     hour=3,   id="memory_nightly")
        scheduler.add_job(runner.weekly,  "cron",     day_of_week="sun", hour=4, id="memory_weekly")
        scheduler.start()
        app.state.scheduler = scheduler
        logger.info("Memory maintenance scheduler started")
    except Exception as exc:
        logger.warning("Scheduler init skipped: %s", exc)

    yield

    # Shutdown
    if hasattr(app.state, "scheduler"):
        app.state.scheduler.shutdown(wait=False)
    try:
        neo4j = get_neo4j()
        await neo4j.close()
    except Exception:
        pass
    try:
        os_client = get_opensearch()
        os_client.close()
    except Exception:
        pass


app = FastAPI(title="Agentic Browser API", version="0.1.0", lifespan=lifespan)

# Allow browser-extension and local dev clients to call the API.
# In production, replace "*" with explicit trusted origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    browser_use_router as agent_router,
    file_upload_router,
    skills_router,
    auth_router,
    voice_router,
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
app.include_router(file_upload_router, prefix="/api/upload")
app.include_router(skills_router, prefix="/api/skills")
app.include_router(auth_router, prefix="/api/auth")
app.include_router(voice_router, prefix="/api/voice")

from memory.api.router import router as memory_router
app.include_router(memory_router, prefix="/api/memory")


# Optional root
@app.get("/")
def root():
    return {"name": app.title, "version": app.version}
