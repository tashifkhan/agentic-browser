"""Shared settings for the browser bridge and MCP server."""

from __future__ import annotations

import os
import secrets
from pathlib import Path

BRIDGE_HOST = os.environ.get("AGENTIC_BROWSER_BRIDGE_HOST", "127.0.0.1")
BRIDGE_PORT = int(os.environ.get("AGENTIC_BROWSER_BRIDGE_PORT", "5455"))
STATE_DIR = Path(os.environ.get("AGENTIC_BROWSER_HOME", Path.home() / ".agentic-browser"))
TOKEN_FILE = STATE_DIR / "bridge-token"

# "all" exposes every tool. "execute" exposes only browser_tabs and
# browser_execute, for clients that do better with one code tool.
TOOL_SURFACE = os.environ.get("AGENTIC_BROWSER_TOOLS", "all").strip().lower()

# Comma-separated extension IDs allowed to attach. Empty allows any
# chrome-extension:// or moz-extension:// origin, which web pages cannot forge.
ALLOWED_EXTENSION_IDS = {
    item.strip()
    for item in os.environ.get("AGENTIC_BROWSER_EXTENSION_IDS", "").split(",")
    if item.strip()
}


# The backend that owns long-term memory. The memory tools call its HTTP API,
# so they need the backend running; the browser tools don't.
API_URL = os.environ.get("AGENTIC_BROWSER_API_URL", "http://127.0.0.1:5454").rstrip("/")
# "off" hides the memory tools, for clients that should only drive the browser.
MEMORY_TOOLS = os.environ.get("AGENTIC_BROWSER_MEMORY", "on").strip().lower() not in {"off", "0", "false", "no"}


def bridge_base_url() -> str:
    return f"http://{BRIDGE_HOST}:{BRIDGE_PORT}"


def mcp_url() -> str:
    return f"{bridge_base_url()}/mcp"


def read_or_create_token() -> str:
    """Return the relay token, creating it with 0600 permissions if missing."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    try:
        token = TOKEN_FILE.read_text().strip()
        if token:
            return token
    except FileNotFoundError:
        pass
    token = secrets.token_urlsafe(32)
    fd = os.open(TOKEN_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as fh:
        fh.write(token)
    return token


def read_token() -> str | None:
    try:
        return TOKEN_FILE.read_text().strip() or None
    except FileNotFoundError:
        return None
