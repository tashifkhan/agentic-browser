"""Agentic Browser MCP server.

Gives MCP clients (Claude Code, Codex, T3 Code, Cursor, OpenCode...) control of
the user's real Chrome through the Agentic Browser extension.

Four tools:
  browser_tabs      list, open, close or focus tabs
  browser_snapshot  accessibility outline of a tab with element refs
  browser_act       one action: click, type, press, navigate, evaluate...
  browser_execute   code mode, a JS program that runs many actions in one call

This module must not import the backend (core/, services/...). It also ships
as the lightweight ``agentic-browser-mcp`` package.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import logging
import sys
from typing import Annotated, Any, Literal

from pydantic import Field

from mcp.server.mcpserver import Image, MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from mcp_types import ToolAnnotations

from mcp_server import __version__, config
from mcp_server.bridge import BridgeError, LocalBridge, manager
from mcp_server.codemode import CodeRunner

logger = logging.getLogger("agentic_browser.mcp")

INSTRUCTIONS = """\
Controls the user's real Chrome through the Agentic Browser extension. Tabs keep
the user's logins, so act like a careful human user.

Workflow: browser_snapshot gives an outline with refs such as [ref=e12]. Pass a
ref as `target` to browser_act. Refs go stale after navigation or the next
snapshot. `target` also accepts a CSS selector or `text=Visible text`.

For more than two or three steps, prefer browser_execute. It runs one JavaScript
program that can click, type, wait and read in a single call and return only
the data you need.

Stop and ask the user before purchases, sending messages, deleting data, or
entering credentials. When a captcha, 2FA or login wall appears, tell the user
and wait. Never try to solve or bypass one.
"""

EXECUTE_DESCRIPTION = """\
Run a JavaScript program (async, top-level await allowed) against the browser,
then return its `return` value plus console output. Use it to chain many
actions in one call and to extract only the data you need.

API:
  await browser.tabs()                      -> [{id, url, title, active}]
  const t = browser.tab(id?)                -> Tab (no id = active tab)
  const t = await browser.open(url, {active?})
  await t.snapshot({maxChars?})             -> outline text with [ref=eN]
  await t.navigate(url) / t.back() / t.forward() / t.reload()
  await t.click(target, {clickCount?, button?})
  await t.type(target, text, {clear?, submit?}) ; t.fill(target, text)
  await t.press("Enter" | "Control+a" | ...)
  await t.select(target, value | [values]) ; t.check(target, bool)
  await t.hover(target) ; t.scroll({dy?, dx?, target?})
  await t.waitFor({text?, target?, url?, gone?, timeoutMs?})
  await t.evaluate("document.title" | () => expr)   -> JSON value (runs in page)
  await t.text(target?)                     -> innerText of element or page
  await t.screenshot()                      -> attaches an image to the result
  await t.dialog(accept, promptText?) ; t.close() ; t.focus()
  await sleep(ms) ; console.log(...)
  state                                     -> object kept between calls

`target` is a ref from the latest snapshot ("e12"), a CSS selector, or
"text=Sign in". Action calls return {ok, url, title, note?}.

Example:
  const t = await browser.open("https://news.ycombinator.com");
  return await t.evaluate(() => [...document.querySelectorAll(".titleline > a")]
    .slice(0, 5).map(a => ({title: a.textContent, href: a.href})));

