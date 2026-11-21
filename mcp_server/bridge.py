"""Link between MCP tool calls and the browser extension.

One process per machine owns ``127.0.0.1:5455`` (the bridge host). The
extension keeps a WebSocket open to ``/bridge/ws`` there, and tool calls are
sent down that socket as JSON requests.

Any other process that wants the browser (a second ``agentic-mcp`` started
by another MCP client, for example) relays through ``POST /bridge/call``
using the token stored in ``~/.agentic-browser/bridge-token``.
"""

from __future__ import annotations

import asyncio
import contextlib
import hmac
import json
import logging
import socket
import sys
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

import httpx
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route, WebSocketRoute
from starlette.websockets import WebSocket, WebSocketDisconnect

from mcp_server import config

logger = logging.getLogger("agentic_browser.bridge")

DEFAULT_TIMEOUT = 30.0
MAX_TIMEOUT = 1800.0  # remote browser tasks can take a while


class BridgeError(RuntimeError):
    """A browser call failed or no browser is attached."""


@dataclass
class BrowserConnection:
    conn_id: str
    websocket: WebSocket
    info: dict[str, Any]
    connected_at: float = field(default_factory=time.time)
    pending: dict[str, asyncio.Future[Any]] = field(default_factory=dict)
    send_lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    def describe(self) -> dict[str, Any]:
        return {
            "id": self.conn_id,
            "browser": self.info.get("browser"),
            "version": self.info.get("version"),
            "extension_version": self.info.get("extension_version"),
            "capabilities": self.info.get("capabilities", []),
            "connected_for_s": round(time.time() - self.connected_at),
        }


