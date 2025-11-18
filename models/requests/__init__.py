"""
initalizing the requests pydantic models
"""

from .video_info import VideoInfoRequest
from .subtitles import SubtitlesRequest
from .ask import AskRequest
from .website import WebsiteRequest
from .crawller import CrawlerRequest

__all__ = [
    "VideoInfoRequest",
    "SubtitlesRequest",
    "AskRequest",
    "WebsiteRequest",
    "CrawlerRequest",
]
