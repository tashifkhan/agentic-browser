import os
import sys
from typing import Optional

from langchain_tavily import TavilySearch
from core.config import get_logger

logger = get_logger(__name__)

# Initialize TavilySearch - max_results will be overridden in invoke
tavily_tool = TavilySearch(topic="general")


def web_search_pipeline(
    query: str,
    search_url: Optional[str] = None,
    max_results: int = 5,
) -> list[dict]:
    """
    Run the web search using Tavily.
    Returns a list of dictionaries with url and md_body_content (mapped from Tavily's content).
    """
    logger.info("Starting Tavily search for query: %s", query)

    try:
        # Update max_results for this specific call
        tavily_tool.max_results = max_results

        # Invoke Tavily Search
        response = tavily_tool.invoke({"query": query})

        # Check if response is a dict and has 'results' key (raw output format)
        results = []
        if isinstance(response, dict) and "results" in response:
            raw_results = response["results"]
        # If it returns a list directly (depends on LangChain version/wrapper)
        elif isinstance(response, list):
            raw_results = response
        else:
            logger.warning("Unexpected Tavily response format: %s", type(response))
            return []

        # Map results to expected format
        for res in raw_results:
            # Tavily returns 'content', we map it to 'md_body_content'
            # It also returns 'url', 'title'
            results.append(
                {
                    "url": res.get("url", ""),
                    "md_body_content": res.get("content", ""),
                    "title": res.get(
                        "title", ""
                    ),  # Adding title as it might be useful, though original only seemed to emphasize url and content
                }
            )

        logger.info("Tavily search returned %d results", len(results))
        return results

    except Exception as e:
        logger.exception("An error occurred during Tavily search: %s", e)
        return []


if __name__ == "__main__":
    search_query = input("Enter your search query: ")
    number_of_urls = int(input("How many results do you want? (e.g., 5): "))

    results = web_search_pipeline(
        search_query,
        max_results=number_of_urls,
    )

    if results:
        print("\nFound Results:")
        for i, result in enumerate(results):
            print(f"  {i+1}. URL: {result['url']}")
            print(f"     Title: {result.get('title', 'N/A')}")
            print(f"     Content preview: {result['md_body_content'][:200]}...")
            print()

    else:
        print("No results found or an error occurred.")
