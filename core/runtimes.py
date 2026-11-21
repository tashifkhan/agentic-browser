"""Subscription runtimes: run a chat turn on Claude, ChatGPT, Google AI or
OpenCode plans instead of an API key.

Each runtime is the vendor's own agent, driven the way its official tools
expect, so the user's existing login and plan apply:

  claude       Claude Agent SDK (spawns Claude Code, which uses its login)
  codex        `codex exec --json` (ChatGPT login from `codex login`)
  antigravity  Google's Antigravity ACP runtime (Google AI plan login)
  opencode     `opencode acp` (OpenCode login / Zen)
  custom ACP   any command that speaks the Agent Client Protocol

The runtime runs the whole turn as an agent. It gets this app's MCP server
(browser and memory tools, `python -m mcp_server` over stdio) and, when
allowed, its own web search and fetch. It gets no shell and no file edits:
Claude's built-in tools are limited to web tools, Codex runs in a read-only
sandbox in an empty folder, and ACP permission requests are only granted
for this app's tools and web reads.

Settings (AppSetting "runtimes") are edited in the console. A turn is
stateless: the (compacted) chat history goes in the prompt.
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import shutil
import sys
import time
from contextvars import ContextVar
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Awaitable, Callable, Optional

from core import get_logger

logger = get_logger(__name__)

SETTING_KEY = "runtimes"
STATE_DIR = Path(os.environ.get("AGENTIC_BROWSER_HOME", Path.home() / ".agentic-browser"))
WORKSPACE = STATE_DIR / "runtime-workspace"  # empty cwd for the agents
REPO_ROOT = Path(__file__).resolve().parent.parent
TURN_TIMEOUT = 20 * 60

Emit = Callable[[dict[str, Any]], Awaitable[None]]


PRESETS: dict[str, dict[str, Any]] = {
    "claude": {
        "label": "Claude (subscription)",
        "kind": "claude-sdk",
        "command": "",  # empty: the SDK finds `claude` on PATH
        "args": [],
        "models": ["default", "opus", "sonnet", "haiku"],
        "default_model": "default",
        "login": "Run `claude` in a terminal once and log in with your Claude account.",
    },
    "codex": {
        "label": "ChatGPT (Codex)",
        "kind": "codex-exec",
        "command": "codex",
        "args": [],
        "models": ["default", "gpt-6.2-sol", "gpt-6.2-astra", "gpt-6.1-terra"],
        "default_model": "default",
        "login": "Run `codex login` and sign in with ChatGPT.",
    },
    "antigravity": {
        "label": "Google AI (Antigravity)",
        "kind": "acp",
        # Where the runtime comes from: auto, managed (downloaded here), t3
        # (T3 Code's copy) or custom (the command below). See core/antigravity.py.
        "source": "auto",
        "command": "",
        "args": ["acp", "--gemini-dir", "{profile_dir}", "--app-data-dir", "antigravity-acp"],
        "profile_dir": str(STATE_DIR / "antigravity"),
        "auth_method": "oauth-personal",
        "env": {
            "GEMINI_HOME": "{profile_dir}",
            "AGY_ACP_FORCE_FILE_STORAGE": "1",
            "AGY_CLI_DISABLE_AUTO_UPDATE": "1",
            "ELECTRON_RUN_AS_NODE": "1",
            "SSH_CONNECTION": "127.0.0.1 0 127.0.0.1 0",
        },
        "models": ["default"],
        "default_model": "default",
        "login": "Press Log in with Google, or reuse T3 Code's login if you have one.",
    },
    "opencode": {
        "label": "OpenCode",
        "kind": "acp",
        "command": "opencode",
        "args": ["acp"],
        "models": ["default"],
        "default_model": "default",
        "login": "Run `opencode auth login` (or `opencode acp --login`).",
    },
}

BASE_FIELDS = {"enabled": False, "allow_web": True, "env": {}, "auth_method": "", "profile_dir": "", "extra_instructions": ""}


# ── settings ────────────────────────────────────────────────────────────────

async def load_all() -> dict[str, dict[str, Any]]:
    """Every runtime: presets merged with saved overrides, plus custom ACP agents."""
    saved: dict[str, Any] = {}
    try:
        from services.app_state import AppStateService

        saved = await AppStateService().get_setting(SETTING_KEY) or {}
    except Exception:
        pass
    out: dict[str, dict[str, Any]] = {}
    for rid, preset in PRESETS.items():
        cfg = {**BASE_FIELDS, **preset, **(saved.get(rid) or {}), "id": rid, "builtin": True}
        if not cfg.get("command") and preset.get("command"):
            cfg["command"] = preset["command"]
        out[rid] = cfg
    for rid, cfg in (saved.items()):
        if rid not in PRESETS and isinstance(cfg, dict):
            out[rid] = {**BASE_FIELDS, "kind": "acp", "args": [], "models": ["default"], "default_model": "default",
                        "login": "", **cfg, "id": rid, "builtin": False}
    return out


async def save(rid: str, update: dict[str, Any]) -> dict[str, Any]:
    from services.app_state import AppStateService

    state = AppStateService()
    saved = await state.get_setting(SETTING_KEY) or {}
    allowed = {"enabled", "allow_web", "command", "args", "env", "models", "default_model", "auth_method",
               "profile_dir", "extra_instructions", "label", "source"}
    entry = {**(saved.get(rid) or {}), **{k: v for k, v in update.items() if k in allowed}}
    if rid not in PRESETS:
        entry["kind"] = "acp"
    saved[rid] = entry
    await state.set_setting(SETTING_KEY, saved)
    return (await load_all())[rid]


async def remove(rid: str) -> None:
    from services.app_state import AppStateService

    state = AppStateService()
    saved = await state.get_setting(SETTING_KEY) or {}
    saved.pop(rid, None)
    await state.set_setting(SETTING_KEY, saved)


def _fill(value: str, cfg: dict[str, Any]) -> str:
    return value.replace("{profile_dir}", os.path.expanduser(cfg.get("profile_dir") or "")).replace("{command}", cfg.get("command") or "")


def resolve_command(cfg: dict[str, Any]) -> Optional[str]:
    if cfg.get("id") == "antigravity":
        from core import antigravity

        return antigravity.resolve(cfg.get("source") or "auto", cfg.get("command") or "")
    cmd = os.path.expanduser(cfg.get("command") or "")
    if cfg.get("kind") == "claude-sdk" and not cmd:
        return shutil.which("claude")
    if not cmd:
        return None
    return cmd if os.path.isfile(cmd) and os.access(cmd, os.X_OK) else shutil.which(cmd)


def status(cfg: dict[str, Any]) -> dict[str, Any]:
    found = resolve_command(cfg)
    note = None
    if cfg["id"] == "antigravity":
        from core import antigravity

        if not found:
            note = {"managed": "Not downloaded yet. Press Download.", "t3": "T3 Code hasn't downloaded the runtime.",
                    "custom": "Set the path to the runtime."}.get(cfg.get("source") or "auto",
                                                                "Not installed. Press Download, or use T3 Code's copy.")
        elif not antigravity.logged_in(cfg.get("profile_dir") or ""):
            note = "Not logged in yet for this profile folder."
    elif not found:
        note = "Not installed, or the command isn't on PATH." if cfg.get("command") or cfg.get("kind") == "claude-sdk" \
            else "Set the path to the runtime."
    return {"installed": bool(found), "path": found, "note": note,
            "login": _fill(cfg.get("login") or "", cfg)}


# ── per-request choice ──────────────────────────────────────────────────────

@dataclass
class Pick:
    runtime: str
    model: str


_request_pick: ContextVar[Optional[Pick]] = ContextVar("request_runtime", default=None)


def current_pick() -> Optional[Pick]:
    return _request_pick.get()


def set_pick(pick: Optional[Pick]):
    return _request_pick.set(pick)


def reset_pick(token) -> None:
    _request_pick.reset(token)


# ── shared bits ─────────────────────────────────────────────────────────────

MCP_NAME = "agentic"


def _mcp_stdio() -> dict[str, Any]:
    from core.config import get_settings

    return {
        "command": sys.executable,
        "args": ["-m", "mcp_server"],
        "env": {
            "AGENTIC_BROWSER_API_URL": f"http://127.0.0.1:{get_settings().backend_port}",
            "PYTHONPATH": str(REPO_ROOT),
        },
    }


def _instructions(cfg: dict[str, Any], system: str) -> str:
    extra = (cfg.get("extra_instructions") or "").strip()
    return (
        f"{system}\n\n"
        f"You're running inside Agentic Browser, a browser assistant. Tools named {MCP_NAME}/browser_* act in the "
        f"user's real browser (tabs, snapshots, clicks, typing); {MCP_NAME}/memory_* read and save what you know "
        "about the user. Use them instead of guessing. You can't run shell commands or edit files here."
        + (f"\n\n{extra}" if extra else "")
    )


def _env(cfg: dict[str, Any]) -> dict[str, str]:
    env = {**os.environ}
    for k, v in (cfg.get("env") or {}).items():
        env[str(k)] = _fill(str(v), cfg)
    return env


def _image_parts(images: list[tuple[str, bytes]]) -> list[tuple[str, str]]:
    return [(mime, base64.b64encode(data).decode()) for mime, data in images]


async def _emit_safe(emit: Optional[Emit], event: dict[str, Any]) -> None:
    if emit:
        try:
            await emit(event)
        except Exception:
            pass


# ── Claude Agent SDK ────────────────────────────────────────────────────────

async def _run_claude(cfg: dict[str, Any], model: str, system: str, prompt: str,
                      images: list[tuple[str, bytes]], emit: Optional[Emit]) -> str:
    from claude_agent_sdk import (
        AssistantMessage, ClaudeAgentOptions, ClaudeSDKClient, PermissionResultAllow, PermissionResultDeny,
        ResultMessage, StreamEvent, TextBlock, ThinkingBlock, ToolResultBlock, ToolUseBlock, UserMessage,
    )

    web = ["WebSearch", "WebFetch"] if cfg.get("allow_web", True) else []

    async def can_use_tool(name: str, _input: dict[str, Any], _ctx: Any):
        if name.startswith(f"mcp__{MCP_NAME}__") or name in web:
            return PermissionResultAllow()
        return PermissionResultDeny(message=f"{name} isn't available in Agentic Browser.")

    stdio = _mcp_stdio()
    options = ClaudeAgentOptions(
        model=None if model in ("", "default") else model,
        system_prompt=_instructions(cfg, system),
        tools=web,  # built-in tools: web only
        mcp_servers={MCP_NAME: {"type": "stdio", **stdio}},
        strict_mcp_config=True,
        setting_sources=[],
        can_use_tool=can_use_tool,
        include_partial_messages=True,
        cwd=str(WORKSPACE),
        cli_path=resolve_command(cfg),
        env={k: _fill(str(v), cfg) for k, v in (cfg.get("env") or {}).items()},
    )
    content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    for mime, data in _image_parts(images):
        content.append({"type": "image", "source": {"type": "base64", "media_type": mime, "data": data}})

    async def messages():
        yield {"type": "user", "message": {"role": "user", "content": content}, "parent_tool_use_id": None}

    answer_parts: list[str] = []
    streamed = False
    tool_names: dict[str, str] = {}
    async with ClaudeSDKClient(options=options) as client:
        await client.query(messages())
        async for msg in client.receive_response():
            if isinstance(msg, StreamEvent):
                ev = msg.event or {}
                delta = ev.get("delta") or {}
                if ev.get("type") == "content_block_delta" and delta.get("type") == "text_delta":
                    streamed = True
                    await _emit_safe(emit, {"event": "answer_delta", "delta": delta.get("text", "")})
                elif ev.get("type") == "content_block_delta" and delta.get("type") == "thinking_delta":
                    await _emit_safe(emit, {"event": "thinking_delta", "delta": delta.get("thinking", "")})
            elif isinstance(msg, AssistantMessage):
                for block in msg.content:
                    if isinstance(block, TextBlock):
                        answer_parts.append(block.text)
                    elif isinstance(block, ToolUseBlock):
                        tool_names[block.id] = block.name
                        await _emit_safe(emit, {"event": "subagent_tool_call", "subagent": cfg["id"], "tool": _short(block.name), "args": block.input})
            elif isinstance(msg, UserMessage) and isinstance(msg.content, list):
                for block in msg.content:
                    if isinstance(block, ToolResultBlock):
                        await _emit_safe(emit, {"event": "subagent_tool_result", "subagent": cfg["id"],
                                                "tool": _short(tool_names.get(block.tool_use_id, "tool")),
                                                "result": _text_of(block.content)[:2000]})
            elif isinstance(msg, ResultMessage):
                if msg.is_error:
                    raise RuntimeError(str(msg.result or "Claude reported an error"))
                if msg.result and not answer_parts:
                    answer_parts.append(msg.result)
    answer = "\n\n".join(p.strip() for p in answer_parts if p.strip())
    if not streamed and answer:
        await _emit_safe(emit, {"event": "answer_delta", "delta": answer})
    return answer


def _short(name: str) -> str:
    """mcp__agentic__memory_recall, "Run mcp_agentic_memory_recall" -> memory_recall."""
    name = (name or "tool").strip()
    if name.startswith("Run "):
        name = name[4:]
    for prefix in (f"mcp__{MCP_NAME}__", f"mcp_{MCP_NAME}_", f"{MCP_NAME}_", f"{MCP_NAME}/"):
        if name.startswith(prefix):
            return name[len(prefix):]
    return name


def _text_of(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(c.get("text", "") if isinstance(c, dict) else str(c) for c in content)
    return json.dumps(content, default=str) if content is not None else ""


# ── Codex (ChatGPT login) ───────────────────────────────────────────────────

def _toml(value: Any) -> str:
    return json.dumps(value)


async def _run_codex(cfg: dict[str, Any], model: str, system: str, prompt: str,
                     images: list[tuple[str, bytes]], emit: Optional[Emit]) -> str:
    stdio = _mcp_stdio()
    args = [resolve_command(cfg) or "codex", "exec", "--json", "--skip-git-repo-check", "--ephemeral",
            "-s", "read-only", "-C", str(WORKSPACE),
            "-c", 'approval_policy="never"',
            "-c", f"mcp_servers.{MCP_NAME}.command={_toml(stdio['command'])}",
            "-c", f"mcp_servers.{MCP_NAME}.args={_toml(stdio['args'])}",
            "-c", f"mcp_servers.{MCP_NAME}.env={{ {', '.join(f'{k} = {_toml(v)}' for k, v in stdio['env'].items())} }}",
            "-c", f"tools.web_search={'true' if cfg.get('allow_web', True) else 'false'}",
            *[str(a) for a in cfg.get("args") or []]]
    if model and model != "default":
        args += ["-m", model]
    tmp_images: list[Path] = []
    for i, (mime, data) in enumerate(images):
        p = WORKSPACE / f".attach-{os.getpid()}-{i}.{mime.split('/')[-1]}"
        p.write_bytes(data)
        tmp_images.append(p)
        args += ["-i", str(p)]
    args.append("-")
    full = f"{_instructions(cfg, system)}\n\n---\n\n{prompt}"
    proc = await asyncio.create_subprocess_exec(*args, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                                                stderr=asyncio.subprocess.PIPE, cwd=str(WORKSPACE), env=_env(cfg),
                                                limit=16 * 1024 * 1024)
    assert proc.stdin and proc.stdout and proc.stderr
    proc.stdin.write(full.encode())
    await proc.stdin.drain()
    proc.stdin.close()
    answer: list[str] = []
    error = ""
    try:
        async for raw in proc.stdout:
            try:
                ev = json.loads(raw)
            except ValueError:
                continue
            item = ev.get("item") or {}
            kind = ev.get("type")
            itype = item.get("type")
            if kind == "item.completed" and itype == "agent_message":
                text = item.get("text") or ""
                answer.append(text)
                await _emit_safe(emit, {"event": "answer_delta", "delta": text + "\n\n"})
            elif kind == "item.completed" and itype == "reasoning":
                await _emit_safe(emit, {"event": "thinking_delta", "delta": (item.get("text") or "") + "\n"})
            elif itype == "mcp_tool_call":
                if kind == "item.started":
                    await _emit_safe(emit, {"event": "subagent_tool_call", "subagent": "codex", "tool": item.get("tool"), "args": item.get("arguments")})
                elif kind == "item.completed":
                    await _emit_safe(emit, {"event": "subagent_tool_result", "subagent": "codex", "tool": item.get("tool"),
                                            "result": _text_of((item.get("result") or {}).get("content") if isinstance(item.get("result"), dict) else item.get("result"))[:2000]
                                            or str(item.get("error") or "")})
            elif itype in ("web_search", "command_execution") and kind == "item.completed":
                await _emit_safe(emit, {"event": "subagent_tool_call", "subagent": "codex", "tool": itype,
                                        "args": {"query": item.get("query")} if itype == "web_search" else {"command": item.get("command")}})
            elif kind in ("error", "turn.failed"):
                error = str((ev.get("error") or {}).get("message") if isinstance(ev.get("error"), dict) else ev.get("message") or ev)
        await proc.wait()
    finally:
        for p in tmp_images:
            p.unlink(missing_ok=True)
        if proc.returncode is None:
            proc.kill()
    if not answer:
        err = (await proc.stderr.read()).decode(errors="replace")[-600:]
        raise RuntimeError(error or err.strip() or "Codex returned no answer.")
    # Codex narrates as it goes ("I'll check..."); the last message is the answer.
    return next((a.strip() for a in reversed(answer) if a.strip()), "")


# ── ACP (Antigravity, OpenCode, custom) ─────────────────────────────────────

class AcpError(RuntimeError):
    pass


async def acp_session(cfg: dict[str, Any], *, discover_only: bool = False) -> dict[str, Any]:
    """Start an ACP agent, initialise, authenticate if needed and open a
    session. Returns {proc, send, request, session, models}; used by turns and
    by the console's Test button."""
    cmd = resolve_command(cfg)
    if not cmd:
        raise AcpError(f"{cfg.get('label', cfg['id'])} isn't installed (command: {cfg.get('command') or 'not set'}).")
    args = [_fill(str(a), cfg) for a in cfg.get("args") or []]
    proc = await asyncio.create_subprocess_exec(cmd, *args, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                                                stderr=asyncio.subprocess.PIPE, cwd=str(WORKSPACE), env=_env(cfg),
                                                limit=16 * 1024 * 1024)
    pending: dict[int, asyncio.Future] = {}
    handlers: dict[str, Callable[[dict[str, Any]], Awaitable[Any]]] = {}
    counter = {"n": 0}

    async def write(msg: dict[str, Any]) -> None:
        assert proc.stdin
        proc.stdin.write((json.dumps({"jsonrpc": "2.0", **msg}) + "\n").encode())
        await proc.stdin.drain()

    async def request(method: str, params: dict[str, Any], timeout: float = 120) -> Any:
        counter["n"] += 1
        rid = counter["n"]
        fut = asyncio.get_running_loop().create_future()
        pending[rid] = fut
        await write({"id": rid, "method": method, "params": params})
        try:
            return await asyncio.wait_for(fut, timeout)
        finally:
            pending.pop(rid, None)

    async def reader() -> None:
        assert proc.stdout
        async for raw in proc.stdout:
            try:
                msg = json.loads(raw)
            except ValueError:
                continue
            if "id" in msg and ("result" in msg or "error" in msg) and "method" not in msg:
                fut = pending.get(msg["id"])
                if fut and not fut.done():
                    if msg.get("error"):
                        fut.set_exception(AcpError(msg["error"].get("message", "ACP error")))
                    else:
                        fut.set_result(msg.get("result"))
            elif "method" in msg:
                handler = handlers.get(msg["method"]) or handlers.get("*")
                result: Any = None
                try:
                    if handler:
                        result = await handler(msg)
                except Exception as exc:
                    if "id" in msg:
                        await write({"id": msg["id"], "error": {"code": -32603, "message": str(exc)}})
                    continue
                if "id" in msg:
                    if result is None and msg["method"] not in handlers:
                        await write({"id": msg["id"], "error": {"code": -32601, "message": "Not supported by Agentic Browser"}})
                    else:
                        await write({"id": msg["id"], "result": result if result is not None else {}})
        for fut in pending.values():
            if not fut.done():
                err = (await proc.stderr.read()).decode(errors="replace")[-500:] if proc.stderr else ""
                fut.set_exception(AcpError(f"The agent exited. {err.strip()}"))

    task = asyncio.create_task(reader())
    try:
        init = await request("initialize", {"protocolVersion": 1, "clientCapabilities": {
            "fs": {"readTextFile": False, "writeTextFile": False}, "terminal": False}}, timeout=90)
        stdio = _mcp_stdio()
        new_params = {"cwd": str(WORKSPACE), "mcpServers": [] if discover_only else [{
            "name": MCP_NAME, "command": stdio["command"], "args": stdio["args"],
            "env": [{"name": k, "value": v} for k, v in stdio["env"].items()]}]}
        try:
            session = await request("session/new", new_params, timeout=90)
        except AcpError as exc:
            if "auth" not in str(exc).lower():
                raise
            methods = [m.get("id") for m in (init or {}).get("authMethods", [])]
            method = cfg.get("auth_method") or (methods[0] if methods else None)
            if not method:
                raise
            await request("authenticate", {"methodId": method}, timeout=60)
            session = await request("session/new", new_params, timeout=90)
    except Exception:
        task.cancel()
        if proc.returncode is None:
            proc.kill()
        raise
    # Agents list models one of two ways: session.models (set with
    # session/set_model, e.g. Antigravity) or a "model" config option (set
    # with session/set_config_option, e.g. OpenCode).
    models = [m.get("modelId") for m in ((session or {}).get("models") or {}).get("availableModels", []) if m.get("modelId")]
    model_option = next((o for o in (session or {}).get("configOptions") or []
                         if o.get("category") == "model" or o.get("id") == "model"), None)
    if not models and model_option:
        models = [o.get("value") for o in model_option.get("options") or [] if o.get("value")]
    return {"proc": proc, "request": request, "handlers": handlers, "session": session, "models": models,
            "model_option": model_option.get("id") if model_option else None, "init": init, "reader": task}


