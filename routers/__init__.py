"""
routers package exports with aliases for convenient imports.
"""

from .calendar import router as calendar_router
from .github import router as github_router
from .gmail import router as gmail_router
from .google_search import router as google_search_router
from .health import router as health_router
from .pyjiit import router as pyjiit_router
from .react_agent import router as react_agent_router
from .website import router as website_router
from .website_validator import router as website_validator_router
from .youtube import router as youtube_router
from .browser_use import router as browser_use_router
from .file_upload import router as file_upload_router
from .skills import router as skills_router
from .auth import router as auth_router
from .voice import router as voice_router
from .state import router as state_router
from .conversations import router as conversations_router
from .automation import router as automation_router
from .debug import router as debug_router
from .integrations import router as integrations_router


__all__ = [
    "github_router",
    "health_router",
    "website_router",
    "youtube_router",
    "google_search_router",
    "gmail_router",
    "calendar_router",
    "pyjiit_router",
    "react_agent_router",
    "website_validator_router",
    "browser_use_router",
    "file_upload_router",
    "skills_router",
    "auth_router",
    "voice_router",
    "state_router",
    "conversations_router",
    "automation_router",
    "debug_router",
    "integrations_router",
]