class LocalBridge:
    """Owns the extension WebSockets. Lives in the bridge host process."""

    def __init__(self) -> None:
        self._connections: dict[str, BrowserConnection] = {}
        self._order: list[str] = []
        self._changed = asyncio.Event()

    # ── extension side ──────────────────────────────────────────────────
    async def handle_websocket(self, websocket: WebSocket) -> None:
        origin = websocket.headers.get("origin", "")
        if not _origin_allowed(origin):
            logger.warning("Rejected bridge connection from origin %r", origin)
            await websocket.close(code=4403)
            return
        await websocket.accept()
        try:
            hello = json.loads(await asyncio.wait_for(websocket.receive_text(), timeout=10))
        except Exception:
            await websocket.close(code=4400)
            return
        if hello.get("type") != "hello":
            await websocket.close(code=4400)
            return

        conn = BrowserConnection(conn_id=uuid.uuid4().hex[:8], websocket=websocket, info=hello)
        self._connections[conn.conn_id] = conn
        self._order.append(conn.conn_id)
        self._changed.set()
        logger.info("Browser attached: %s", conn.describe())
        await websocket.send_text(json.dumps({"type": "welcome", "id": conn.conn_id}))

        try:
            while True:
                msg = json.loads(await websocket.receive_text())
                kind = msg.get("type")
                if kind == "ping":
                    await self._send(conn, {"type": "pong"})
                elif kind == "response":
                    fut = conn.pending.pop(str(msg.get("id")), None)
                    if fut and not fut.done():
                        if msg.get("error"):
                            err = msg["error"]
                            fut.set_exception(BridgeError(err.get("message") if isinstance(err, dict) else str(err)))
                        else:
                            fut.set_result(msg.get("result"))
        except (WebSocketDisconnect, RuntimeError):
            pass
        except Exception as exc:  # malformed frame or similar
            logger.warning("Bridge connection %s failed: %s", conn.conn_id, exc)
        finally:
            self._connections.pop(conn.conn_id, None)
            with contextlib.suppress(ValueError):
                self._order.remove(conn.conn_id)
            for fut in conn.pending.values():
                if not fut.done():
                    fut.set_exception(BridgeError("Browser disconnected during the call"))
            logger.info("Browser detached: %s", conn.conn_id)

    async def _send(self, conn: BrowserConnection, payload: dict[str, Any]) -> None:
        async with conn.send_lock:
            await conn.websocket.send_text(json.dumps(payload))

    # ── tool side ───────────────────────────────────────────────────────
    def browsers(self) -> list[dict[str, Any]]:
        return [self._connections[c].describe() for c in self._order if c in self._connections]

    async def _pick(self, browser: str | None, wait: float) -> BrowserConnection:
        deadline = time.monotonic() + wait
        while True:
            if browser:
                conn = self._connections.get(browser)
                if conn:
                    return conn
            elif self._order:
                return self._connections[self._order[-1]]
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise BridgeError(NO_BROWSER_MESSAGE)
            self._changed.clear()
            with contextlib.suppress(asyncio.TimeoutError):
                await asyncio.wait_for(self._changed.wait(), timeout=remaining)

    async def call(
        self,
        method: str,
        params: dict[str, Any] | None = None,
        *,
        timeout: float = DEFAULT_TIMEOUT,
        browser: str | None = None,
    ) -> Any:
        timeout = max(1.0, min(float(timeout), MAX_TIMEOUT))
        # The service worker may be reconnecting after Chrome suspended it.
        conn = await self._pick(browser, wait=3.0)
        req_id = uuid.uuid4().hex
        fut: asyncio.Future[Any] = asyncio.get_running_loop().create_future()
        conn.pending[req_id] = fut
        try:
            await self._send(
                conn,
                {"type": "request", "id": req_id, "method": method, "params": params or {}, "timeout": timeout},
            )
            return await asyncio.wait_for(fut, timeout=timeout + 2)
        except asyncio.TimeoutError as exc:
            raise BridgeError(f"Browser did not answer {method} within {timeout:.0f}s") from exc
        finally:
            conn.pending.pop(req_id, None)

    # ── HTTP endpoints ──────────────────────────────────────────────────
    async def status_endpoint(self, request: Request) -> JSONResponse:
        return JSONResponse({"ok": True, "service": "agentic-browser-bridge", "browsers": self.browsers()})

    async def call_endpoint(self, request: Request) -> JSONResponse:
        token = config.read_token() or ""
        auth = request.headers.get("authorization", "")
        if not token or not hmac.compare_digest(auth, f"Bearer {token}"):
            return JSONResponse({"error": "unauthorized"}, status_code=401)
        if request.headers.get("origin"):
            # Only local processes relay. Browsers always send Origin on POST.
            return JSONResponse({"error": "forbidden"}, status_code=403)
        body = await request.json()
        if body.get("method") == "__browsers__":
            return JSONResponse({"result": self.browsers()})
        try:
            result = await self.call(
                str(body.get("method")),
                body.get("params") or {},
                timeout=float(body.get("timeout") or DEFAULT_TIMEOUT),
                browser=body.get("browser"),
            )
            return JSONResponse({"result": result})
        except BridgeError as exc:
            return JSONResponse({"error": str(exc)})

    def routes(self) -> list[Any]:
        return [
            Route("/bridge/status", self.status_endpoint, methods=["GET"]),
            Route("/bridge/call", self.call_endpoint, methods=["POST"]),
            WebSocketRoute("/bridge/ws", self.handle_websocket),
        ]


class RemoteBridge:
    """Relays calls to the bridge host owned by another local process."""

    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = base_url or config.bridge_base_url()

    async def _post(self, payload: dict[str, Any], timeout: float) -> Any:
        token = config.read_token()
        if not token:
            raise BridgeError("Bridge token missing. Start the bridge with `agentic-mcp serve`.")
        try:
            async with httpx.AsyncClient(timeout=timeout + 5) as client:
                resp = await client.post(
                    f"{self.base_url}/bridge/call",
                    json=payload,
                    headers={"Authorization": f"Bearer {token}"},
                )
        except httpx.HTTPError as exc:
            raise BridgeUnavailable(str(exc)) from exc
        if resp.status_code != 200:
            raise BridgeError(f"Bridge host rejected the call ({resp.status_code})")
        data = resp.json()
        if data.get("error"):
            raise BridgeError(data["error"])
        return data.get("result")

    async def call(
        self,
        method: str,
        params: dict[str, Any] | None = None,
        *,
        timeout: float = DEFAULT_TIMEOUT,
        browser: str | None = None,
    ) -> Any:
        timeout = max(1.0, min(float(timeout), MAX_TIMEOUT))
        return await self._post(
            {"method": method, "params": params or {}, "timeout": timeout, "browser": browser}, timeout
        )

    async def browsers_async(self) -> list[dict[str, Any]]:
        return await self._post({"method": "__browsers__"}, 5)


