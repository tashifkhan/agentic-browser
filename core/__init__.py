"""configuration for the backend core module"""

from .config import (
    get_logger,
    BACKEND_HOST,
    BACKEND_PORT,
)
from core import config

__all__ = [
    "config",
    "get_logger",
    "BACKEND_HOST",
    "BACKEND_PORT",
]
