from core import get_logger
from tools.google_search.seach_agent import web_search_pipeline

logger = get_logger(__name__)


class GoogleSearchService:
    def search(self, query: str, max_results: int = 5):
        try:
            logger.info(
                "google_search request received: query=%s, max_results=%s",
                query,
                max_results,
            )
            results = web_search_pipeline(query, max_results=max_results)

            if not results:
                logger.warning("google_search returned no results for query: %s", query)

            else:
                logger.info(
                    "google_search returned %d result(s) for query: %s",
                    len(results),
                    query,
                )
            return results

        except Exception as e:
            logger.exception("Error in google_search service: %s", e)
            raise
