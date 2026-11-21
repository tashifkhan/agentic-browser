"""MCP tool groups for the console: read, change and apply.

Settings live in ~/.agentic-browser/mcp-settings.json (see mcp_server/settings.py).
Saving applies them right away in this process, which hosts the HTTP MCP server
when it owns the bridge port, and every other agentic-mcp process picks the
file change up within a couple of seconds.
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from mcp_server import config as mcp_config
from mcp_server import settings as tool_settings
from mcp_server.bridge import manager as bridge
from mcp_server.server import _ALL_TOOLS, apply_settings, notify_tools_changed

router = APIRouter()


class McpSettingsUpdate(BaseModel):
    browser_tools: Optional[bool] = None
    memory_tools: Optional[bool] = None
    browser_mode: Optional[Literal["all", "execute", "plain"]] = None


async def _status(applied: Optional[list[str]] = None, notified: int = 0) -> dict[str, Any]:
    current = tool_settings.load()
    enabled = applied if applied is not None else sorted(tool_settings.enabled_tools(current))
    try:
        browsers = await bridge.browsers()
    except Exception:
        browsers = []
    return {
        "settings": current,
        "enabled_tools": enabled,
        "all_tools": {
            "browser": [n for n in tool_settings.BROWSER_TOOLS if n in _ALL_TOOLS],
            "memory": [n for n in tool_settings.MEMORY_TOOLS if n in _ALL_TOOLS],
        },
        "bridge": {
            "role": "host" if bridge.is_host else "relay",
            "url": mcp_config.bridge_base_url(),
            "mcp_url": mcp_config.mcp_url(),
            "browsers": browsers,
        },
        "settings_file": str(tool_settings.SETTINGS_FILE),
        "notified_sessions": notified,
    }


@router.get("/settings")
async def get_settings() -> dict[str, Any]:
    return await _status()


@router.put("/settings")
async def put_settings(update: McpSettingsUpdate) -> dict[str, Any]:
    current = tool_settings.save(update.model_dump(exclude_none=True))
    applied = apply_settings(current)
    notified = await notify_tools_changed()
    return await _status(applied, notified)


@router.post("/restart")
async def restart() -> dict[str, Any]:
    """Re-read the settings, rebuild this process's tool list and tell
    connected MCP clients to re-list their tools."""
    applied = apply_settings()
    notified = await notify_tools_changed()
    return await _status(applied, notified)
