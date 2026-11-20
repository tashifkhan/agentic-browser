from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

from core.config import get_settings


class ComposioNotConfigured(RuntimeError):
    pass


def _ensure_configured() -> tuple[str, str]:
    settings = get_settings()
    if not settings.composio_api_key or not settings.composio_user_id:
        raise ComposioNotConfigured(
            "Composio is not configured. Set COMPOSIO_API_KEY and COMPOSIO_USER_ID."
        )
    return settings.composio_api_key, settings.composio_user_id


def _normalise_toolkit(toolkit: str) -> str:
    return toolkit.strip().lower().replace("_", "-")


@lru_cache(maxsize=8)
def _mcp_url_for_toolkits(toolkits_key: str) -> str:
    api_key, user_id = _ensure_configured()
    try:
        from composio import Composio
    except ImportError as exc:
        raise RuntimeError(
            "Composio SDK is not installed. Install project dependencies with uv sync."
        ) from exc

    toolkits = [tk for tk in toolkits_key.split(",") if tk]
    session = Composio(api_key=api_key).create(user_id=user_id, toolkits=toolkits)
    return session.mcp.url


async def get_composio_tools(toolkits: list[str]) -> list[Any]:
    api_key, _user_id = _ensure_configured()
    normalised = sorted({_normalise_toolkit(toolkit) for toolkit in toolkits if toolkit.strip()})
    if not normalised:
        raise ValueError("At least one Composio toolkit is required")

    url = _mcp_url_for_toolkits(",".join(normalised))
    return await _load_mcp_tools(url, {"x-api-key": api_key})


def _mcp_client(url: str, headers: dict[str, str]) -> Any:
    from mcp import Client
    from mcp.client.streamable_http import streamable_http_client
    from mcp.shared._httpx_utils import create_mcp_http_client

    return Client(streamable_http_client(url, http_client=create_mcp_http_client(headers=headers)))


def _result_text(result: Any) -> str:
    parts: list[str] = []
    for block in getattr(result, "content", None) or []:
        text = getattr(block, "text", None)
        parts.append(text if text is not None else json.dumps(block.model_dump(mode="json"), default=str))
    if not parts and getattr(result, "structured_content", None) is not None:
        parts.append(json.dumps(result.structured_content, default=str))
    return "\n".join(parts)


async def _load_mcp_tools(url: str, headers: dict[str, str]) -> list[Any]:
    """List an MCP server's tools as LangChain tools. Each call opens a short session."""
    from langchain_core.tools import StructuredTool, ToolException

    async with _mcp_client(url, headers) as client:
        listed = await client.list_tools()

    def make(tool: Any) -> Any:
        async def _call(**kwargs: Any) -> str:
            async with _mcp_client(url, headers) as client:
                result = await client.call_tool(tool.name, kwargs)
            text = _result_text(result)
            if getattr(result, "is_error", False):
                raise ToolException(text or f"{tool.name} failed")
            return text

        return StructuredTool(
            name=tool.name,
            description=tool.description or "",
            args_schema=tool.input_schema or {"type": "object", "properties": {}},
            coroutine=_call,
            handle_tool_error=False,
        )

    return [make(tool) for tool in listed.tools]


def _tool_text(tool: Any) -> str:
    return " ".join(
        str(part or "")
        for part in (
            getattr(tool, "name", ""),
            getattr(tool, "description", ""),
        )
    ).lower()


def select_tool(tools: list[Any], required_terms: list[str], preferred_terms: list[str] | None = None) -> Any:
    preferred_terms = preferred_terms or []
    best: tuple[int, Any] | None = None
    for tool in tools:
        text = _tool_text(tool)
        if not all(term.lower() in text for term in required_terms):
            continue
        score = sum(1 for term in preferred_terms if term.lower() in text)
        if best is None or score > best[0]:
            best = (score, tool)
    if best is None:
        available = ", ".join(getattr(tool, "name", "unknown") for tool in tools)
        raise RuntimeError(f"No matching Composio tool found. Available tools: {available}")
    return best[1]


async def invoke_tool_with_fallbacks(tool: Any, payloads: list[dict[str, Any]]) -> Any:
    last_error: Exception | None = None
    for payload in payloads:
        try:
            if hasattr(tool, "ainvoke"):
                return await tool.ainvoke(payload)
            if getattr(tool, "coroutine", None) is not None:
                return await tool.coroutine(**payload)
            if getattr(tool, "func", None) is not None:
                return tool.func(**payload)
        except Exception as exc:
            last_error = exc
    if last_error is not None:
        raise last_error
    raise RuntimeError(f"Composio tool {getattr(tool, 'name', 'unknown')} is not invokable")


def stringify_tool_result(result: Any) -> str:
    if isinstance(result, str):
        return result
    try:
        return json.dumps(result, ensure_ascii=True, default=str, indent=2)
    except TypeError:
        return str(result)
