import requests
import logging

logger = logging.getLogger(__name__)


def return_markdown(url: str) -> str:
    """Fetches the markdown content from a given URL using the Jina AI service."""
    jina_url = "https://r.jina.ai/" + url
    logger.info(f"Fetching markdown for URL: {url}")
    logger.info(f"Using Jina AI endpoint: {jina_url}")

    try:
        res = requests.get(jina_url)
        # logger.info(f"Jina AI response status: {res.status_code}")
        # logger.info(f"Response content length: {len(res.text)}")
        # logger.info(f"Response preview: {res.text[:200]}...")

        # Check if there are any redirects or if the final URL is different
        # if res.history:
        # logger.info(f"Redirects occurred: {[r.url for r in res.history]}")
        # logger.info(f"Final URL: {res.url}")

        return res.text

    except Exception as e:
        # logger.error(f"Error fetching markdown from Jina AI: {e}")
        return f"Error fetching content from {url}: {str(e)}"