The sandbox has no fetch, require, fs or timers other than sleep().
"""

READ_ONLY = ToolAnnotations(readOnlyHint=True, openWorldHint=True)
ACTS = ToolAnnotations(readOnlyHint=False, destructiveHint=True, openWorldHint=True)

mcp = MCPServer(
    name="agentic-browser",
    title="Agentic Browser",
    version=__version__,
    instructions=INSTRUCTIONS,
)

_runner = CodeRunner(lambda method, params: _call(method, params, timeout=_timeout_for(params)))


def _timeout_for(params: dict[str, Any]) -> float:
    ms = params.get("timeoutMs")
    base = 30.0
    if isinstance(ms, (int, float)) and ms > 0:
        base = ms / 1000 + 5
    return min(base, 120.0)


async def _call(method: str, params: dict[str, Any], *, timeout: float = 30.0) -> Any:
    return await manager.call(method, params, timeout=timeout)


def _image_from_data_url(data_url: str | None) -> Image | None:
    if not data_url or not data_url.startswith("data:"):
        return None
    header, b64 = data_url.split(",", 1)
    fmt = header[5:].split(";")[0].split("/")[-1] or "png"
    return Image(data=base64.b64decode(b64), format=fmt)


def _tab_line(result: dict[str, Any]) -> str:
    return f"tab: {result.get('tabId')} | {result.get('title') or ''} | {result.get('url') or ''}".rstrip(" |")


def _format_tabs(tabs: list[dict[str, Any]]) -> str:
    if not tabs:
        return "No tabs."
    lines = []
    for tab in tabs:
        mark = "*" if tab.get("active") else " "
        lines.append(f"{mark} {tab.get('id')}: {tab.get('title') or '(untitled)'} | {tab.get('url')}")
    return "\n".join(lines) + "\n(* = active tab in its window)"


# ── tools ────────────────────────────────────────────────────────────────────


@mcp.tool(
    title="Browser tabs",
    description=(
        "List, open, close or focus tabs in the user's browser. `list` also reports "
        "which browsers are connected. `open` returns the new tab id."
    ),
    annotations=ACTS,
    structured_output=False,
)
async def browser_tabs(
    action: Literal["list", "open", "close", "focus"] = "list",
    tab_id: Annotated[int | None, Field(description="Tab for close/focus")] = None,
    url: Annotated[str | None, Field(description="URL for open")] = None,
    active: Annotated[bool, Field(description="Bring the opened tab to the front")] = True,
) -> str:
    try:
        if action == "list":
            browsers = await manager.browsers()
            tabs = await _call("tabs.list", {})
            head = ", ".join(f"{b.get('browser')} {b.get('version') or ''}".strip() for b in browsers) or "1 browser"
            return f"Connected: {head}\n{_format_tabs(tabs)}"
        if action == "open":
            if not url:
                return "Error: `url` is required for open."
            tab = await _call("tabs.open", {"url": url, "active": active}, timeout=45)
            return f"Opened {_tab_line({'tabId': tab.get('id'), **tab})}"
        if tab_id is None:
            return f"Error: `tab_id` is required for {action}."
        await _call(f"tabs.{action}", {"tabId": tab_id})
        return f"{action}: tab {tab_id} done"
    except BridgeError as exc:
        return f"Error: {exc}"


@mcp.tool(
    title="Snapshot page",
    description=(
        "Return an accessibility outline of a tab (headings, text, links, inputs and "
        "buttons) with [ref=eN] markers to pass to browser_act. Defaults to the active "
        "tab. Set screenshot=true to also get an image of the viewport."
    ),
    annotations=READ_ONLY,
    structured_output=False,
)
async def browser_snapshot(
    tab_id: int | None = None,
    screenshot: bool = False,
    max_chars: Annotated[int, Field(ge=2000, le=100_000)] = 25_000,
) -> list[Any] | str:
    try:
        result = await _call(
            "page.snapshot", {"tabId": tab_id, "screenshot": screenshot, "maxChars": max_chars}, timeout=30
        )
    except BridgeError as exc:
        return f"Error: {exc}"
    out: list[Any] = [f"{_tab_line(result)}\n{result.get('text', '')}"]
    image = _image_from_data_url(result.get("screenshot"))
    if image:
        out.append(image)
    elif screenshot and result.get("screenshotError"):
        out.append(f"(screenshot failed: {result['screenshotError']})")
    return out


@mcp.tool(
    title="Browser action",
    description=(
        "Do one thing in a tab. `target` is a snapshot ref (e12), CSS selector or "
        "text=Label.\n"
        "- click/hover/check: target (click takes click_count and button)\n"
        "- type: target, text, optional clear and submit (press Enter afterwards)\n"
        "- press: key such as Enter, Escape, ArrowDown, Control+a; target optional\n"
        "- select: target and values (option values or labels)\n"
        "- scroll: dy/dx in pixels, optional target to scroll into view\n"
        "- navigate: url. back, forward, reload take nothing\n"
        "- wait_for: any of text, target, url (substring) and gone; waits up to timeout_ms\n"
        "- evaluate: expression, a JS expression run in the page, whose JSON value is returned\n"
        "- dialog: accept and prompt_text for a pending alert/confirm/prompt\n"
        "Set snapshot=true to get a fresh outline after the action."
    ),
    annotations=ACTS,
    structured_output=False,
)
async def browser_act(
    action: Literal[
        "click", "type", "press", "hover", "select", "check", "scroll",
        "navigate", "back", "forward", "reload", "wait_for", "evaluate", "dialog",
    ],
    target: str | None = None,
    tab_id: int | None = None,
    text: str | None = None,
    key: str | None = None,
    values: list[str] | None = None,
    url: str | None = None,
    expression: str | None = None,
    clear: bool = False,
    submit: bool = False,
    checked: bool = True,
    click_count: Annotated[int, Field(ge=1, le=3)] = 1,
    button: Literal["left", "right", "middle"] = "left",
    dx: int = 0,
    dy: int = 0,
    gone: bool = False,
    accept: bool = True,
    prompt_text: str | None = None,
    timeout_ms: Annotated[int, Field(ge=100, le=120_000)] = 10_000,
    snapshot: bool = False,
) -> str:
    try:
        if action == "evaluate":
            if not expression:
                return "Error: `expression` is required for evaluate."
            result = await _call(
                "page.evaluate", {"tabId": tab_id, "expression": expression, "timeoutMs": timeout_ms},
                timeout=timeout_ms / 1000 + 5,
            )
            value = result.get("value")
            rendered = value if isinstance(value, str) else json.dumps(value, indent=2, ensure_ascii=False)
            return f"{_tab_line(result)}\n{rendered}"[:60_000]
        if action == "wait_for":
            result = await _call(
                "page.waitFor",
                {"tabId": tab_id, "text": text, "target": target, "url": url, "gone": gone, "timeoutMs": timeout_ms},
                timeout=timeout_ms / 1000 + 5,
            )
        else:
            params = {
                "tabId": tab_id, "action": action, "target": target, "text": text, "key": key,
                "values": values, "url": url, "clear": clear, "submit": submit, "checked": checked,
                "clickCount": click_count, "button": button, "dx": dx, "dy": dy, "accept": accept,
                "promptText": prompt_text, "timeoutMs": timeout_ms,
            }
            result = await _call("page.act", {k: v for k, v in params.items() if v is not None},
                                 timeout=timeout_ms / 1000 + 20)
    except BridgeError as exc:
        return f"Error: {exc}"

    lines = [_tab_line(result), f"{action}: {'ok' if result.get('ok', True) else 'failed'}"]
    if result.get("note"):
        lines.append(f"note: {result['note']}")
    if result.get("dialog"):
        lines.append(f"dialog open: {json.dumps(result['dialog'])}. Answer it with action=dialog.")
    if snapshot:
        try:
            snap = await _call("page.snapshot", {"tabId": result.get("tabId")}, timeout=30)
            lines.append(snap.get("text", ""))
        except BridgeError as exc:
            lines.append(f"(snapshot failed: {exc})")
    return "\n".join(lines)


@mcp.tool(
    title="Run browser script",
    description=EXECUTE_DESCRIPTION,
    annotations=ACTS,
    structured_output=False,
)
async def browser_execute(
    code: Annotated[str, Field(description="Body of an async function. Use `return` for the result.")],
    timeout_s: Annotated[int, Field(ge=5, le=300)] = 60,
) -> list[Any] | str:
    result = await _runner.run(code, timeout=float(timeout_s))
    out: list[Any] = [result.render()]
    out.extend(Image(data=data, format=fmt) for data, fmt in result.images)
    return out


def _apply_tool_surface() -> None:
    if config.TOOL_SURFACE == "execute":
        for name in ("browser_snapshot", "browser_act"):
            mcp.remove_tool(name)
    elif config.TOOL_SURFACE == "plain":
        mcp.remove_tool("browser_execute")


_apply_tool_surface()


# ── HTTP app (bridge host) ───────────────────────────────────────────────────


def build_http_app(local: LocalBridge):
    """Starlette app served by the bridge host on 127.0.0.1:5455."""
    security = TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=["127.0.0.1:*", "localhost:*", "[::1]:*"],
        allowed_origins=["http://127.0.0.1:*", "http://localhost:*"],
    )
    app = mcp.streamable_http_app(
        streamable_http_path="/mcp",
        stateless_http=True,
        json_response=True,
        transport_security=security,
        host=config.BRIDGE_HOST,
    )
    # Bridge routes first so they match before the MCP mount.
    for route in reversed(local.routes()):
        app.router.routes.insert(0, route)
    return app


# ── CLI ──────────────────────────────────────────────────────────────────────


async def _stdio_main() -> None:
    await manager.ensure_started()
    role = "host" if manager.is_host else f"relay to {config.bridge_base_url()}"
    logger.info("agentic-browser MCP (stdio) started as bridge %s", role)
    try:
        await mcp.run_stdio_async()
    finally:
        await manager.stop()


async def _serve_main() -> int:
    await manager.ensure_started()
    if not manager.is_host:
        print(f"Bridge already running at {config.bridge_base_url()} (owned by another process).", file=sys.stderr)
        return 0
    print(f"Agentic Browser bridge on {config.bridge_base_url()}", file=sys.stderr)
    print(f"  MCP (streamable HTTP): {config.mcp_url()}", file=sys.stderr)
    print(f"  extension socket:      ws://{config.BRIDGE_HOST}:{config.BRIDGE_PORT}/bridge/ws", file=sys.stderr)
    try:
        while True:
            await asyncio.sleep(3600)
    finally:
        await manager.stop()


async def _status_main() -> int:
    import httpx

    try:
        async with httpx.AsyncClient(timeout=3) as client:
            data = (await client.get(f"{config.bridge_base_url()}/bridge/status")).json()
    except httpx.HTTPError:
        print(f"No bridge running on {config.bridge_base_url()}. Start one with `agentic-mcp serve`.")
        return 1
    browsers = data.get("browsers") or []
    print(f"Bridge running on {config.bridge_base_url()}, {len(browsers)} browser(s) attached")
    for b in browsers:
        print(f"  {b['id']}: {b.get('browser')} {b.get('version') or ''} (extension {b.get('extension_version')})")
    return 0


def run(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="agentic-mcp", description="Agentic Browser MCP server")
    sub = parser.add_subparsers(dest="command")
    sub.add_parser("stdio", help="Serve MCP over stdio (default). Starts the bridge if none is running.")
    sub.add_parser("serve", help="Run the bridge host and MCP over HTTP at 127.0.0.1:5455/mcp")
    sub.add_parser("status", help="Show whether the bridge is running and which browsers are attached")
    install = sub.add_parser("install", help="Register this MCP server with your coding agents")
    install.add_argument("--client", action="append",
                         help="claude-code, codex, cursor, gemini, opencode or all (default: detected ones)")
    install.add_argument("--transport", choices=["stdio", "http"], default="stdio")
    install.add_argument("--dry-run", action="store_true", help="Print what would change without writing")
    sub.add_parser("config", help="Print config snippets for MCP clients")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, stream=sys.stderr, format="%(levelname)s %(name)s: %(message)s")
    for noisy in ("httpx", "httpx2", "mcp.server.streamable_http_manager"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    command = args.command or "stdio"
    if command == "stdio":
        asyncio.run(_stdio_main())
    elif command == "serve":
        try:
            raise SystemExit(asyncio.run(_serve_main()))
        except KeyboardInterrupt:
            pass
    elif command == "status":
        raise SystemExit(asyncio.run(_status_main()))
    elif command == "install":
        from mcp_server.install import install_clients

        raise SystemExit(install_clients(args.client, transport=args.transport, dry_run=args.dry_run))
    elif command == "config":
        from mcp_server.install import print_snippets

        print_snippets()


if __name__ == "__main__":
    run()
