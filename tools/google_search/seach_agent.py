import os
import sys
import requests
import googlesearch
from typing import Optional

from core.config import get_logger

logger = get_logger(__name__)

try:
    from website_context import html_md_convertor

except ImportError:
    sys.path.append(
        os.path.dirname(
            os.path.dirname(os.path.abspath(__file__)),
        ),
    )
    from website_context import html_md_convertor


def search_and_get_urls(
    query,
    num_results=10,
    lang="en",
):
    """
    Performs a Google search for the given query and returns a list of URLs.
    """

    logger.info("Starting google search for query: %s", query)
    urls = []

    try:
        for url in googlesearch.search(
            query,
            num_results=num_results,
            lang=lang,
        ):
            urls.append(url)
            if len(urls) >= num_results:
                break

    except Exception as e:
        logger.exception("An error occurred during search: %s", e)
        logger.warning(
            "This might be due to rate limiting. Try again later or reduce num_results."
        )

    logger.info(
        "Search completed — found %d urls (limited to %d)", len(urls), num_results
    )
    return urls


def search_urls(
    query: str,
    search_url: Optional[str] = None,
    max_results: int = 5,
) -> list[str]:
    """
    Search for URLs using Google search (synchronously).
    Returns a list of result URLs.
    """
    return search_and_get_urls(query, num_results=max_results)


def fetch_html(url: str) -> str:
    """
    Fetch HTML content from a URL synchronously.
    Returns the HTML as a string, or an empty string on error.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    try:
        logger.debug("Fetching URL: %s", url)
        response = requests.get(
            url,
            headers=headers,
            timeout=30,
        )
        response.raise_for_status()
        return response.text

    except Exception as e:
        logger.exception("Error fetching %s: %s", url, e)
        return ""


def html_to_markdown(html: str) -> str:
    """
    Convert HTML to markdown using website_context.html_md_convertor.
    Returns markdown as a string.
    """
    try:
        return html_md_convertor(html)

    except Exception as e:
        logger.exception("Error converting HTML to markdown: %s", e)
        return html


def get_cleaned_texts(urls: list[str]) -> list[dict]:
    """
    Fetch and clean text from multiple URLs synchronously.
    Returns a list of dictionaries with url and md_body_content.
    """
    texts = []

    logger.info("Fetching and cleaning content from %d urls", len(urls))
    for url in urls:
        logger.debug("Processing url: %s", url)
        html = fetch_html(url)
        if html:
            clean_text = html_to_markdown(html)
            if clean_text and clean_text.strip():
                texts.append({"url": url, "md_body_content": clean_text})
            else:
                logger.debug("No clean text extracted from %s", url)
        else:
            logger.debug("No HTML fetched from %s", url)

    logger.info("Completed extraction; %d pages produced cleaned text", len(texts))
    return texts


def extract_text_from_url(url: str) -> str:
    """
    Extract clean text from a single URL synchronously.
    Returns markdown as a string.
    """
    html = fetch_html(url)
    return html_to_markdown(html) if html else ""


def web_search_pipeline(
    query: str,
    search_url: Optional[str] = None,
    max_results: int = 5,
) -> list[dict]:
    """
    Run the full web search and extraction pipeline synchronously:
    1. Search for URLs using the query.
    2. Fetch and clean text from each URL.
    Returns a list of dictionaries with url and md_body_content.
    """
    urls = search_urls(
        query,
        search_url,
        max_results,
    )

    if not urls:
        logger.info("No urls found for query: %s", query)
        return []

    logger.info("Found %d urls, extracting content...", len(urls))
    texts = get_cleaned_texts(urls)
    logger.info("Pipeline finished. Extracted content from %d urls", len(texts))
    return texts


if __name__ == "__main__":
    search_query = input("Enter your search query: ")
    number_of_urls = int(input("How many URLs do you want? (e.g., 10): "))

    results = web_search_pipeline(
        search_query,
        max_results=number_of_urls,
    )

    if results:
        print("\nFound URLs and content:")
        for i, result in enumerate(results):
            print(f"  {i+1}. URL: {result['url']}")
            print(f"     Content preview: {result['md_body_content'][:100]}...")
            print()

    else:
        print("No URLs found or an error occurred.")
