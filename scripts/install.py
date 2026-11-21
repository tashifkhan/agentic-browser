#!/usr/bin/env python3
"""Agentic Browser installer: databases, backend, extension, MCP, in one go.

    ./install.sh                 # interactive
    ./install.sh --yes           # take the defaults, ask nothing
    ./install.sh --dry-run       # say what would happen, change nothing

Steps, each skippable:
  1. check docker, uv, node and pnpm (offers Homebrew installs on macOS)
  2. .env: copy the example, add a model key, generate the encryption key,
     bind the backend to 127.0.0.1
  3. start postgres, neo4j and opensearch (docker compose)
  4. uv sync, pnpm install, build the extension
  5. run the backend: at login (launchd / systemd --user), or just now
  6. find your browsers, ask which ones get the extension, walk you through
     loading it and confirm each one connects
  7. register the MCP server with Claude Code, Codex, Cursor, Gemini CLI and
     OpenCode (agentic-mcp install)

Standard library only, so it runs before anything else is installed.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import platform
import secrets
import shutil
import subprocess
import sys
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional

ROOT = Path(__file__).resolve().parent.parent
EXT_DIR = ROOT / "clients" / "browser-extension"
CHROME_BUILD = EXT_DIR / ".output" / "chrome-mv3"
FIREFOX_BUILD = EXT_DIR / ".output" / "firefox-mv2"
STATE = Path(os.environ.get("AGENTIC_BROWSER_HOME", Path.home() / ".agentic-browser"))
API = "http://127.0.0.1:5454"
MAC = platform.system() == "Darwin"
LINUX = platform.system() == "Linux"
SERVICE_LABEL = "sh.taf.agentic-browser"

ARGS: argparse.Namespace


# ── output and input ────────────────────────────────────────────────────────

TTY = sys.stdout.isatty() or bool(os.environ.get("FORCE_COLOR"))


def c(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m" if TTY else text


def step(n: int, title: str) -> None:
    print(f"\n{c('1;36', f'[{n}/7]')} {c('1', title)}")


def ok(msg: str) -> None:
    print(f"  {c('32', '✓')} {msg}")


def warn(msg: str) -> None:
    print(f"  {c('33', '!')} {msg}")


def info(msg: str) -> None:
    print(f"  {c('2', msg)}")


def fail(msg: str) -> None:
    print(f"  {c('31', '✗')} {msg}")


def _input(prompt: str) -> str:
    # Piped installs (curl | bash) have no stdin; read the terminal instead.
    if sys.stdin.isatty():
        return input(prompt)
    with open("/dev/tty") as tty:
        sys.stdout.write(prompt)
        sys.stdout.flush()
        return tty.readline().rstrip("\n")


def ask(question: str, default: bool = True) -> bool:
    if ARGS.yes:
        return default
    hint = "Y/n" if default else "y/N"
    while True:
        answer = _input(f"  {question} [{hint}] ").strip().lower()
        if not answer:
            return default
        if answer in ("y", "yes", "n", "no"):
            return answer.startswith("y")


def choose(question: str, options: list[str], default: int = 0) -> int:
    if ARGS.yes:
        return default
    print(f"  {question}")
    for i, opt in enumerate(options, 1):
        print(f"    {i}. {opt}")
    while True:
        answer = _input(f"  Pick 1-{len(options)} [{default + 1}]: ").strip()
        if not answer:
            return default
        if answer.isdigit() and 1 <= int(answer) <= len(options):
            return int(answer) - 1


def choose_many(question: str, options: list[str], defaults: list[int]) -> list[int]:
    if ARGS.yes:
        return defaults
    print(f"  {question}")
    for i, opt in enumerate(options, 1):
        print(f"    {i}. {opt}")
    pre = ",".join(str(d + 1) for d in defaults) or "none"
    while True:
        answer = _input(f"  Numbers separated by commas, 0 for none [{pre}]: ").strip()
        if not answer:
            return defaults
        if answer == "0":
            return []
        try:
            picked = sorted({int(x) - 1 for x in answer.replace(" ", "").split(",") if x})
        except ValueError:
            continue
        if all(0 <= p < len(options) for p in picked):
            return picked


def secret_input(prompt: str) -> str:
    if ARGS.yes:
        return ""
    import getpass

    try:
        return getpass.getpass(f"  {prompt}: ").strip()
    except (EOFError, KeyboardInterrupt):
        return ""


def run(cmd: list[str], *, cwd: Path = ROOT, quiet: bool = False, check: bool = True, env: Optional[dict] = None) -> int:
    shown = " ".join(cmd)
    if ARGS.dry_run:
        info(f"would run: {shown}")
        return 0
    info(f"$ {shown}")
    proc = subprocess.run(cmd, cwd=cwd, env={**os.environ, **(env or {})},
                          stdout=subprocess.DEVNULL if quiet else None, stderr=subprocess.STDOUT if quiet else None)
    if check and proc.returncode != 0:
        raise SystemExit(f"\n{c('31', 'Stopped:')} `{shown}` failed with exit code {proc.returncode}.")
    return proc.returncode


def http_json(path: str, timeout: float = 3) -> Optional[dict]:
    try:
        with urllib.request.urlopen(API + path, timeout=timeout) as resp:
            return json.loads(resp.read())
    except Exception:
        return None


# ── 1. prerequisites ────────────────────────────────────────────────────────

BREW = {"docker": "--cask docker", "uv": "uv", "node": "node", "pnpm": "pnpm"}


def check_tools() -> None:
    step(1, "Tools")
    missing = [t for t in ("docker", "uv", "node", "pnpm") if not shutil.which(t)]
    for tool in ("docker", "uv", "node", "pnpm"):
        if tool not in missing:
            ok(f"{tool} found")
    if "pnpm" in missing and shutil.which("corepack") and ask("pnpm is missing. Enable it with corepack?"):
        run(["corepack", "enable"])
        if shutil.which("pnpm"):
            missing.remove("pnpm")
    if missing and MAC and shutil.which("brew") and ask(f"Install {', '.join(missing)} with Homebrew?"):
        for tool in list(missing):
            run(["brew", "install", *BREW[tool].split()])
            if shutil.which(tool) or tool == "docker":
                missing.remove(tool)
    if missing:
        raise SystemExit(f"\nInstall {', '.join(missing)} and run the installer again.")
    if not ARGS.skip_docker and subprocess.run(["docker", "info"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode != 0:
        warn("Docker is installed but not running.")
        if MAC and ask("Open Docker Desktop and wait for it?"):
            subprocess.run(["open", "-a", "Docker"])
            for _ in range(60):
                time.sleep(2)
                if subprocess.run(["docker", "info"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
                    break
        if subprocess.run(["docker", "info"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode != 0:
            raise SystemExit("\nStart Docker (or any docker-compatible engine, like colima) and run the installer again.")
    ok("ready")


# ── 2. .env ─────────────────────────────────────────────────────────────────

PROVIDERS = [
    ("Google Gemini", "GOOGLE_API_KEY", "google"),
    ("OpenAI", "OPENAI_API_KEY", "openai"),
    ("Anthropic", "ANTHROPIC_API_KEY", "anthropic"),
    ("OpenRouter", "OPENROUTER_API_KEY", "openrouter"),
    ("OpenCode Zen / Go", "OPENCODE_API_KEY", "opencode"),
    ("DeepSeek", "DEEPSEEK_API_KEY", "deepseek"),
]


def _set_env(lines: list[str], key: str, value: str) -> list[str]:
    for i, line in enumerate(lines):
        if line.split("=", 1)[0].strip() == key:
            lines[i] = f"{key}={value}"
            return lines
    return lines + [f"{key}={value}"]


def _env_value(lines: list[str], key: str) -> str:
    for line in lines:
        if line.split("=", 1)[0].strip() == key:
            return line.split("=", 1)[1].strip() if "=" in line else ""
    return ""


def setup_env() -> None:
    step(2, "Settings (.env)")
    env_file = ROOT / ".env"
    if env_file.exists():
        lines = env_file.read_text().splitlines()
        ok(".env exists, keeping your values")
    else:
        lines = (ROOT / ".env.example").read_text().splitlines()
        ok("created .env from .env.example")
    if not _env_value(lines, "OAUTH_ENCRYPTION_KEY"):
        lines = _set_env(lines, "OAUTH_ENCRYPTION_KEY", base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())
        ok("generated OAUTH_ENCRYPTION_KEY, so keys saved in Settings are stored encrypted")
    if _env_value(lines, "BACKEND_HOST") in ("", "0.0.0.0") and ask("Keep the backend on this machine only (127.0.0.1)?"):
        lines = _set_env(lines, "BACKEND_HOST", "127.0.0.1")
        ok("BACKEND_HOST=127.0.0.1")
    have = [name for name, key, _ in PROVIDERS if _env_value(lines, key)]
    if have:
        ok(f"model keys already set: {', '.join(have)}")
    else:
        pick = choose("Add a model key now? (You can also run on a Claude, ChatGPT, Google AI or OpenCode plan, "
                      "set up later in Settings → Subscriptions.)",
                      [*(name for name, _, _ in PROVIDERS), "Skip for now"], default=len(PROVIDERS))
        if pick < len(PROVIDERS):
            name, key, provider = PROVIDERS[pick]
            value = secret_input(f"{name} API key (hidden)")
            if value:
                lines = _set_env(lines, key, value)
                lines = _set_env(lines, "DEFAULT_LLM_PROVIDER", provider)
                ok(f"{key} saved, default provider {provider}")
    if ARGS.dry_run:
        info("would write .env")
    else:
        env_file.write_text("\n".join(lines) + "\n")
        env_file.chmod(0o600)


# ── 3. databases ────────────────────────────────────────────────────────────

def start_databases() -> None:
    step(3, "Databases (postgres, neo4j, opensearch)")
    if ARGS.skip_docker:
        warn("skipped (--skip-docker)")
        return
    run(["docker", "compose", "up", "-d", "postgres", "neo4j", "opensearch"])
    if ARGS.dry_run:
        return
    info("waiting for them to be healthy…")
    for _ in range(90):
        out = subprocess.run(["docker", "compose", "ps", "--format", "json"], cwd=ROOT, capture_output=True, text=True).stdout
        rows = [json.loads(l) for l in out.splitlines() if l.strip().startswith("{")]
        states = {r.get("Service"): (r.get("Health") or r.get("State")) for r in rows}
        if states and all(s in ("healthy", "running") for s in states.values()):
            ok(", ".join(f"{k} {v}" for k, v in sorted(states.items())))
            return
        time.sleep(2)
    warn("not all healthy yet; the backend retries on start. `docker compose ps` shows their state.")


# ── 4. dependencies and build ───────────────────────────────────────────────

def build(want_firefox: bool) -> None:
    step(4, "Dependencies and the extension")
    run(["uv", "sync"])
    run(["pnpm", "install"])
    run(["pnpm", "build:extension"])
    if want_firefox:
        run(["pnpm", "build:extension:firefox"])
    if not ARGS.dry_run:
        ok(f"extension built at {CHROME_BUILD.relative_to(ROOT)}")


# ── 5. backend ──────────────────────────────────────────────────────────────

def _launchd_plist(uv: str) -> str:
    logs = STATE / "logs"
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>{SERVICE_LABEL}</string>
  <key>ProgramArguments</key><array><string>{uv}</string><string>run</string><string>agentic-api-run</string></array>
  <key>WorkingDirectory</key><string>{ROOT}</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>{os.environ.get('PATH', '')}</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>{logs}/backend.log</string>
  <key>StandardErrorPath</key><string>{logs}/backend.log</string>
</dict></plist>
"""


