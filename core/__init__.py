"""configuration for the backend core module"""

from .config import get_logger, get_settings
from core import config

__all__ = [
    "config",
    "get_logger",
    "get_settings",
]
