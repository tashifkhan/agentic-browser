"""
routers package exports with aliases for convenient imports.
"""

from .github import router as github_router
from .health import router as health_router
from .website import router as website_router
from .youtube import router as youtube_router

__all__ = [
    "github_router",
    "health_router",
    "website_router",
    "youtube_router",
]
