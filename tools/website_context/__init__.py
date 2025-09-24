"""
initalising a web scapper which returns markdown text
"""

from .html_md import return_html_md as html_md_convertor
from .request_md import return_markdown as markdown_fetcher

__all__ = [
    "html_md_convertor",
    "markdown_fetcher",
]
