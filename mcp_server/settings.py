"""Which tool groups the MCP server exposes.

Stored in ~/.agentic-browser/mcp-settings.json so every agentic-mcp process
(stdio ones started by coding agents, `agentic-mcp serve`, and the backend's
bridge host) reads the same choice. The console edits it through the backend.

  browser_tools  browser_tabs, browser_snapshot, browser_act, browser_execute
  memory_tools   memory_recall, memory_save, memory_profile, memory_documents, memory_forget
  browser_mode   "all", "execute" (tabs + code mode only) or "plain" (no code mode)

When the file doesn't exist, the AGENTIC_BROWSER_TOOLS and AGENTIC_BROWSER_MEMORY
environment variables give the defaults.
"""
from __future__ import annotations

import json
import os
from typing import Any, Literal, TypedDict

from mcp_server import config

SETTINGS_FILE = config.STATE_DIR / "mcp-settings.json"

BROWSER_TOOLS = ("browser_tabs", "browser_snapshot", "browser_act", "browser_execute")
MEMORY_TOOLS = ("memory_recall", "memory_save", "memory_profile", "memory_documents", "memory_forget")


class McpSettings(TypedDict):
    browser_tools: bool
    memory_tools: bool
    browser_mode: Literal["all", "execute", "plain"]


def defaults() -> McpSettings:
    mode = config.TOOL_SURFACE if config.TOOL_SURFACE in ("all", "execute", "plain") else "all"
    return {"browser_tools": True, "memory_tools": config.MEMORY_TOOLS, "browser_mode": mode}  # type: ignore[typeddict-item]


def load() -> McpSettings:
    out = defaults()
    try:
        data = json.loads(SETTINGS_FILE.read_text())
    except (FileNotFoundError, ValueError):
        return out
    if isinstance(data.get("browser_tools"), bool):
        out["browser_tools"] = data["browser_tools"]
    if isinstance(data.get("memory_tools"), bool):
        out["memory_tools"] = data["memory_tools"]
    if data.get("browser_mode") in ("all", "execute", "plain"):
        out["browser_mode"] = data["browser_mode"]
    return out


def save(update: dict[str, Any]) -> McpSettings:
    current = load()
    for key in ("browser_tools", "memory_tools"):
        if isinstance(update.get(key), bool):
            current[key] = update[key]  # type: ignore[literal-required]
    if update.get("browser_mode") in ("all", "execute", "plain"):
        current["browser_mode"] = update["browser_mode"]
    config.STATE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = SETTINGS_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(current, indent=2))
    os.replace(tmp, SETTINGS_FILE)
    return current


def enabled_tools(settings: McpSettings) -> set[str]:
    names: set[str] = set()
    if settings["browser_tools"]:
        names.update(BROWSER_TOOLS)
        if settings["browser_mode"] == "execute":
            names -= {"browser_snapshot", "browser_act"}
        elif settings["browser_mode"] == "plain":
            names.discard("browser_execute")
    if settings["memory_tools"]:
        names.update(MEMORY_TOOLS)
    return names


def mtime() -> float:
    try:
        return SETTINGS_FILE.stat().st_mtime
    except FileNotFoundError:
        return 0.0
