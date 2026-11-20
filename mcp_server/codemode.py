"""Code mode: run an agent-written JavaScript program against the browser API.

The program runs in QuickJS inside this process. It has no network, file
system or Node APIs. The only way out is the ``browser``, ``sleep`` and
``console`` globals, which queue host calls that Python runs on the bridge.

QuickJS cannot call back into Python while a time limit is set, so host calls
work like an event loop. JS pushes a request onto a queue and gets a pending
Promise. Python drains the queue, awaits the bridge calls concurrently, and
settles the Promises. The time limit then applies to each JS burst between
host calls, which kills runaway loops without capping slow page loads.
"""

from __future__ import annotations

import asyncio
import base64
import json
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

import quickjs

BURST_LIMIT_S = 5.0
MEMORY_LIMIT = 256 * 1024 * 1024
MAX_LOG_LINES = 200
MAX_OUTPUT_CHARS = 40_000
_LOOP_MESSAGE = f"Script ran for more than {BURST_LIMIT_S:.0f}s without awaiting a browser call (infinite loop?)"

PRELUDE = r"""
(() => {
  const q = []; const pending = new Map(); let nextId = 0;
  const call = (m, a) => new Promise((resolve, reject) => {
    const id = ++nextId; pending.set(id, { resolve, reject }); q.push({ id, m, a: a ?? {} });
  });
  globalThis.__drain = () => JSON.stringify(q.splice(0, q.length));
  globalThis.__settle = (id, ok, payload) => {
    const p = pending.get(id); if (!p) return; pending.delete(id);
    if (ok) p.resolve(payload); else p.reject(new Error(payload));
  };
  const fmt = (v) => typeof v === "string" ? v : (() => { try { return JSON.stringify(v); } catch { return String(v); } })();
  const logs = [];
  globalThis.__logs = () => JSON.stringify(logs.splice(0, logs.length));
  globalThis.console = {
    log: (...a) => logs.push(a.map(fmt).join(" ")),
    info: (...a) => logs.push(a.map(fmt).join(" ")),
    warn: (...a) => logs.push("[warn] " + a.map(fmt).join(" ")),
    error: (...a) => logs.push("[error] " + a.map(fmt).join(" ")),
  };
  globalThis.sleep = (ms) => call("sleep", { ms });

  class Tab {
    constructor(id) { this.id = id ?? null; }
    _p(extra) { return { tabId: this.id, ...extra }; }
    async _act(action, extra) {
      const r = await call("page.act", this._p({ action, ...extra }));
      if (r && r.tabId != null) this.id = r.tabId;
      return r;
    }
    async snapshot(opts = {}) {
      const r = await call("page.snapshot", this._p(opts));
      if (r && r.tabId != null) this.id = r.tabId;
      return r.text;
    }
    screenshot(opts = {}) { return call("page.screenshot", this._p(opts)); }
    navigate(url, opts = {}) { return this._act("navigate", { url, ...opts }); }
    back() { return this._act("back"); }
    forward() { return this._act("forward"); }
    reload() { return this._act("reload"); }
    click(target, opts = {}) { return this._act("click", { target, ...opts }); }
    dblclick(target, opts = {}) { return this._act("click", { target, clickCount: 2, ...opts }); }
    hover(target) { return this._act("hover", { target }); }
    type(target, text, opts = {}) { return this._act("type", { target, text, ...opts }); }
    fill(target, text, opts = {}) { return this._act("type", { target, text, clear: true, ...opts }); }
    press(key, opts = {}) { return this._act("press", { key, ...opts }); }
    select(target, values) { return this._act("select", { target, values: [].concat(values) }); }
    check(target, checked = true) { return this._act("check", { target, checked }); }
    scroll(opts = {}) { return this._act("scroll", opts); }
    dialog(accept = true, promptText) { return this._act("dialog", { accept, promptText }); }
    async waitFor(cond = {}) { return call("page.waitFor", this._p(cond)); }
    async evaluate(expression) {
      const src = typeof expression === "function" ? `(${expression.toString()})()` : String(expression);
      const r = await call("page.evaluate", this._p({ expression: src }));
      return r.value;
    }
    async text(target) { return (await call("page.read", this._p({ target }))).text; }
    close() { return call("tabs.close", { tabId: this.id }); }
    focus() { return call("tabs.focus", { tabId: this.id }); }
  }

  globalThis.browser = {
    tabs: () => call("tabs.list", {}),
    tab: (id) => new Tab(id),
    async open(url, opts = {}) { const t = await call("tabs.open", { url, ...opts }); return new Tab(t.id); },
  };
  globalThis.Tab = Tab;
})();
"""


