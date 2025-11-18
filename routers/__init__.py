"""
routers package exports with aliases for convenient imports.
"""

from .github import router as github_router
from .health import router as health_router
from .website import router as website_router
from .youtube import router as youtube_router
from .google_search import router as google_search_router
from .gmail import router as gmail_router
from .calendar import router as calendar_router
from .pyjiit import router as pyjiit_router
from .react_agent import router as react_agent_router

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
]
