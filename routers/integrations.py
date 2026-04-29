from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core import get_logger
from core.config import get_settings
from services.app_state import AppStateService
from services.oauth_credentials_service import get_oauth_credentials_service

router = APIRouter()
logger = get_logger(__name__)

LLM_SETTING_KEY = "llm.default"

NATIVE_TOOLS = [
    {"id": "pyjiit", "label": "PyJIIT", "auth": "username/password (per-request)"},
    {"id": "skills", "label": "Skills", "auth": "none (local)"},
    {"id": "voice", "label": "Voice (Whisper)", "auth": "none (local)"},
    {"id": "browser-use", "label": "Browser-use", "auth": "none (extension)"},
    {"id": "website", "label": "Website scraper", "auth": "none"},
    {"id": "google-search", "label": "Google Search", "auth": "API key (server)"},
    {"id": "github-crawler", "label": "GitHub Crawler", "auth": "public web"},
]

REGISTERED_AGENTS = [
    {"id": "react_agent", "label": "ReAct Agent", "module": "agents.react_agent"},
    {"id": "while_loop_harness", "label": "While-Loop Harness", "module": "agents.while_loop_harness"},
    {"id": "browser_use", "label": "Browser-Use Agent", "module": "services.browser_use_service"},
]


class LLMOverride(BaseModel):
    provider: Optional[str] = None
    model: Optional[str] = None
    temperature: Optional[float] = None


def _llm_env_status() -> dict[str, bool]:
    s = get_settings()
    return {
        "google": bool(s.google_api_key),
        "openai": bool(s.openai_api_key),
        "anthropic": bool(s.anthropic_api_key),
        "deepseek": bool(s.deepseek_api_key),
        "openrouter": bool(s.openrouter_api_key),
        "ollama": bool(s.ollama_base_url),
        "tavily": bool(s.tavily_api_key),
    }


def _llm_default_from_env() -> dict[str, Any]:
    return {
        "provider": "google",
        "model": "gemini-2.5-flash",
        "temperature": 0.4,
        "source": "env",
    }


async def _llm_effective() -> dict[str, Any]:
    state = AppStateService()
    override = await state.get_setting(LLM_SETTING_KEY)
    base = _llm_default_from_env()
    if override:
        return {**base, **override, "source": "db"}
    return base


def _composio_client():
    s = get_settings()
    if not s.composio_api_key:
        return None, None
    try:
        from composio import Composio
    except ImportError:
        return None, None
    return Composio(api_key=s.composio_api_key), s.composio_user_id


async def _composio_status() -> dict[str, Any]:
    client, user_id = _composio_client()
    if client is None:
        return {"configured": False, "user_id": None, "connected": [], "error": None}
    connected: list[dict[str, Any]] = []
    error: str | None = None
    try:
        accounts = client.connected_accounts.list(user_ids=[user_id]) if user_id else client.connected_accounts.list()
        items = getattr(accounts, "items", None) or accounts or []
        for acc in items:
            connected.append({
                "id": getattr(acc, "id", None),
                "toolkit": getattr(acc, "toolkit_slug", None) or getattr(acc, "toolkit", None),
                "status": getattr(acc, "status", None),
                "user_id": getattr(acc, "user_id", None),
            })
    except Exception as exc:
        logger.exception("Composio connected_accounts.list failed")
        error = str(exc)
    return {"configured": True, "user_id": user_id, "connected": connected, "error": error}


async def _infra_status() -> dict[str, Any]:
    out: dict[str, Any] = {}
    # Postgres
    try:
        from core.db import engine
        async with engine.connect() as c:
            await c.execute_options(no_parameters=True)
        out["postgres"] = {"ok": True}
    except Exception as exc:
        out["postgres"] = {"ok": False, "error": str(exc)}
    # Neo4j
    try:
        from core.clients.neo4j import get_neo4j
        n = get_neo4j()
        out["neo4j"] = {"ok": bool(getattr(n, "_driver", None))}
    except Exception as exc:
        out["neo4j"] = {"ok": False, "error": str(exc)}
    # OpenSearch
    try:
        from core.clients.opensearch import get_opensearch
        c = get_opensearch()
        out["opensearch"] = {"ok": bool(getattr(c, "_client", None))}
    except Exception as exc:
        out["opensearch"] = {"ok": False, "error": str(exc)}
    return out


@router.get("/status")
async def status():
    creds = get_oauth_credentials_service()
    return {
        "oauth": await creds.list_all(),
        "composio": await _composio_status(),
        "llm": {
            "effective": await _llm_effective(),
            "providers_configured": _llm_env_status(),
        },
        "native_tools": NATIVE_TOOLS,
        "agents": REGISTERED_AGENTS,
        "infra": await _infra_status(),
    }


@router.get("/oauth")
async def oauth_list():
    return {"connections": await get_oauth_credentials_service().list_all()}


@router.delete("/oauth/{provider}")
async def oauth_disconnect(provider: str):
    ok = await get_oauth_credentials_service().delete(provider)
    if not ok:
        raise HTTPException(status_code=404, detail={"code": "not_connected", "provider": provider})
    return {"status": "disconnected", "provider": provider}


@router.get("/composio")
async def composio_list():
    return await _composio_status()


@router.post("/composio/connect/{toolkit}")
async def composio_connect(toolkit: str):
    client, user_id = _composio_client()
    if client is None:
        raise HTTPException(status_code=400, detail={"code": "composio_not_configured"})
    if not user_id:
        raise HTTPException(status_code=400, detail={"code": "composio_user_id_missing"})
    try:
        result = client.toolkits.authorize(user_id=user_id, toolkit=toolkit)
        redirect_url = getattr(result, "redirect_url", None) or getattr(result, "url", None) or str(result)
        return {"toolkit": toolkit, "redirect_url": redirect_url}
    except Exception as exc:
        logger.exception("Composio toolkits.authorize failed")
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/composio/{connected_account_id}")
async def composio_disconnect(connected_account_id: str):
    client, _ = _composio_client()
    if client is None:
        raise HTTPException(status_code=400, detail={"code": "composio_not_configured"})
    try:
        client.connected_accounts.delete(connected_account_id)
        return {"status": "disconnected", "id": connected_account_id}
    except Exception as exc:
        logger.exception("Composio connected_accounts.delete failed")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/llm/model")
async def llm_get():
    return {
        "effective": await _llm_effective(),
        "providers_configured": _llm_env_status(),
        "env_default": _llm_default_from_env(),
    }


@router.put("/llm/model")
async def llm_set(payload: LLMOverride):
    if not payload.provider and not payload.model and payload.temperature is None:
        raise HTTPException(status_code=400, detail="At least one of provider/model/temperature is required")
    value = {k: v for k, v in payload.model_dump().items() if v is not None}
    state = AppStateService()
    existing = await state.get_setting(LLM_SETTING_KEY) or {}
    merged = {**existing, **value}
    await state.set_setting(LLM_SETTING_KEY, merged)
    return {"effective": await _llm_effective()}


@router.delete("/llm/model")
async def llm_clear():
    state = AppStateService()
    await state.delete_setting(LLM_SETTING_KEY)
    return {"effective": await _llm_effective()}


@router.get("/llm/providers")
async def llm_providers():
    return _llm_env_status()


@router.get("/agents")
async def agents_list():
    return {"agents": REGISTERED_AGENTS}


@router.get("/native")
async def native_tools_list():
    return {"tools": NATIVE_TOOLS}


@router.get("/infra")
async def infra():
    return await _infra_status()
