"""Which models each provider offers, for the model pickers.

Built-in providers come from models.dev (https://models.dev/api.json), cached
for six hours in memory and on disk so the picker still works offline.

A provider pointed at a custom endpoint (openai_base_url, anthropic_base_url,
google_base_url) lists whatever that endpoint serves instead, through the
models route of its API format:

  openai     GET {base}/models          (base usually ends in /v1)
  anthropic  GET {base}/v1/models
  google     GET {base}/v1beta/models
  ollama     GET {base}/api/tags

If the endpoint can't be reached, the provider falls back to models.dev and
says why.
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from pathlib import Path
from typing import Any, Optional, TypedDict

import httpx

from core import get_logger
from core.llm import PROVIDER_CONFIGS, resolve_provider_secrets

logger = get_logger(__name__)

MODELS_DEV_URL = "https://models.dev/api.json"
CACHE_TTL = 6 * 3600
CACHE_FILE = Path(os.environ.get("AGENTIC_BROWSER_HOME", Path.home() / ".agentic-browser")) / "models-dev.json"

PROVIDER_LABELS = {
    "google": "Google",
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "deepseek": "DeepSeek",
    "openrouter": "OpenRouter",
    "ollama": "Ollama",
}

# models.dev ids, where they differ from ours.
MODELS_DEV_IDS = {p: p for p in PROVIDER_CONFIGS if p != "ollama"}


class ModelInfo(TypedDict, total=False):
    id: str
    name: str
    context: Optional[int]
    tool_call: Optional[bool]
    reasoning: Optional[bool]
    temperature: Optional[bool]
    released: Optional[str]
    input: Optional[list[str]]


_models_dev: dict[str, Any] | None = None
_models_dev_at = 0.0
_lock = asyncio.Lock()


async def _load_models_dev(refresh: bool = False) -> tuple[dict[str, Any], Optional[str]]:
    """models.dev data and an error string if it had to fall back to disk."""
    global _models_dev, _models_dev_at
    async with _lock:
        fresh = _models_dev is not None and time.time() - _models_dev_at < CACHE_TTL
        if fresh and not refresh:
            return _models_dev, None  # type: ignore[return-value]
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(MODELS_DEV_URL)
                resp.raise_for_status()
                data = resp.json()
            _models_dev, _models_dev_at = data, time.time()
            try:
                CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
                CACHE_FILE.write_text(json.dumps(data))
            except OSError:
                pass
            return data, None
        except Exception as exc:
            error = f"models.dev unreachable: {exc}"
            if _models_dev is not None:
                return _models_dev, error
            try:
                _models_dev = json.loads(CACHE_FILE.read_text())
                _models_dev_at = time.time() - CACHE_TTL + 300  # retry in 5 min
                return _models_dev, error
            except (OSError, ValueError):
                return {}, error


def _from_models_dev(data: dict[str, Any], provider: str) -> list[ModelInfo]:
    entry = data.get(MODELS_DEV_IDS.get(provider, provider)) or {}
    out: list[ModelInfo] = []
    for m in (entry.get("models") or {}).values():
        if m.get("status") == "deprecated":
            continue
        if "text" not in ((m.get("modalities") or {}).get("output") or ["text"]):
            continue
        out.append({
            "id": m["id"],
            "name": m.get("name") or m["id"],
            "context": (m.get("limit") or {}).get("context"),
            "tool_call": m.get("tool_call"),
            "reasoning": m.get("reasoning"),
            "temperature": m.get("temperature"),
            "released": m.get("release_date"),
            "input": (m.get("modalities") or {}).get("input"),
        })
    # Newest first, models that can call tools ahead of ones that can't.
    out.sort(key=lambda m: m.get("released") or "", reverse=True)
    out.sort(key=lambda m: m.get("tool_call") is False)
    return out


async def _from_endpoint(provider: str, base_url: str, api_key: str) -> list[ModelInfo]:
    base = base_url.rstrip("/")
    headers: dict[str, str] = {}
    if provider == "anthropic":
        url = base + "/v1/models?limit=1000"
        headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01"}
    elif provider == "google":
        url = base + "/v1beta/models?pageSize=1000"
        headers = {"x-goog-api-key": api_key} if api_key else {}
    elif provider == "ollama":
        url = base + "/api/tags"
    else:
        url = base + "/models" if base.endswith("/v1") else base + "/v1/models"
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        body = resp.json()

    out: list[ModelInfo] = []
    if provider == "ollama":
        for m in body.get("models") or []:
            out.append({"id": m["name"], "name": m["name"]})
    elif provider == "google":
        for m in body.get("models") or []:
            if "generateContent" not in (m.get("supportedGenerationMethods") or ["generateContent"]):
                continue
            mid = str(m.get("name", "")).removeprefix("models/")
            out.append({"id": mid, "name": m.get("displayName") or mid, "context": m.get("inputTokenLimit")})
    else:
        for m in body.get("data") or []:
            mid = m.get("id")
            if mid:
                out.append({"id": mid, "name": m.get("display_name") or m.get("name") or mid})
    out.sort(key=lambda m: m["id"])
    return out


async def provider_models(provider: str, refresh: bool = False) -> dict[str, Any]:
    api_key, base_url = await resolve_provider_secrets(provider)
    needs_key = PROVIDER_CONFIGS[provider].get("api_key_env") is not None
    custom = bool(base_url) and provider != "ollama"
    result: dict[str, Any] = {
        "id": provider,
        "label": PROVIDER_LABELS.get(provider, provider),
        "configured": bool(api_key) if needs_key else bool(base_url),
        "default_model": PROVIDER_CONFIGS[provider].get("default_model"),
        "base_url": base_url or None,
        "custom_endpoint": custom,
        "source": "models.dev",
        "error": None,
        "models": [],
    }
    if custom or provider == "ollama":
        try:
            result["models"] = await _from_endpoint(provider, base_url, api_key)
            result["source"] = "endpoint"
            return result
        except Exception as exc:
            reason = str(exc).splitlines()[0] if str(exc) else type(exc).__name__
            result["error"] = f"{base_url} didn't list models: {reason}"
            if provider == "ollama":
                result["source"] = "endpoint"
                return result
    data, error = await _load_models_dev(refresh)
    result["models"] = _from_models_dev(data, provider)
    result["error"] = result["error"] or error
    return result


async def catalog(refresh: bool = False) -> list[dict[str, Any]]:
    return list(await asyncio.gather(*(provider_models(p, refresh) for p in PROVIDER_CONFIGS)))


async def model_info(provider: str, model: str) -> Optional[ModelInfo]:
    """models.dev facts for one model (cached, so usually no network)."""
    data, _ = await _load_models_dev()
    for m in _from_models_dev(data, provider):
        if m["id"] == model:
            return m
    return None