def _acp_close(s: dict[str, Any]) -> None:
    s["reader"].cancel()
    if s["proc"].returncode is None:
        s["proc"].kill()


async def _run_acp(cfg: dict[str, Any], model: str, system: str, prompt: str,
                   images: list[tuple[str, bytes]], emit: Optional[Emit]) -> str:
    s = await acp_session(cfg)
    sid = s["session"]["sessionId"]
    answer: list[str] = []
    allow_web = cfg.get("allow_web", True)

    async def on_update(msg: dict[str, Any]) -> None:
        upd = (msg.get("params") or {}).get("update") or {}
        kind = upd.get("sessionUpdate")
        if kind == "agent_message_chunk":
            text = (upd.get("content") or {}).get("text") or ""
            answer.append(text)
            await _emit_safe(emit, {"event": "answer_delta", "delta": text})
        elif kind == "agent_thought_chunk":
            await _emit_safe(emit, {"event": "thinking_delta", "delta": (upd.get("content") or {}).get("text") or ""})
        elif kind == "tool_call":
            await _emit_safe(emit, {"event": "subagent_tool_call", "subagent": cfg["id"], "tool": _short(upd.get("title") or upd.get("kind") or "tool"),
                                    "args": upd.get("rawInput")})
        elif kind == "tool_call_update" and upd.get("status") in ("completed", "failed"):
            out = upd.get("rawOutput") or [c.get("content") for c in upd.get("content") or [] if isinstance(c, dict)]
            await _emit_safe(emit, {"event": "subagent_tool_result", "subagent": cfg["id"], "tool": _short(upd.get("title") or "tool"),
                                    "result": _text_of(out)[:2000]})
        return None

    async def on_permission(msg: dict[str, Any]) -> dict[str, Any]:
        params = msg.get("params") or {}
        call = params.get("toolCall") or {}
        text = json.dumps(call, default=str).lower()
        ours = MCP_NAME in text or "browser_" in text or "memory_" in text
        web = call.get("kind") in ("fetch", "search", "think") and allow_web
        options = params.get("options") or []
        wanted = ("allow_once", "allow_always") if (ours or web) else ("reject_once", "reject_always")
        pick = next((o for o in options if o.get("kind") in wanted), None)
        if pick is None:
            return {"outcome": {"outcome": "cancelled"}}
        return {"outcome": {"outcome": "selected", "optionId": pick.get("optionId")}}

    s["handlers"]["session/update"] = on_update
    s["handlers"]["session/request_permission"] = on_permission
    try:
        if model and model != "default" and model in s["models"]:
            try:
                if s["model_option"]:
                    await s["request"]("session/set_config_option",
                                       {"sessionId": sid, "configId": s["model_option"], "value": model}, timeout=30)
                else:
                    await s["request"]("session/set_model", {"sessionId": sid, "modelId": model}, timeout=30)
            except AcpError as exc:
                logger.info("ACP %s: couldn't set model %s: %s", cfg["id"], model, exc)
        blocks: list[dict[str, Any]] = [{"type": "text", "text": f"{_instructions(cfg, system)}\n\n---\n\n{prompt}"}]
        caps = ((s["init"] or {}).get("agentCapabilities") or {}).get("promptCapabilities") or {}
        if caps.get("image"):
            blocks += [{"type": "image", "mimeType": mime, "data": data} for mime, data in _image_parts(images)]
        result = await s["request"]("session/prompt", {"sessionId": sid, "prompt": blocks}, timeout=TURN_TIMEOUT)
        if (result or {}).get("stopReason") == "refusal" and not answer:
            raise RuntimeError("The agent refused this request.")
    finally:
        _acp_close(s)
    return "".join(answer).strip()


