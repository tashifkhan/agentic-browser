from bs4 import BeautifulSoup
import html2text


def return_html_md(html: str) -> str:
    """Extension sends html body its converted to markdown text."""
    soup = BeautifulSoup(html, "html.parser")
    body = soup.body if soup.body else soup
    body_html = str(body.prettify())
    markdowntext = html2text.html2text(body_html)
    return markdowntext


if __name__ == "__main__":
    import requests

    url = "https://portfolio.tashif.codes"
    res = requests.get(url)
    html = res.text
    print(f"HTML length: {len(html)}")
    print(f"HTML preview: {html[:500]}")
    print("\nConverting HTML to Markdown...")
    markdown = return_html_md(html)
    print(markdown)
    print(f"Markdown length: {len(markdown)}")
    print(f"Markdown preview: {markdown[:500]}")
