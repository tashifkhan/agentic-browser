from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core import get_logger
from core.config import get_settings
from services.composio_service import (
    CURATED_TOOLKITS,
    ComposioNeedsAuthConfigError,
    ComposioNotConfigured,
    authorize_toolkit,
    disconnect_connection,
    list_connected_accounts,
    list_tools_for_toolkit,
    list_toolkits_view,
    rename_connection,
)
from services.app_state import AppStateService
from services.oauth_credentials_service import get_oauth_credentials_service
from services.secrets_service import SECRET_REGISTRY, get_secrets_service

router = APIRouter()
logger = get_logger(__name__)

LLM_SETTING_KEY = "llm.default"

NATIVE_TOOLS = [
    {
        "id": "pyjiit",
        "label": "PyJIIT",
        "auth": "username/password (per-request)",
    },
    {
        "id": "skills",
        "label": "Skills",
        "auth": "none (local)",
    },
    {
        "id": "voice",
        "label": "Voice (Whisper)",
        "auth": "none (local)",
    },
    {
        "id": "browser-use",
        "label": "Browser-use",
        "auth": "none (extension)",
    },
    {
        "id": "website",
        "label": "Website scraper",
        "auth": "none",
    },
    {
        "id": "google-search",
        "label": "Google Search",
        "auth": "API key (server)",
    },
    {
        "id": "github-crawler",
        "label": "GitHub Crawler",
        "auth": "public web",
    },
]

REGISTERED_AGENTS = [
    {
        "id": "react_agent",
        "label": "ReAct Agent",
        "module": "agents.react_agent",
    },
    {
        "id": "while_loop_harness",
        "label": "While-Loop Harness",
        "module": "agents.while_loop_harness",
    },
    {
        "id": "browser_use",
        "label": "Browser-Use Agent",
        "module": "services.browser_use_service",
    },
]


class LLMOverride(BaseModel):
    provider: Optional[str] = None
    model: Optional[str] = None
    temperature: Optional[float] = None


async def _llm_env_status() -> dict[str, bool]:
    """Provider configured if either env or DB secret has a value."""
    sec = get_secrets_service()
    out: dict[str, bool] = {}
    for provider, secret_name in (
        ("google", "google_api_key"),
        ("openai", "openai_api_key"),
        ("anthropic", "anthropic_api_key"),
        ("deepseek", "deepseek_api_key"),
        ("openrouter", "openrouter_api_key"),
        ("ollama", "ollama_base_url"),
    ):
        out[provider] = bool(await sec.resolve(secret_name))
    return out


def _llm_default_from_env() -> dict[str, Any]:
    """Resolve provider/model/temperature from settings; fall back to the
    provider's default_model when the user didn't pin one in env."""
    from core.llm import PROVIDER_CONFIGS

    s = get_settings()
    provider = (s.default_llm_provider or "google").lower()
    cfg = PROVIDER_CONFIGS.get(provider) or PROVIDER_CONFIGS["google"]
    model = s.default_llm_model or cfg.get("default_model") or ""
    return {
        "provider": provider,
        "model": model,
        "temperature": s.default_llm_temperature,
        "source": "env",
    }


async def _llm_effective() -> dict[str, Any]:
    state = AppStateService()
    override = await state.get_setting(LLM_SETTING_KEY)
    base = _llm_default_from_env()
    if override:
        return {
            **base,
            **override,
            "source": "db",
        }
    return base


async def _composio_status() -> dict[str, Any]:
    try:
        sec = get_secrets_service()
        cfg = await sec.get_composio()
        api_key = cfg.get("api_key")
        user_id = cfg.get("user_id") or None
        if not api_key:
            return {
                "configured": False,
                "user_id": None,
                "connected": [],
                "toolkits": [],
                "catalog_count": len(CURATED_TOOLKITS),
                "error": None,
            }
        connected = await list_connected_accounts()
        toolkits = await list_toolkits_view()
        return {
            "configured": True,
            "user_id": user_id,
            "connected": connected,
            "toolkits": toolkits,
            "catalog_count": len(toolkits),
            "error": None,
        }
    except ComposioNotConfigured:
        return {
            "configured": False,
            "user_id": None,
            "connected": [],
            "toolkits": [],
            "catalog_count": len(CURATED_TOOLKITS),
            "error": None,
        }
    except Exception as exc:
        error_message = str(exc)
        if "Invalid API key" in error_message:
            logger.warning("Composio API key rejected by upstream API")
            error_message = "Invalid Composio API key. Use the Project API key from https://platform.composio.dev/settings, not the Sessions/MCP key from dashboard.composio.dev."
        else:
            logger.exception("Composio connected_accounts.list failed")
        sec = get_secrets_service()
        cfg = await sec.get_composio()
        return {
            "configured": bool(cfg.get("api_key")),
            "user_id": cfg.get("user_id") or None,
            "connected": [],
            "toolkits": [],
            "catalog_count": len(CURATED_TOOLKITS),
            "error": error_message,
        }


