import os
from contextlib import asynccontextmanager

import asyncio
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import get_logger
from mcp_server.bridge import manager as browser_bridge

logger = get_logger(__name__)

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Connect memory stores on startup, disconnect on shutdown."""
    from core.clients.neo4j import get_neo4j
    from core.clients.opensearch import get_opensearch
    from core.db import init_db

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

    try:
        from core.llm import reload_default_llm

        await reload_default_llm()
        logger.info("Default LLM resolved (DB override applied if present)")

    except Exception as exc:
        logger.warning("LLM default resolution skipped: %s", exc)

    try:
        from services.telegram_bot_runner import run_telegram_bot

        bot_task = asyncio.create_task(run_telegram_bot())
        app.state.bot_task = bot_task
        logger.info("Telegram bot task created.")
    except Exception as exc:
        logger.warning("Telegram bot init skipped: %s", exc)

    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler

        from memory.maintenance.consolidation import ConsolidationRunner

        runner = ConsolidationRunner()
        scheduler = AsyncIOScheduler()
        scheduler.add_job(
            runner.hourly,
            "interval",
            hours=1,
            id="memory_hourly",
        )
        scheduler.add_job(
            runner.nightly,
            "cron",
            hour=3,
            id="memory_nightly",
        )
        scheduler.add_job(
            runner.weekly,
            "cron",
            day_of_week="sun",
            hour=4,
            id="memory_weekly",
        )
        scheduler.start()
        app.state.scheduler = scheduler
        logger.info("Memory maintenance scheduler started")

    except Exception as exc:
        logger.warning("Scheduler init skipped: %s", exc)

    try:
        # Bridge for MCP clients and the extension on 127.0.0.1:5455. If an
        # `agentic-mcp` process already owns the port, this process relays.
        await browser_bridge.ensure_started()
        # Re-apply MCP tool groups when the console (or anyone) edits them.
        from mcp_server.server import start_settings_watcher

        start_settings_watcher()
        logger.info(
            "Browser bridge: %s",
            "hosting on 127.0.0.1:5455" if browser_bridge.is_host else "relaying to existing host",
        )
    except Exception as exc:
        logger.warning("Browser bridge init skipped: %s", exc)

    yield

    await browser_bridge.stop()

    if hasattr(app.state, "scheduler"):
        app.state.scheduler.shutdown(wait=False)

    if hasattr(app.state, "bot_task"):
        app.state.bot_task.cancel()
        await asyncio.gather(app.state.bot_task, return_exceptions=True)

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

app.add_middleware(
    CORSMiddleware,
    # Only the extension and local tools may call the API from a browser.
    # "*" let any web page you visit read or delete your memory through
    # localhost. Extra origins: CORS_ORIGINS="https://a.example,https://b.example".
    allow_origin_regex=r"^(chrome-extension|moz-extension)://[a-z0-9-]+$|^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

from memory.api.router import router as memory_router  # noqa: E402
from routers import (  # noqa: E402
    auth_router,
    automation_router,
    browser_runtime_router,
    calendar_router,
    conversations_router,
    debug_router,
    file_upload_router,
    github_router,
    gmail_router,
    google_search_router,
    health_router,
    integrations_router,
    pyjiit_router,
    react_agent_router,
    skills_router,
    state_router,
    voice_router,
    website_router,
    website_validator_router,
    youtube_router,
)
from routers import (
    browser_use_router as agent_router,
)

from routers.mcp_settings import router as mcp_settings_router  # noqa: E402

app.include_router(mcp_settings_router, prefix="/api/mcp")
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
app.include_router(state_router, prefix="/api/state")
app.include_router(conversations_router, prefix="/api")
app.include_router(voice_router, prefix="/api/voice")
app.include_router(memory_router, prefix="/api/memory")
app.include_router(automation_router, prefix="/api/browser/automation")
app.include_router(browser_runtime_router, prefix="/api/browser/runtime")
app.include_router(debug_router, prefix="/api/debug")
app.include_router(integrations_router, prefix="/api/integrations")


@app.get("/")
def root():
    return {
        "name": app.title,
        "version": app.version,
    }


def run(
    host: str = "0.0.0.0",
    port: int = 5454,
    reload: bool = True,
):
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=reload,
    )


if __name__ == "__main__":
    run()
