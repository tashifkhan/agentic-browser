from langchain_community.document_loaders import WebBaseLoader
import bs4
from bs4.filter import SoupStrainer
import asyncio
from typing import Any


async def clean_response(url: str) -> Any:
    """Fetches the content of a webpage and returns its cleaned text."""
    page_url = url if url.startswith("http") else "https://" + url
    loader = WebBaseLoader(
        web_paths=[
            page_url,
        ],
        bs_kwargs={
            "parse_only": SoupStrainer(class_="theme-doc-markdown markdown"),
        },
        bs_get_text_kwargs={
            "separator": " | ",
            "strip": True,
        },
    )
    docs = []
    async for doc in loader.alazy_load():
        docs.append(doc)

    assert len(docs) == 1
    doc = docs[0]
    return doc


if __name__ == "__main__":
    url = "portfolio.tashif.codes"
    doc = asyncio.run(clean_response(url))
    print(doc)
    print(f"{doc.metadata}\n")
    print(doc.page_content[:500])
