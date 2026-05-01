from contextlib import asynccontextmanager

import anyio
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from mcp.server.streamable_http import StreamableHTTPServerTransport

from core.config import get_logger
from mcp_server.server import server as mcp_server

logger = get_logger(__name__)

load_dotenv()


class MCPStreamableHTTPApp:
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return

        transport = StreamableHTTPServerTransport(mcp_session_id=None)
        async with anyio.create_task_group() as task_group:
            async with transport.connect() as (read_stream, write_stream):
                task_group.start_soon(
                    mcp_server.run,
                    read_stream,
                    write_stream,
                    mcp_server.create_initialization_options(),
                    False,
                    True,
                )
                await transport.handle_request(scope, receive, send)
                task_group.cancel_scope.cancel()


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

    yield

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
app.mount("/mcp", MCPStreamableHTTPApp())


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
