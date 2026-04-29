"""Encrypted secret storage on top of AppSetting.

Layout in AppSetting (user_id="default"):
  key="secrets.{name}"          value={"value": <encrypted>, "updated_at": ...}
  key="oauth_clients.{provider}" value={"client_id": <enc>, "client_secret": <enc>, ...}
  key="pyjiit.credentials"      value={"username": <enc>, "password": <enc>}
  key="composio.config"         value={"api_key": <enc>, "user_id": <enc>}

Plaintext values never leave this module — callers receive resolved values via
`resolve()` (used internally by services) or masked values via `*_public()`.
"""

from __future__ import annotations

import os
from typing import Any, Optional

from core import get_logger
from core.config import get_settings
from core.crypto import CryptoNotConfigured, decrypt, encrypt
from services.app_state import AppStateService

logger = get_logger(__name__)


# Map external "key names" → (AppSetting key, env var, settings attr).
# settings attr lets us fall back to pydantic-resolved env value (which may
# include defaults like google_oauth_client_id).
SECRET_REGISTRY: dict[str, tuple[str, str, str | None]] = {
    "google_api_key":      ("secrets.google_api_key",      "GOOGLE_API_KEY",      "google_api_key"),
    "openai_api_key":      ("secrets.openai_api_key",      "OPENAI_API_KEY",      "openai_api_key"),
    "anthropic_api_key":   ("secrets.anthropic_api_key",   "ANTHROPIC_API_KEY",   "anthropic_api_key"),
    "deepseek_api_key":    ("secrets.deepseek_api_key",    "DEEPSEEK_API_KEY",    "deepseek_api_key"),
    "openrouter_api_key":  ("secrets.openrouter_api_key",  "OPENROUTER_API_KEY",  "openrouter_api_key"),
    "tavily_api_key":      ("secrets.tavily_api_key",      "TAVILY_API_KEY",      "tavily_api_key"),
    "ollama_base_url":     ("secrets.ollama_base_url",     "OLLAMA_BASE_URL",     "ollama_base_url"),
}


def mask(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) <= 8:
        return "•" * len(value)
    return f"{value[:3]}•••••{value[-4:]}"