async def _llm_secrets() -> list[dict[str, Any]]:
    llm_secret_names = {
        "google_api_key",
        "openai_api_key",
        "anthropic_api_key",
        "deepseek_api_key",
        "openrouter_api_key",
        "ollama_base_url",
    }
    return [item for item in await get_secrets_service().list_status() if item["name"] in llm_secret_names]


async def _infra_status() -> dict[str, Any]:
    out: dict[str, Any] = {}
    # Postgres
    try:
        from sqlalchemy import text

        from core.db import engine

        async with engine.connect() as c:
            await c.execute(text("SELECT 1"))
        out["postgres"] = {"ok": True}
    except Exception as exc:
        out["postgres"] = {
            "ok": False,
            "error": str(exc),
        }
    # Neo4j
    try:
        from core.clients.neo4j import get_neo4j

        n = get_neo4j()
        out["neo4j"] = {
            "ok": bool(getattr(n, "_driver", None)),
        }
    except Exception as exc:
        out["neo4j"] = {
            "ok": False,
            "error": str(exc),
        }
    # OpenSearch
    try:
        from core.clients.opensearch import get_opensearch

        c = get_opensearch()
        out["opensearch"] = {
            "ok": bool(getattr(c, "_client", None)),
        }
    except Exception as exc:
        out["opensearch"] = {
            "ok": False,
            "error": str(exc),
        }
    return out


@router.get("/status")
async def status():
    sec = get_secrets_service()
    return {
        "composio": await _composio_status(),
        "composio_config": await sec.composio_public(),
        "llm": {
            "effective": await _llm_effective(),
            "providers_configured": await _llm_env_status(),
            "secrets": await _llm_secrets(),
        },
        "search": await sec.search_public(),
        "pyjiit": await sec.pyjiit_public(),
        "native_tools": NATIVE_TOOLS,
        "agents": REGISTERED_AGENTS,
        "infra": await _infra_status(),
    }


@router.get("/oauth")
async def oauth_list():
    return {
        "connections": await get_oauth_credentials_service().list_all(),
    }


@router.delete("/oauth/{provider}")
async def oauth_disconnect(provider: str):
    ok = await get_oauth_credentials_service().delete(provider)
    if not ok:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "not_connected",
                "provider": provider,
            },
        )
    return {
        "status": "disconnected",
        "provider": provider,
    }


@router.get("/composio")
async def composio_list():
    return await _composio_status()


@router.get("/composio/toolkits")
async def composio_toolkits():
    return {"toolkits": await list_toolkits_view(),}


@router.get("/composio/toolkits/{toolkit}/tools")
async def composio_toolkit_tools(toolkit: str):
    return {"tools": await list_tools_for_toolkit(toolkit),}


@router.post("/composio/connect/{toolkit}")
async def composio_connect(toolkit: str):
    try:
        return await authorize_toolkit(toolkit)
    except ComposioNeedsAuthConfigError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "composio_auth_config_required",
                "toolkit": exc.toolkit,
                "message": str(exc),
                "setup_url": "https://dashboard.composio.dev",
            },
        )
    except ComposioNotConfigured as exc:
        raise HTTPException(status_code=400, detail={"code": "composio_not_configured", "message": str(exc)})
    except Exception as exc:
        logger.exception("Composio authorize failed")
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/composio/{connected_account_id}")
async def composio_disconnect(connected_account_id: str):
    try:
        await disconnect_connection(connected_account_id)
        return {
            "status": "disconnected",
            "id": connected_account_id,
        }
    except ComposioNotConfigured as exc:
        raise HTTPException(status_code=400, detail={"code": "composio_not_configured", "message": str(exc)})
    except Exception as exc:
        logger.exception("Composio connected_accounts.delete failed")
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        )


class ComposioRenamePayload(BaseModel):
    alias: str


@router.post("/composio/connections/{connected_account_id}/rename")
async def composio_rename(connected_account_id: str, payload: ComposioRenamePayload):
    alias = payload.alias.strip()
    if not alias:
        raise HTTPException(status_code=400, detail="alias is required")
    try:
        await rename_connection(connected_account_id, alias)
        return {"status": "ok", "id": connected_account_id, "alias": alias}
    except ComposioNotConfigured as exc:
        raise HTTPException(status_code=400, detail={"code": "composio_not_configured", "message": str(exc)})
    except Exception as exc:
        logger.exception("Composio connected_accounts.update failed")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/llm/model")
async def llm_get():
    return {
        "effective": await _llm_effective(),
        "providers_configured": await _llm_env_status(),
        "env_default": _llm_default_from_env(),
    }


@router.put("/llm/model")
async def llm_set(payload: LLMOverride):
    if not payload.provider and not payload.model and payload.temperature is None:
        raise HTTPException(
            status_code=400,
            detail="At least one of provider/model/temperature is required",
        )
    value = {k: v for k, v in payload.model_dump().items() if v is not None}
    state = AppStateService()
    existing = await state.get_setting(LLM_SETTING_KEY) or {}
    merged = {**existing, **value}
    await state.set_setting(LLM_SETTING_KEY, merged)
    try:
        from core.llm import reload_default_llm

        await reload_default_llm()
    except Exception:
        logger.exception("Failed to reload default LLM after override")
    return {
        "effective": await _llm_effective(),
    }


