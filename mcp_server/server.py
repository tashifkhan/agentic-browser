from typing import Optional, Any

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp import types as mcp

from core.llm import LargeLanguageModel
from prompts.github import github_processor_optimized
from tools.website_context.request_md import return_markdown as fetch_markdown
from tools.website_context.html_md import return_html_md as html_to_md


server = Server("agentic-browser-mcp")


@server.list_tools()
async def list_tools() -> list[mcp.Tool]:
    return [
        mcp.Tool(
            name="llm.generate",
            description="Generate text with the configured LLM provider",
            inputSchema={
                "type": "object",
                "properties": {
                    "prompt": {"type": "string"},
                    "system_message": {"type": "string"},
                    "provider": {
                        "type": "string",
                        "enum": [
                            "google",
                            "openai",
                            "anthropic",
                            "ollama",
                            "deepseek",
                            "openrouter",
                        ],
                        "default": "google",
                    },
                    "model": {"type": "string"},
                    "api_key": {"type": "string"},
                    "base_url": {"type": "string"},
                    "temperature": {"type": "number", "default": 0.4},
                },
                "required": ["prompt"],
            },
        ),
        mcp.Tool(
            name="github.answer",
            description="Answer a question about a repository using provided context",
            inputSchema={
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "text": {"type": "string"},
                    "tree": {"type": "string"},
                    "summary": {"type": "string"},
                    "chat_history": {"type": "string"},
                },
                "required": ["question", "text", "tree", "summary"],
            },
        ),
        mcp.Tool(
            name="website.fetch_markdown",
            description="Fetch markdown content for a given URL via Jina proxy",
            inputSchema={
                "type": "object",
                "properties": {"url": {"type": "string"}},
                "required": ["url"],
            },
        ),
        mcp.Tool(
            name="website.html_to_md",
            description="Convert raw HTML to markdown",
            inputSchema={
                "type": "object",
                "properties": {"html": {"type": "string"}},
                "required": ["html"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: Optional[dict[str, Any]] = None):
    arguments = arguments or {}

    try:
        if name == "llm.generate":
            llm = LargeLanguageModel(
                model_name=arguments.get("model"),
                api_key=arguments.get("api_key") or "",
                provider=arguments.get("provider", "google"),
                base_url=arguments.get("base_url"),
                temperature=float(arguments.get("temperature", 0.4)),
            )
            content = llm.generate_text(
                arguments["prompt"],
                system_message=arguments.get("system_message"),
            )
            return [mcp.TextContent(type="text", text=content)]

        if name == "github.answer":
            ans = github_processor_optimized(
                question=arguments["question"],
                text=arguments.get("text", ""),
                tree=arguments.get("tree", ""),
                summary=arguments.get("summary", ""),
                chat_history=arguments.get("chat_history", ""),
            )
            return [mcp.TextContent(type="text", text=str(ans))]

        if name == "website.fetch_markdown":
            md = fetch_markdown(arguments["url"])
            return [mcp.TextContent(type="text", text=md)]

        if name == "website.html_to_md":
            md = html_to_md(arguments["html"])
            return [mcp.TextContent(type="text", text=md)]

        return [mcp.TextContent(type="text", text=f"Unknown tool: {name}")]

    except Exception as e:
        return [mcp.TextContent(type="text", text=f"Error: {e}")]


async def _amain():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, {})  # type: ignore


def run():
    import anyio

    anyio.run(_amain)


if __name__ == "__main__":
    run()