@dataclass
class RunResult:
    ok: bool
    value: Any = None
    error: str | None = None
    logs: list[str] = field(default_factory=list)
    images: list[tuple[bytes, str]] = field(default_factory=list)
    calls: int = 0
    elapsed_s: float = 0.0

    def render(self) -> str:
        parts: list[str] = []
        if self.ok:
            if self.value is not None:
                text = self.value if isinstance(self.value, str) else json.dumps(self.value, indent=2, ensure_ascii=False)
                parts.append(text)
            else:
                parts.append("(no return value)")
        else:
            parts.append(f"Error: {self.error}")
        if self.logs:
            parts.append("--- console ---\n" + "\n".join(self.logs[-MAX_LOG_LINES:]))
        parts.append(f"--- {self.calls} browser calls in {self.elapsed_s:.1f}s ---")
        out = "\n".join(parts)
        if len(out) > MAX_OUTPUT_CHARS:
            out = out[:MAX_OUTPUT_CHARS] + f"\n... truncated {len(out) - MAX_OUTPUT_CHARS} chars. Return less data."
        return out


HostCall = Callable[[str, dict[str, Any]], Awaitable[Any]]


class CodeRunner:
    """Holds ``state`` between runs so scripts can carry data forward."""

    def __init__(self, host_call: HostCall) -> None:
        self._host_call = host_call
        self._state_json = "{}"
        self._lock = asyncio.Lock()

    async def run(self, code: str, *, timeout: float = 60.0) -> RunResult:
        async with self._lock:
            return await self._run(code, timeout=timeout)

    async def _run(self, code: str, *, timeout: float) -> RunResult:
        started = time.monotonic()
        deadline = started + timeout
        result = RunResult(ok=False)
        ctx = quickjs.Context()
        ctx.set_memory_limit(MEMORY_LIMIT)
        ctx.set_time_limit(BURST_LIMIT_S)

        def js(src: str) -> Any:
            return ctx.eval(src)

        try:
            js(PRELUDE)
            js(f"globalThis.state = JSON.parse({json.dumps(self._state_json)});")
            js("globalThis.__st = { done: false };")
            wrapped = (
                "(async () => {\n" + code + "\n})().then("
                "v => { __st = { done: true, ok: true, v: v === undefined ? null : v }; },"
                "e => { __st = { done: true, ok: false, e: (e && e.stack) ? String(e.message) + '\\n' + String(e.stack) : String(e) }; });"
            )
            js(wrapped)
        except quickjs.JSException as exc:
            msg = str(exc)
            result.error = _LOOP_MESSAGE if "interrupted" in msg else f"Script failed to start: {msg}"
            result.elapsed_s = time.monotonic() - started
            return result

        try:
            while True:
                while ctx.execute_pending_job():
                    pass
                result.logs.extend(json.loads(js("__logs()")))
                status = json.loads(js("JSON.stringify(__st)"))
                if status.get("done"):
                    if status.get("ok"):
                        result.ok = True
                        result.value = status.get("v")
                    else:
                        result.error = status.get("e")
                    break
                queue = json.loads(js("__drain()"))
                if not queue:
                    result.error = (
                        "Script is waiting on something that will never finish. "
                        "Await only browser.*, tab.* and sleep() calls."
                    )
                    break
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    result.error = f"Script timed out after {timeout:.0f}s"
                    break
                outcomes = await asyncio.wait_for(
                    asyncio.gather(*(self._dispatch(item, result, remaining) for item in queue)),
                    timeout=remaining + 1,
                )
                for item, (ok, payload) in zip(queue, outcomes):
                    js(f"__settle({int(item['id'])}, {'true' if ok else 'false'}, {json.dumps(payload)});")
        except asyncio.TimeoutError:
            result.error = f"Script timed out after {timeout:.0f}s"
        except quickjs.JSException as exc:
            msg = str(exc)
            result.error = _LOOP_MESSAGE if "interrupted" in msg else msg
        finally:
            try:
                self._state_json = js("JSON.stringify(globalThis.state ?? {})") or "{}"
            except Exception:
                pass

        result.elapsed_s = time.monotonic() - started
        return result

    async def _dispatch(self, item: dict[str, Any], result: RunResult, remaining: float) -> tuple[bool, Any]:
        method = str(item.get("m"))
        args = item.get("a") or {}
        result.calls += 1
        try:
            if method == "sleep":
                await asyncio.sleep(min(max(float(args.get("ms", 0)) / 1000, 0), remaining))
                return True, None
            value = await self._host_call(method, args)
            if method in ("page.screenshot", "page.snapshot") and isinstance(value, dict):
                value = self._take_image(value, result)
            return True, value
        except Exception as exc:
            return False, str(exc)

    @staticmethod
    def _take_image(value: dict[str, Any], result: RunResult) -> dict[str, Any]:
        data_url = value.pop("screenshot", None) or value.pop("dataUrl", None)
        if isinstance(data_url, str) and data_url.startswith("data:"):
            header, b64 = data_url.split(",", 1)
            mime = header[5:].split(";")[0] or "image/png"
            result.images.append((base64.b64decode(b64), mime.split("/")[-1]))
            value["attached"] = f"image #{len(result.images)} is attached to the tool result"
        return value