class BridgeUnavailable(BridgeError):
    pass


NO_BROWSER_MESSAGE = (
    "No browser is connected to the Agentic Browser bridge. Open Chrome with the "
    "Agentic Browser extension installed; it connects to "
    f"ws://{config.BRIDGE_HOST}:{config.BRIDGE_PORT}/bridge/ws on its own. "
    "Check the extension's settings page for its connection status."
)


def _origin_allowed(origin: str) -> bool:
    for scheme in ("chrome-extension://", "moz-extension://"):
        if origin.startswith(scheme):
            ext_id = origin[len(scheme):].rstrip("/")
            return not config.ALLOWED_EXTENSION_IDS or ext_id in config.ALLOWED_EXTENSION_IDS
    return False


# ── host management ─────────────────────────────────────────────────────────


class _EmbeddedServer:
    """uvicorn.Server that leaves the parent process's signal handlers alone."""

    def __init__(self, app: Any, sock: socket.socket) -> None:
        import uvicorn

        class _Server(uvicorn.Server):
            @contextlib.contextmanager
            def capture_signals(self):  # type: ignore[override]
                yield

        cfg = uvicorn.Config(app, log_level="warning", lifespan="on", ws="websockets-sansio")
        self.server = _Server(cfg)
        self.sock = sock

    async def serve(self) -> None:
        await self.server.serve(sockets=[self.sock])

    def stop(self) -> None:
        self.server.should_exit = True


class BridgeManager:
    """Decides whether this process hosts the bridge or relays to another one."""

    def __init__(self) -> None:
        self.local: LocalBridge | None = None
        self.remote = RemoteBridge()
        self._server: _EmbeddedServer | None = None
        self._task: asyncio.Task[None] | None = None
        self._lock = asyncio.Lock()

    @property
    def is_host(self) -> bool:
        return self.local is not None

    async def ensure_started(self) -> None:
        """Become the bridge host if the port is free; otherwise relay."""
        async with self._lock:
            if self._task is not None and not self._task.done():
                return
            try:
                sock = _bind(config.BRIDGE_HOST, config.BRIDGE_PORT)
            except OSError:
                self.local = None
                return
            from mcp_server.server import build_http_app

            local = LocalBridge()
            app = build_http_app(local)
            self._server = _EmbeddedServer(app, sock)
            self.local = local
            config.read_or_create_token()
            self._task = asyncio.create_task(self._server.serve(), name="agentic-browser-bridge")
            logger.info("Bridge host listening on %s", config.bridge_base_url())

    async def stop(self) -> None:
        if self._server:
            self._server.stop()
        if self._task:
            with contextlib.suppress(Exception):
                await asyncio.wait_for(self._task, timeout=5)
        self._server = None
        self._task = None
        self.local = None

    async def call(self, method: str, params: dict[str, Any] | None = None, **kw: Any) -> Any:
        if self.local is None:
            await self.ensure_started()
        if self.local is not None:
            return await self.local.call(method, params, **kw)
        try:
            return await self.remote.call(method, params, **kw)
        except BridgeUnavailable:
            # The previous host went away. Take over the port and retry once.
            await self.ensure_started()
            if self.local is None:
                raise
            return await self.local.call(method, params, **kw)

    async def browsers(self) -> list[dict[str, Any]]:
        if self.local is None:
            await self.ensure_started()
        if self.local is not None:
            return self.local.browsers()
        try:
            return await self.remote.browsers_async()
        except BridgeError:
            return []


def _bind(host: str, port: int) -> socket.socket:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    # On POSIX, SO_REUSEADDR only skips TIME_WAIT; a second live listener still
    # fails to bind, which is what sends other processes to relay mode. On
    # Windows it would allow port sharing, so it stays off there.
    if sys.platform != "win32":
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.bind((host, port))
        sock.listen(64)
    except OSError:
        sock.close()
        raise
    sock.setblocking(False)
    return sock


manager = BridgeManager()