# ── entry points ────────────────────────────────────────────────────────────

RUNNERS = {"claude-sdk": _run_claude, "codex-exec": _run_codex, "acp": _run_acp}


async def run_turn(runtime_id: str, model: str, *, system: str, prompt: str,
                   images: Optional[list[tuple[str, bytes]]] = None, emit: Optional[Emit] = None) -> str:
    cfg = (await load_all()).get(runtime_id)
    if not cfg:
        raise RuntimeError(f"Unknown runtime '{runtime_id}'.")
    if not cfg.get("enabled"):
        raise RuntimeError(f"{cfg['label']} is turned off. Turn it on in Settings → Subscriptions.")
    WORKSPACE.mkdir(parents=True, exist_ok=True)
    runner = RUNNERS[cfg["kind"]]
    started = time.monotonic()
    answer = await asyncio.wait_for(runner(cfg, model or cfg.get("default_model") or "default", system, prompt, images or [], emit), TURN_TIMEOUT)
    logger.info("Runtime %s/%s answered in %.1fs", runtime_id, model, time.monotonic() - started)
    return answer


async def test_runtime(runtime_id: str) -> dict[str, Any]:
    """Console 'Test' button: a tiny turn, plus model discovery for ACP agents."""
    cfg = (await load_all()).get(runtime_id)
    if not cfg:
        raise RuntimeError(f"Unknown runtime '{runtime_id}'.")
    WORKSPACE.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    out: dict[str, Any] = {"ok": False}
    try:
        if cfg["kind"] == "acp":
            s = await acp_session(cfg, discover_only=True)
            out["models"] = s["models"]
            _acp_close(s)
            if s["models"]:
                await save(runtime_id, {"models": ["default", *s["models"]]})
        reply = await asyncio.wait_for(RUNNERS[cfg["kind"]](
            {**cfg, "allow_web": False}, cfg.get("default_model") or "default", "Be brief.", "Reply with just the word OK.", [], None), 240)
        out.update(ok=True, reply=reply[:200])
    except Exception as exc:
        out["error"] = str(exc)[:600]
    out["seconds"] = round(time.monotonic() - started, 1)
    return out
