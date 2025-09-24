from typing import Optional
from urllib.parse import urlparse, parse_qs
from core import get_logger

logger = get_logger(__name__)


def extract_video_id(url: str) -> Optional[str]:
    """Extract YouTube video ID from URL"""
    try:
        parsed_url = urlparse(url)

        if parsed_url.hostname in ["www.youtube.com", "youtube.com"]:
            query_params = parse_qs(parsed_url.query)
            return query_params.get("v", [None])[0]

        elif parsed_url.hostname == "youtu.be":
            return parsed_url.path[1:]

    except Exception as e:
        logger.error(f"Error extracting video ID: {e}")

    return None
