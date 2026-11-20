"""Register the MCP server with local coding agents.

T3 Code runs Claude Code and Codex under the hood, so registering those two
also covers T3 Code.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

from mcp_server import config

NAME = "agentic-browser"
HOME = Path.home()


def stdio_command() -> list[str]:
    bindir = Path(sys.executable).parent
    for exe in ("agentic-browser-mcp", "agentic-mcp"):
        local = bindir / exe
        if local.exists():
            return [str(local)]
        found = shutil.which(exe)
        if found:
            return [found]
    return [sys.executable, "-m", "mcp_server"]


def _backup(path: Path) -> None:
    if path.exists():
        shutil.copy2(path, path.with_name(f"{path.name}.bak-{int(time.time())}"))


def _merge_json(path: Path, key_path: list[str], entry: dict, dry_run: bool) -> str:
    data: dict = {}
    if path.exists():
        try:
            data = json.loads(path.read_text() or "{}")
        except json.JSONDecodeError:
            return f"skipped: {path} has comments or is not plain JSON; add the entry by hand (see `agentic-mcp config`)"
    node = data
    for key in key_path:
        node = node.setdefault(key, {})
    if node.get(NAME) == entry:
        return f"already configured in {path}"
    node[NAME] = entry
    if dry_run:
        return f"would write {path}:\n{json.dumps({key_path[-1]: {NAME: entry}}, indent=2)}"
    path.parent.mkdir(parents=True, exist_ok=True)
    _backup(path)
    path.write_text(json.dumps(data, indent=2) + "\n")
    return f"wrote {path}"


def _toml_str(value: str) -> str:
    return json.dumps(value)  # TOML basic strings use the same escapes as JSON


def install_codex(transport: str, dry_run: bool) -> str:
    path = Path(os.environ.get("CODEX_HOME", HOME / ".codex")) / "config.toml"
    existing = path.read_text() if path.exists() else ""
    header = f"[mcp_servers.{NAME}]"
    if header in existing:
        return f"already configured in {path} (edit the {header} table to change it)"
    if transport == "http":
        block = f'\n{header}\nurl = {_toml_str(config.mcp_url())}\n'
    else:
        cmd = stdio_command()
        args = ", ".join(_toml_str(a) for a in cmd[1:])
        block = f"\n{header}\ncommand = {_toml_str(cmd[0])}\nargs = [{args}]\nstartup_timeout_sec = 20\n"
    if dry_run:
        return f"would append to {path}:{block}"
    path.parent.mkdir(parents=True, exist_ok=True)
    _backup(path)
    with path.open("a") as fh:
        fh.write(block)
    return f"wrote {path}"


def install_claude_code(transport: str, dry_run: bool) -> str:
    claude = shutil.which("claude")
    if transport == "http":
        argv = ["mcp", "add", "--scope", "user", "--transport", "http", NAME, config.mcp_url()]
    else:
        argv = ["mcp", "add", "--scope", "user", NAME, "--", *stdio_command()]
    if not claude:
        return "skipped: `claude` CLI not on PATH. Run: claude " + " ".join(argv)
    if dry_run:
        return "would run: claude " + " ".join(argv)
    subprocess.run([claude, "mcp", "remove", "--scope", "user", NAME], capture_output=True)
    proc = subprocess.run([claude, *argv], capture_output=True, text=True)
    if proc.returncode != 0:
        return f"failed: {proc.stderr.strip() or proc.stdout.strip()}"
    return "registered with Claude Code (user scope)"


def _stdio_or_url(transport: str, url_key: str = "url") -> dict:
    if transport == "http":
        return {url_key: config.mcp_url()}
    cmd = stdio_command()
    return {"command": cmd[0], "args": cmd[1:]}


def install_cursor(transport: str, dry_run: bool) -> str:
    return _merge_json(HOME / ".cursor" / "mcp.json", ["mcpServers"], _stdio_or_url(transport), dry_run)


def install_gemini(transport: str, dry_run: bool) -> str:
    return _merge_json(HOME / ".gemini" / "settings.json", ["mcpServers"], _stdio_or_url(transport, "httpUrl"), dry_run)


def install_opencode(transport: str, dry_run: bool) -> str:
    if transport == "http":
        entry = {"type": "remote", "url": config.mcp_url(), "enabled": True}
    else:
        entry = {"type": "local", "command": stdio_command(), "enabled": True}
    return _merge_json(HOME / ".config" / "opencode" / "opencode.json", ["mcp"], entry, dry_run)


INSTALLERS = {
    "claude-code": (install_claude_code, lambda: shutil.which("claude") or (HOME / ".claude").exists()),
    "codex": (install_codex, lambda: shutil.which("codex") or (HOME / ".codex").exists()),
    "cursor": (install_cursor, lambda: (HOME / ".cursor").exists()),
    "gemini": (install_gemini, lambda: shutil.which("gemini") or (HOME / ".gemini").exists()),
    "opencode": (install_opencode, lambda: shutil.which("opencode") or (HOME / ".config" / "opencode").exists()),
}


def install_clients(clients: list[str] | None, *, transport: str, dry_run: bool) -> int:
    if not clients:
        selected = [name for name, (_, detect) in INSTALLERS.items() if detect()]
        if not selected:
            print("No supported MCP clients found. Use --client, or see `agentic-mcp config`.")
            return 1
    elif "all" in clients:
        selected = list(INSTALLERS)
    else:
        unknown = [c for c in clients if c not in INSTALLERS]
        if unknown:
            print(f"Unknown client(s): {', '.join(unknown)}. Choose from: {', '.join(INSTALLERS)}, all")
            return 2
        selected = clients

    failed = False
    for name in selected:
        installer, _ = INSTALLERS[name]
        message = installer(transport, dry_run)
        failed |= message.startswith("failed")
        print(f"{name}: {message}")
    if transport == "http":
        print(f"\nHTTP clients need a running bridge. Start it with `agentic-mcp serve` "
              f"or the backend (`agentic-api-run`). MCP URL: {config.mcp_url()}")
    print("\nT3 Code uses your Claude Code and Codex settings, so it picks this up too.")
    print("Next: load the extension in Chrome; it connects to the bridge on its own.")
    return 1 if failed else 0


def print_snippets() -> None:
    cmd = stdio_command()
    print("# stdio (starts the bridge itself; recommended)")
    print("claude mcp add --scope user agentic-browser -- " + " ".join(cmd))
    print("\n# ~/.codex/config.toml")
    print(f"[mcp_servers.{NAME}]\ncommand = {_toml_str(cmd[0])}\nargs = [{', '.join(_toml_str(a) for a in cmd[1:])}]")
    print("\n# Cursor / Gemini / generic mcpServers JSON")
    print(json.dumps({"mcpServers": {NAME: {"command": cmd[0], "args": cmd[1:]}}}, indent=2))
    print(f"\n# streamable HTTP (needs `agentic-mcp serve` or the backend running)\n{config.mcp_url()}")
    print(f"claude mcp add --scope user --transport http agentic-browser {config.mcp_url()}")