@router.delete("/llm/model")
async def llm_clear():
    state = AppStateService()
    await state.delete_setting(LLM_SETTING_KEY)
    try:
        from core.llm import reload_default_llm

        await reload_default_llm()
    except Exception:
        logger.exception("Failed to reload default LLM after clear")
    return {
        "effective": await _llm_effective(),
    }


@router.get("/llm/providers")
async def llm_providers():
    return await _llm_env_status()


@router.get("/agents")
async def agents_list():
    return {
        "agents": REGISTERED_AGENTS,
    }


@router.get("/native")
async def native_tools_list():
    return {
        "tools": NATIVE_TOOLS,
    }


@router.get("/infra")
async def infra():
    return await _infra_status()


# ── Editable secrets (LLM provider keys, ollama base url) ─────────────────────


class SecretValue(BaseModel):
    value: str


@router.get("/secrets")
async def secrets_list():
    return {"secrets": await get_secrets_service().list_status()}


@router.put("/secrets/{name}")
async def secrets_set(name: str, payload: SecretValue):
    if name not in SECRET_REGISTRY:
        raise HTTPException(
            status_code=404, detail={"code": "unknown_secret", "name": name}
        )
    if not payload.value:
        raise HTTPException(status_code=400, detail="value is required")
    await get_secrets_service().set(name, payload.value)
    # Reload default LLM in case the active provider key changed.
    try:
        from core.llm import reload_default_llm

        await reload_default_llm()
    except Exception:
        logger.exception("Failed to reload default LLM after secret change")
    return {
        "status": "ok",
        "name": name,
    }


@router.delete("/secrets/{name}")
async def secrets_clear(name: str):
    if name not in SECRET_REGISTRY:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "unknown_secret",
                "name": name,
            },
        )
    await get_secrets_service().clear(name)
    try:
        from core.llm import reload_default_llm

        await reload_default_llm()
    except Exception:
        logger.exception("Failed to reload default LLM after secret clear")
    return {
        "status": "ok",
        "name": name,
    }


# ── OAuth client (client_id / client_secret) ──────────────────────────────────


class OAuthClientPayload(BaseModel):
    client_id: Optional[str] = None
    client_secret: Optional[str] = None


@router.get("/oauth-clients")
async def oauth_clients_list():
    return {"clients": await get_secrets_service().list_oauth_clients()}


@router.put("/oauth-clients/{provider}")
async def oauth_clients_set(provider: str, payload: OAuthClientPayload):
    if provider not in {"google", "github"}:
        raise HTTPException(
            status_code=404, detail={"code": "unknown_provider", "provider": provider}
        )
    if payload.client_id is None and payload.client_secret is None:
        raise HTTPException(
            status_code=400, detail="client_id and/or client_secret required"
        )
    await get_secrets_service().set_oauth_client(
        provider,
        client_id=payload.client_id,
        client_secret=payload.client_secret,
    )
    return {
        "status": "ok",
        "provider": provider,
    }


@router.delete("/oauth-clients/{provider}")
async def oauth_clients_clear(provider: str):
    if provider not in {"google", "github"}:
        raise HTTPException(
            status_code=404, detail={"code": "unknown_provider", "provider": provider}
        )
    await get_secrets_service().clear_oauth_client(provider)
    return {
        "status": "ok",
        "provider": provider,
    }


# ── Composio config ───────────────────────────────────────────────────────────


class ComposioConfigPayload(BaseModel):
    api_key: Optional[str] = None
    user_id: Optional[str] = None


@router.get("/composio-config")
async def composio_config_get():
    return await get_secrets_service().composio_public()


@router.put("/composio-config")
async def composio_config_set(payload: ComposioConfigPayload):
    if payload.api_key is None and payload.user_id is None:
        raise HTTPException(status_code=400, detail="api_key and/or user_id required")
    await get_secrets_service().set_composio(
        api_key=payload.api_key, user_id=payload.user_id
    )
    return {"status": "ok"}


@router.delete("/composio-config")
async def composio_config_clear():
    await get_secrets_service().clear_composio()
    return {"status": "ok"}


# ── PyJIIT credentials ────────────────────────────────────────────────────────


class PyJIITPayload(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None


@router.get("/pyjiit")
async def pyjiit_get():
    return await get_secrets_service().pyjiit_public()


@router.put("/pyjiit")
async def pyjiit_set(payload: PyJIITPayload):
    if payload.username is None and payload.password is None:
        raise HTTPException(status_code=400, detail="username and/or password required")
    await get_secrets_service().set_pyjiit(
        username=payload.username, password=payload.password
    )
    return {
        "status": "ok",
    }


@router.delete("/pyjiit")
async def pyjiit_clear():
    await get_secrets_service().clear_pyjiit()
    return {
        "status": "ok",
    }
