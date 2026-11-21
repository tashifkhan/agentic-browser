"""Google's Antigravity ACP runtime: find it, download it, update it, log in.

Where the runtime comes from is the "source" setting of the antigravity
runtime (core/runtimes.py):

  auto     this app's own download if there is one, else T3 Code's copy
  managed  this app's own download (~/.agentic-browser/tools/antigravity)
  t3       the copy T3 Code downloaded (~/.t3/tools/antigravity-acp)
  custom   the command / path in the runtime's settings

Downloads use Google's public release manifest (the same one the
Antigravity CLI's auto-updater and T3 Code use), and the archive is checked
against the manifest's SHA-512 before it's unpacked.

Login runs `<runtime> acp --login`, which prints a Google sign-in link and
waits for the code shown after sign-in; the console relays both.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import platform
import shutil
import tarfile
import tempfile
import time
from pathlib import Path
from typing import Any, Optional

import httpx

from core import get_logger

logger = get_logger(__name__)

MANIFEST_BASE = "https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests"
DOWNLOAD_PREFIX = "https://storage.googleapis.com/antigravity-public/antigravity-cli/"
STATE_DIR = Path(os.environ.get("AGENTIC_BROWSER_HOME", Path.home() / ".agentic-browser"))
MANAGED_DIR = STATE_DIR / "tools" / "antigravity"
T3_TOOLS = Path.home() / ".t3" / "tools" / "antigravity-acp"
T3_PROFILES = Path.home() / ".t3" / "userdata" / "providers" / "antigravity"
SOURCES = ("auto", "managed", "t3", "custom")


def target() -> Optional[str]:
    system = {"Darwin": "darwin", "Linux": "linux", "Windows": "windows"}.get(platform.system())
    machine = {"x86_64": "amd64", "AMD64": "amd64", "arm64": "arm64", "aarch64": "arm64"}.get(platform.machine())
    return f"{system}_{machine}" if system and machine else None


# ── finding copies ──────────────────────────────────────────────────────────

def _active(base: Path) -> Optional[dict[str, Any]]:
    try:
        return json.loads((base / "active.json").read_text())
    except (OSError, ValueError):
        return None


def managed() -> Optional[dict[str, str]]:
    """This app's download: {path, version}."""
    info = _active(MANAGED_DIR)
    if not info:
        return None
    exe = MANAGED_DIR / "versions" / info["version"] / "antigravity"
    return {"path": str(exe), "version": info["version"]} if exe.is_file() else None


def t3_copy() -> Optional[dict[str, str]]:
    """T3 Code's download, if it has one: {path, version}."""
    try:
        for plat in T3_TOOLS.iterdir():
            info = _active(plat)
            exe = plat / "versions" / str((info or {}).get("releaseId")) / "antigravity"
            if exe.is_file():
                return {"path": str(exe), "version": _version_of(str(exe))}
    except OSError:
        pass
    return None


def t3_profile() -> Optional[str]:
    """T3 Code's Antigravity profile with a saved Google login."""
    try:
        for d in sorted(T3_PROFILES.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
            if (d / "antigravity-acp" / "antigravity-oauth-token").exists():
                return str(d)
    except OSError:
        pass
    return None


_versions: dict[str, str] = {}


def _version_of(path: str) -> str:
    if path not in _versions:
        try:
            import subprocess

            out = subprocess.run([path, "--version"], capture_output=True, text=True, timeout=15,
                                 env={**os.environ, "ELECTRON_RUN_AS_NODE": "1"})
            _versions[path] = (out.stdout or out.stderr).strip().splitlines()[0][:40] if (out.stdout or out.stderr) else "?"
        except Exception:
            _versions[path] = "?"
    return _versions[path]


def resolve(source: str, custom: str = "") -> Optional[str]:
    if source == "custom":
        cmd = os.path.expanduser(custom or "")
        return cmd if os.path.isfile(cmd) else shutil.which(cmd) if cmd else None
    if source in ("managed", "auto") and managed():
        return managed()["path"]  # type: ignore[index]
    if source in ("t3", "auto") and t3_copy():
        return t3_copy()["path"]  # type: ignore[index]
    return None


def logged_in(profile_dir: str) -> bool:
    return (Path(os.path.expanduser(profile_dir)) / "antigravity-acp" / "antigravity-oauth-token").exists()


# ── downloads ───────────────────────────────────────────────────────────────

_latest: dict[str, Any] = {"at": 0.0, "value": None}


async def latest(refresh: bool = False) -> Optional[dict[str, str]]:
    """Newest release for this machine from Google's manifest (cached 1 h)."""
    if not refresh and _latest["value"] and time.time() - _latest["at"] < 3600:
        return _latest["value"]
    tgt = target()
    if not tgt:
        return None
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{MANIFEST_BASE}/{tgt}.json")
        resp.raise_for_status()
        data = resp.json()
    if not str(data.get("url", "")).startswith(DOWNLOAD_PREFIX) or len(str(data.get("sha512", ""))) != 128:
        raise RuntimeError("Google's Antigravity manifest looked wrong; not using it.")
    _latest.update(at=time.time(), value={"version": data["version"], "url": data["url"], "sha512": data["sha512"].lower()})
    return _latest["value"]


_install_lock = asyncio.Lock()


async def install_latest() -> dict[str, str]:
    """Download the newest runtime, verify its SHA-512, unpack it and make it
    the active managed copy. Older managed versions are removed."""
    async with _install_lock:
        rel = await latest(refresh=True)
        if not rel:
            raise RuntimeError("Google doesn't publish an Antigravity runtime for this platform.")
        current = managed()
        if current and current["version"] == rel["version"]:
            return {**current, "updated": "no"}
        if not rel["url"].endswith(".tar.gz"):
            raise RuntimeError("Only the .tar.gz releases (macOS, Linux) are supported for now.")
        MANAGED_DIR.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=MANAGED_DIR) as tmp:
            archive = Path(tmp) / "runtime.tar.gz"
            digest = hashlib.sha512()
            async with httpx.AsyncClient(timeout=httpx.Timeout(600, connect=20), follow_redirects=True) as client:
                async with client.stream("GET", rel["url"]) as resp:
                    resp.raise_for_status()
                    with open(archive, "wb") as fh:
                        async for chunk in resp.aiter_bytes(1 << 20):
                            fh.write(chunk)
                            digest.update(chunk)
            if digest.hexdigest() != rel["sha512"]:
                raise RuntimeError("The download didn't match Google's checksum, so it wasn't installed.")

            def unpack() -> Path:
                dest = MANAGED_DIR / "versions" / rel["version"]
                shutil.rmtree(dest, ignore_errors=True)
                dest.mkdir(parents=True)
                with tarfile.open(archive) as tar:
                    member = next((m for m in tar.getmembers() if m.isfile() and Path(m.name).name == "antigravity"), None)
                    if member is None:
                        raise RuntimeError("The release archive has no antigravity executable.")
                    src = tar.extractfile(member)
                    assert src is not None
                    exe = dest / "antigravity"
                    with open(exe, "wb") as out:
                        shutil.copyfileobj(src, out)
                exe.chmod(0o755)
                return exe

            exe = await asyncio.to_thread(unpack)
        (MANAGED_DIR / "active.json").write_text(json.dumps({"version": rel["version"], "sha512": rel["sha512"]}))
        for old in (MANAGED_DIR / "versions").iterdir():
            if old.name != rel["version"]:
                shutil.rmtree(old, ignore_errors=True)
        logger.info("Antigravity runtime %s installed at %s", rel["version"], exe)
        return {"path": str(exe), "version": rel["version"], "updated": "yes"}