def _systemd_unit(uv: str) -> str:
    return f"""[Unit]
Description=Agentic Browser backend
After=network-online.target

[Service]
WorkingDirectory={ROOT}
ExecStart={uv} run agentic-api-run
Restart=on-failure
Environment=PATH={os.environ.get('PATH', '')}

[Install]
WantedBy=default.target
"""


def backend() -> None:
    step(5, "Backend")
    if http_json("/api/genai/health/"):
        ok("already running on port 5454")
        if not ask("Install it as a login service anyway?", default=False):
            return
        service = True
    else:
        service = (MAC or LINUX) and ask("Start the backend automatically when you log in?")
    uv = shutil.which("uv") or "uv"
    (STATE / "logs").mkdir(parents=True, exist_ok=True)
    if service and MAC:
        plist = Path.home() / "Library" / "LaunchAgents" / f"{SERVICE_LABEL}.plist"
        if ARGS.dry_run:
            info(f"would write {plist} and load it")
        else:
            plist.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(["launchctl", "unload", str(plist)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            plist.write_text(_launchd_plist(uv))
            run(["launchctl", "load", "-w", str(plist)])
            ok(f"launchd agent {SERVICE_LABEL}, logs in {STATE / 'logs' / 'backend.log'}")
    elif service and LINUX:
        unit = Path.home() / ".config" / "systemd" / "user" / "agentic-browser.service"
        if ARGS.dry_run:
            info(f"would write {unit} and enable it")
        else:
            unit.parent.mkdir(parents=True, exist_ok=True)
            unit.write_text(_systemd_unit(uv))
            run(["systemctl", "--user", "daemon-reload"])
            run(["systemctl", "--user", "enable", "--now", "agentic-browser.service"])
            ok("systemd user service agentic-browser, `journalctl --user -u agentic-browser` for logs")
    elif not http_json("/api/genai/health/"):
        if ARGS.dry_run:
            info("would start the backend in the background")
        else:
            log = open(STATE / "logs" / "backend.log", "a")
            subprocess.Popen([uv, "run", "agentic-api-run"], cwd=ROOT, stdout=log, stderr=log, start_new_session=True)
            ok(f"started in the background for now, logs in {STATE / 'logs' / 'backend.log'}")
    if ARGS.dry_run:
        return
    info("waiting for http://127.0.0.1:5454 …")
    for _ in range(120):
        if http_json("/api/genai/health/"):
            ok("backend is up")
            return
        time.sleep(1)
    warn(f"the backend didn't answer within 2 minutes; check {STATE / 'logs' / 'backend.log'}")


# ── 6. browsers ─────────────────────────────────────────────────────────────

@dataclass
class Browser:
    name: str
    kind: str  # chromium or firefox
    app: str  # macOS app name, or a command on Linux
    extensions_page: str


MAC_BROWSERS = [
    Browser("Google Chrome", "chromium", "Google Chrome", "chrome://extensions"),
    Browser("Chrome Beta", "chromium", "Google Chrome Beta", "chrome://extensions"),
    Browser("Chrome Canary", "chromium", "Google Chrome Canary", "chrome://extensions"),
    Browser("Chromium", "chromium", "Chromium", "chrome://extensions"),
    Browser("Brave", "chromium", "Brave Browser", "brave://extensions"),
    Browser("Microsoft Edge", "chromium", "Microsoft Edge", "edge://extensions"),
    Browser("Arc", "chromium", "Arc", "arc://extensions"),
    Browser("Dia", "chromium", "Dia", "chrome://extensions"),
    Browser("Vivaldi", "chromium", "Vivaldi", "vivaldi://extensions"),
    Browser("Opera", "chromium", "Opera", "opera://extensions"),
    Browser("Helium", "chromium", "Helium", "chrome://extensions"),
    Browser("Comet", "chromium", "Comet", "chrome://extensions"),
    Browser("Firefox", "firefox", "Firefox", "about:debugging#/runtime/this-firefox"),
    Browser("Firefox Developer Edition", "firefox", "Firefox Developer Edition", "about:debugging#/runtime/this-firefox"),
    Browser("Zen", "firefox", "Zen", "about:debugging#/runtime/this-firefox"),
    Browser("LibreWolf", "firefox", "LibreWolf", "about:debugging#/runtime/this-firefox"),
]
LINUX_BROWSERS = [
    Browser("Google Chrome", "chromium", "google-chrome", "chrome://extensions"),
    Browser("Chromium", "chromium", "chromium", "chrome://extensions"),
    Browser("Brave", "chromium", "brave-browser", "brave://extensions"),
    Browser("Microsoft Edge", "chromium", "microsoft-edge", "edge://extensions"),
    Browser("Vivaldi", "chromium", "vivaldi", "vivaldi://extensions"),
    Browser("Firefox", "firefox", "firefox", "about:debugging#/runtime/this-firefox"),
]
INSTALLABLE = [("Google Chrome", "google-chrome"), ("Brave", "brave-browser"), ("Chromium", "chromium"),
               ("Microsoft Edge", "microsoft-edge"), ("Firefox", "firefox")]


def _mac_app(name: str) -> Optional[Path]:
    for base in (Path("/Applications"), Path.home() / "Applications"):
        if (base / f"{name}.app").exists():
            return base / f"{name}.app"
    return None


def find_browsers() -> list[Browser]:
    extra = [Browser(Path(p).stem, "firefox" if "firefox" in p.lower() or "zen" in p.lower() else "chromium", p, "chrome://extensions")
             for p in ARGS.browser]
    if MAC:
        return [b for b in MAC_BROWSERS if _mac_app(b.app)] + extra
    if LINUX:
        return [b for b in LINUX_BROWSERS if shutil.which(b.app)] + extra
    return extra


def _copy(text: str) -> bool:
    for cmd in (["pbcopy"], ["wl-copy"], ["xclip", "-selection", "clipboard"]):
        if shutil.which(cmd[0]):
            subprocess.run(cmd, input=text.encode())
            return True
    return False


def _open_browser(b: Browser) -> None:
    if os.path.sep in b.app and os.path.isfile(b.app):  # --browser pointing at a binary
        subprocess.Popen([b.app, b.extensions_page], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    elif MAC:
        subprocess.run(["open", "-a", b.app])
    elif LINUX:
        subprocess.Popen([b.app], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)


def _connected() -> int:
    data = http_json("/api/mcp/settings") or {}
    return len((data.get("bridge") or {}).get("browsers") or [])


def load_extension(b: Browser) -> None:
    folder = CHROME_BUILD if b.kind == "chromium" else FIREFOX_BUILD
    print(f"\n  {c('1', b.name)}")
    if ARGS.dry_run:
        info(f"would open {b.name} and guide loading {folder}")
        return
    before = _connected()
    copied = _copy(str(folder))
    _open_browser(b)
    if MAC:
        subprocess.run(["open", "-R", str(folder / "manifest.json")])
    if b.kind == "chromium":
        print(f"""    1. In {b.name}, open {c('1', b.extensions_page)} (paste it in the address bar)
    2. Turn on {c('1', 'Developer mode')} (top right)
    3. Click {c('1', 'Load unpacked')} and pick this folder{' (the path is on your clipboard, ⌘⇧G pastes it)' if copied and MAC else ''}:
       {folder}""")
    else:
        print(f"""    1. In {b.name}, open {c('1', b.extensions_page)}
    2. Click {c('1', 'Load Temporary Add-on…')} and pick {folder / 'manifest.json'}
    {c('2', "Firefox removes temporary add-ons when it quits. Permanent installs need a signed build from addons.mozilla.org.")}""")
    print(f"    {c('2', 'Waiting for the extension to connect to the bridge… (Enter to skip)')}")
    import select

    deadline = time.time() + 600
    while time.time() < deadline:
        if _connected() > before:
            ok(f"{b.name}: extension connected")
            return
        if sys.stdin.isatty() and select.select([sys.stdin], [], [], 2)[0]:
            sys.stdin.readline()
            warn(f"{b.name}: skipped. Load it later from {folder}")
            return
        if not sys.stdin.isatty():
            time.sleep(2)
    warn(f"{b.name}: didn't see it connect. Is the backend running? The extension's settings show its bridge status.")


def browsers() -> None:
    step(6, "Browsers")
    if ARGS.skip_browsers:
        warn("skipped (--skip-browsers)")
        return
    found = find_browsers()
    if found:
        ok("found " + ", ".join(b.name for b in found))
    else:
        warn("no supported browser found (Safari can't load unpacked extensions)")
    if MAC and shutil.which("brew"):
        missing = [(n, cask) for n, cask in INSTALLABLE if not any(b.name == n for b in found)]
        # Never install a browser just because --yes was passed.
        if missing and not ARGS.yes and ask("Install a browser with Homebrew?", default=not found):
            pick = choose("Which one?", [n for n, _ in missing])
            run(["brew", "install", "--cask", missing[pick][1]])
            found = find_browsers()
    if not found:
        warn(f"Load {CHROME_BUILD} as an unpacked extension in a Chromium browser when you have one.")
        return
    labels = [f"{b.name}{' (temporary add-on)' if b.kind == 'firefox' else ''}" for b in found]
    defaults = [i for i, b in enumerate(found) if b.kind == "chromium"][:1] or [0]
    picked = [found[i] for i in choose_many("Install the extension in which browsers?", labels, defaults)]
    if any(b.kind == "firefox" for b in picked) and not FIREFOX_BUILD.exists():
        run(["pnpm", "build:extension:firefox"])
    for b in picked:
        load_extension(b)


# ── 7. MCP ──────────────────────────────────────────────────────────────────

def mcp() -> None:
    step(7, "MCP for coding agents")
    if ARGS.skip_mcp:
        warn("skipped (--skip-mcp)")
        return
    if not ask("Register the browser and memory tools with your coding agents (Claude Code, Codex, Cursor, Gemini CLI, OpenCode)?"):
        info("later: uv run agentic-mcp install")
        return
    run(["uv", "run", "agentic-mcp", "install", "--dry-run"], check=False)
    if ARGS.dry_run or ask("Apply those changes?"):
        run(["uv", "run", "agentic-mcp", "install"], check=False)


# ── main ────────────────────────────────────────────────────────────────────

def main() -> None:
    global ARGS
    parser = argparse.ArgumentParser(description="Install Agentic Browser: databases, backend, extension and MCP.")
    parser.add_argument("--yes", "-y", action="store_true", help="take the defaults without asking")
    parser.add_argument("--dry-run", action="store_true", help="show what would happen, change nothing")
    parser.add_argument("--skip-docker", action="store_true", help="don't start the databases (bring your own)")
    parser.add_argument("--skip-browsers", action="store_true", help="don't set up browsers")
    parser.add_argument("--skip-mcp", action="store_true", help="don't register the MCP server")
    parser.add_argument("--firefox", action="store_true", help="also build the Firefox version")
    parser.add_argument("--browser", action="append", default=[], metavar="PATH",
                        help="a browser app or binary the installer doesn't know about (repeatable)")
    ARGS = parser.parse_args()
    sys.stdout.reconfigure(line_buffering=True)  # keep our lines in order with the tools' output

    print(c("1", "Agentic Browser installer") + c("2", f"  ·  {ROOT}"))
    if ARGS.dry_run:
        warn("dry run: nothing will change")
    check_tools()
    setup_env()
    start_databases()
    build(ARGS.firefox)
    backend()
    browsers()
    mcp()
    print(f"""
{c('1;32', 'Done.')}
  Side panel   click the extension's icon in your browser
  Console      pnpm dev:debug  (dashboard, runs, memory, settings)
  Backend      {API}  ·  logs in {STATE / 'logs' / 'backend.log'}
  Settings     add keys, subscriptions, voice and Telegram in the console's Settings
""")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped.")
        sys.exit(130)