class SecretsService:
    """Read/write encrypted secrets in AppSetting; resolve with env fallback."""

    def __init__(self):
        self._state = AppStateService()

    # ── individual named secrets (LLM keys etc.) ────────────────────────────
    async def get_raw(self, name: str) -> str | None:
        if name not in SECRET_REGISTRY:
            return None
        key, _, _ = SECRET_REGISTRY[name]
        row = await self._state.get_setting(key)
        if not row:
            return None
        enc = row.get("value")
        if not enc:
            return None
        try:
            return decrypt(enc)
        except CryptoNotConfigured:
            logger.warning("Cannot decrypt %s: encryption key not configured", name)
            return None
        except Exception:
            logger.exception("Failed to decrypt secret %s", name)
            return None

    async def set(self, name: str, value: str) -> None:
        if name not in SECRET_REGISTRY:
            raise ValueError(f"unknown secret: {name}")
        key, _, _ = SECRET_REGISTRY[name]
        await self._state.set_setting(key, {"value": encrypt(value)})

    async def clear(self, name: str) -> None:
        if name not in SECRET_REGISTRY:
            raise ValueError(f"unknown secret: {name}")
        key, _, _ = SECRET_REGISTRY[name]
        await self._state.delete_setting(key)

    async def resolve(self, name: str) -> str:
        """DB override → env var → settings attr → ''. Never raises."""
        if name not in SECRET_REGISTRY:
            return ""
        db_val = await self.get_raw(name)
        if db_val:
            return db_val
        _, env_name, attr = SECRET_REGISTRY[name]
        env_val = os.environ.get(env_name)
        if env_val:
            return env_val
        if attr:
            return getattr(get_settings(), attr, "") or ""
        return ""

    def resolve_sync(self, name: str) -> str:
        """Sync resolve — falls back to env/settings only (no DB).
        Useful in non-async hot paths; DB-stored overrides require async."""
        if name not in SECRET_REGISTRY:
            return ""
        _, env_name, attr = SECRET_REGISTRY[name]
        env_val = os.environ.get(env_name)
        if env_val:
            return env_val
        if attr:
            return getattr(get_settings(), attr, "") or ""
        return ""

    async def list_status(self) -> list[dict[str, Any]]:
        """For UI: which secrets are set, where, and a masked preview."""
        out: list[dict[str, Any]] = []
        for name, (key, env_name, attr) in SECRET_REGISTRY.items():
            row = await self._state.get_setting(key)
            db_set = bool(row and row.get("value"))
            db_preview: str | None = None
            if db_set:
                try:
                    db_preview = mask(decrypt(row["value"]))
                except Exception:
                    db_preview = "•••"
            env_val = os.environ.get(env_name) or (getattr(get_settings(), attr, "") if attr else "")
            out.append({
                "name": name,
                "env_var": env_name,
                "db_set": db_set,
                "env_set": bool(env_val),
                "source": "db" if db_set else ("env" if env_val else "unset"),
                "masked": db_preview or (mask(env_val) if env_val else None),
            })
        return out

    # ── OAuth client credentials ────────────────────────────────────────────
    async def get_oauth_client(self, provider: str) -> dict[str, str]:
        """Returns {client_id, client_secret, ...} with env fallback."""
        provider = provider.lower()
        row = await self._state.get_setting(f"oauth_clients.{provider}") or {}
        out: dict[str, str] = {}
        for field in ("client_id", "client_secret"):
            enc = row.get(field)
            if enc:
                try:
                    out[field] = decrypt(enc)
                except Exception:
                    logger.exception("decrypt oauth_clients.%s.%s failed", provider, field)
        # env fallbacks
        s = get_settings()
        if provider == "google":
            out.setdefault("client_id", s.google_oauth_client_id)
            out.setdefault("client_secret", s.google_client_secret or os.environ.get("GOOGLE_CLIENT_SECRET", ""))
        elif provider == "github":
            out.setdefault("client_id", s.github_client_id or os.environ.get("GITHUB_CLIENT_ID", ""))
            out.setdefault("client_secret", s.github_client_secret or os.environ.get("GITHUB_CLIENT_SECRET", ""))
        return out

    async def set_oauth_client(
        self, provider: str, *, client_id: Optional[str] = None, client_secret: Optional[str] = None
    ) -> None:
        provider = provider.lower()
        key = f"oauth_clients.{provider}"
        existing = await self._state.get_setting(key) or {}
        merged = dict(existing)
        if client_id is not None:
            merged["client_id"] = encrypt(client_id) if client_id else ""
        if client_secret is not None:
            merged["client_secret"] = encrypt(client_secret) if client_secret else ""
        await self._state.set_setting(key, merged)

    async def clear_oauth_client(self, provider: str) -> None:
        await self._state.delete_setting(f"oauth_clients.{provider.lower()}")

    async def list_oauth_clients(self) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for provider in ("google", "github"):
            resolved = await self.get_oauth_client(provider)
            row = await self._state.get_setting(f"oauth_clients.{provider}") or {}
            out.append({
                "provider": provider,
                "client_id_masked": mask(resolved.get("client_id")),
                "client_secret_masked": mask(resolved.get("client_secret")),
                "client_id_source": "db" if row.get("client_id") else ("env" if resolved.get("client_id") else "unset"),
                "client_secret_source": "db" if row.get("client_secret") else ("env" if resolved.get("client_secret") else "unset"),
            })
        return out

    # ── Composio ───────────────────────────────────────────────────────────
    async def get_composio(self) -> dict[str, str]:
        row = await self._state.get_setting("composio.config") or {}
        out: dict[str, str] = {}
        for f in ("api_key", "user_id"):
            enc = row.get(f)
            if enc:
                try:
                    out[f] = decrypt(enc)
                except Exception:
                    logger.exception("decrypt composio.%s failed", f)
        s = get_settings()
        out.setdefault("api_key", s.composio_api_key)
        out.setdefault("user_id", s.composio_user_id)
        return out

    async def set_composio(self, *, api_key: Optional[str] = None, user_id: Optional[str] = None) -> None:
        existing = await self._state.get_setting("composio.config") or {}
        merged = dict(existing)
        if api_key is not None:
            merged["api_key"] = encrypt(api_key) if api_key else ""
        if user_id is not None:
            merged["user_id"] = encrypt(user_id) if user_id else ""
        await self._state.set_setting("composio.config", merged)

    async def clear_composio(self) -> None:
        await self._state.delete_setting("composio.config")

    async def composio_public(self) -> dict[str, Any]:
        resolved = await self.get_composio()
        row = await self._state.get_setting("composio.config") or {}
        return {
            "api_key_masked": mask(resolved.get("api_key")),
            "user_id": resolved.get("user_id") or None,
            "api_key_source": "db" if row.get("api_key") else ("env" if resolved.get("api_key") else "unset"),
            "user_id_source": "db" if row.get("user_id") else ("env" if resolved.get("user_id") else "unset"),
        }

    # ── PyJIIT ─────────────────────────────────────────────────────────────
    async def get_pyjiit(self) -> dict[str, str]:
        row = await self._state.get_setting("pyjiit.credentials") or {}
        out: dict[str, str] = {}
        for f in ("username", "password"):
            enc = row.get(f)
            if enc:
                try:
                    out[f] = decrypt(enc)
                except Exception:
                    logger.exception("decrypt pyjiit.%s failed", f)
        return out

    async def set_pyjiit(self, *, username: Optional[str] = None, password: Optional[str] = None) -> None:
        existing = await self._state.get_setting("pyjiit.credentials") or {}
        merged = dict(existing)
        if username is not None:
            merged["username"] = encrypt(username) if username else ""
        if password is not None:
            merged["password"] = encrypt(password) if password else ""
        await self._state.set_setting("pyjiit.credentials", merged)

    async def clear_pyjiit(self) -> None:
        await self._state.delete_setting("pyjiit.credentials")

    async def pyjiit_public(self) -> dict[str, Any]:
        creds = await self.get_pyjiit()
        return {
            "username": creds.get("username") or None,
            "password_masked": mask(creds.get("password")),
            "configured": bool(creds.get("username") and creds.get("password")),
        }


_singleton: SecretsService | None = None


def get_secrets_service() -> SecretsService:
    global _singleton
    if _singleton is None:
        _singleton = SecretsService()
    return _singleton