async def overview(source: str, custom: str, profile_dir: str) -> dict[str, Any]:
    try:
        newest = await latest()
    except Exception as exc:
        newest = {"error": str(exc)[:200]}
    own = managed()
    return {
        "source": source,
        "using": resolve(source, custom),
        "managed": own,
        "t3": t3_copy(),
        "t3_profile": t3_profile(),
        "latest": {k: v for k, v in (newest or {}).items() if k != "sha512"} if newest else None,
        "update_available": bool(own and newest and newest.get("version") and newest["version"] != own["version"]),
        "logged_in": logged_in(profile_dir) if profile_dir else False,
    }


# ── login ───────────────────────────────────────────────────────────────────

_login: dict[str, Any] = {}


def runtime_env(profile_dir: str) -> dict[str, str]:
    return {
        **os.environ,
        "GEMINI_HOME": profile_dir,
        "AGY_ACP_FORCE_FILE_STORAGE": "1",
        "AGY_CLI_DISABLE_AUTO_UPDATE": "1",
        "ELECTRON_RUN_AS_NODE": "1",
        # Makes the runtime print a link and ask for the code, instead of
        # opening a browser on this machine.
        "SSH_CONNECTION": "127.0.0.1 0 127.0.0.1 0",
    }


async def login_start(binary: str, profile_dir: str) -> str:
    """Start `acp --login` and return the Google sign-in link."""
    await login_cancel()
    profile_dir = os.path.expanduser(profile_dir)
    Path(profile_dir).mkdir(parents=True, exist_ok=True)
    proc = await asyncio.create_subprocess_exec(
        binary, "acp", "--login", "--gemini-dir", profile_dir, "--app-data-dir", "antigravity-acp",
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
        env=runtime_env(profile_dir))
    assert proc.stdout
    url = None
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        line = (await asyncio.wait_for(proc.stdout.readline(), timeout=30)).decode(errors="replace").strip()
        if not line and proc.returncode is not None:
            break
        if line.startswith("https://"):
            url = line
            break
    if not url:
        proc.kill()
        raise RuntimeError("The runtime didn't print a sign-in link.")
    _login.update(proc=proc, profile=profile_dir, started=time.time())
    return url


async def login_finish(code: str) -> bool:
    proc = _login.get("proc")
    if proc is None or proc.returncode is not None:
        raise RuntimeError("No login is waiting. Start it again.")
    assert proc.stdin and proc.stdout
    proc.stdin.write((code.strip() + "\n").encode())
    await proc.stdin.drain()
    try:
        out = await asyncio.wait_for(proc.stdout.read(), timeout=60)
        await asyncio.wait_for(proc.wait(), timeout=10)
    except asyncio.TimeoutError:
        proc.kill()
        raise RuntimeError("The runtime didn't finish logging in within a minute.")
    profile = _login.pop("profile", "")
    _login.clear()
    if not logged_in(profile):
        raise RuntimeError(f"Login didn't complete: {out.decode(errors='replace').strip()[-300:]}")
    return True


async def login_cancel() -> None:
    proc = _login.pop("proc", None)
    _login.clear()
    if proc is not None and proc.returncode is None:
        proc.kill()
