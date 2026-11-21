"""Per-request model choice.

Clients pick a model for one request with two headers:

  X-Agentic-Provider: openrouter
  X-Agentic-Model:    qwen/qwen4-max

While that request runs (streamed responses included), get_default_llm() and
the `llm` / `_model` proxies in core.llm return that model instead of the
saved default. Without the headers nothing changes.

This is plain ASGI rather than BaseHTTPMiddleware so the context variable is
still set while a StreamingResponse body is being generated.
"""
from __future__ import annotations

import json

from core import get_logger
from core.llm import llm_for, reset_request_llm, set_request_llm

logger = get_logger(__name__)

PROVIDER_HEADER = b"x-agentic-provider"
MODEL_HEADER = b"x-agentic-model"


class RequestModelMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = dict(scope.get("headers") or [])
        provider = headers.get(PROVIDER_HEADER, b"").decode().strip()
        model = headers.get(MODEL_HEADER, b"").decode().strip()
        if not provider or not model:
            await self.app(scope, receive, send)
            return
        # A subscription runtime (Claude, Codex, Antigravity, OpenCode...):
        # the chat turn runs on it; background jobs keep the default model.
        from core import runtimes

        all_runtimes = await runtimes.load_all()
        if provider.lower() in all_runtimes:
            cfg = all_runtimes[provider.lower()]
            if not cfg.get("enabled"):
                await self._reject(send, f"{cfg['label']} is turned off. Turn it on in Settings → Subscriptions.")
                return
            token = runtimes.set_pick(runtimes.Pick(provider.lower(), model))
            try:
                await self.app(scope, receive, send)
            finally:
                runtimes.reset_pick(token)
            return
        try:
            picked = await llm_for(provider, model)
        except Exception as exc:
            logger.warning("Picked model %s/%s is unusable: %s", provider, model, exc)
            await self._reject(send, f"Can't use {provider}/{model}: {exc}")
            return
        token = set_request_llm(picked)
        try:
            await self.app(scope, receive, send)
        finally:
            reset_request_llm(token)

    @staticmethod
    async def _reject(send, detail: str) -> None:
        body = json.dumps({"detail": detail}).encode()
        await send({
            "type": "http.response.start",
            "status": 400,
            "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
        })
        await send({"type": "http.response.body", "body": body})
