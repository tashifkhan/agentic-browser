from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import requests
from sqlalchemy import select

from core import get_logger
from core.config import get_settings
from core.crypto import decrypt, encrypt
from core.db import get_session
from models.db.app import BrowserCredential, utcnow

logger = get_logger(__name__)

GOOGLE_PROVIDERS = {"google", "gmail", "calendar", "youtube", "google-search"}
GITHUB_PROVIDERS = {"github"}

# Map sub-provider keys to the canonical OAuth provider that owns the token.
# Gmail/Calendar/YouTube/Google-Search all share one Google credential row.
PROVIDER_ALIASES = {
    "gmail": "google",
    "calendar": "google",
    "youtube": "google",
    "google-search": "google",
}


class NeedsReauth(RuntimeError):
    def __init__(self, provider: str, reason: str = "needs_reauth"):
        super().__init__(f"{provider}: {reason}")
        self.provider = provider
        self.reason = reason


class OAuthCredentialsService:
    """Persist OAuth tokens (encrypted) in browser_credentials and refresh on use."""

    DEFAULT_USER = "default"

    @staticmethod
    def _canon(provider: str) -> str:
        return PROVIDER_ALIASES.get(provider.lower(), provider.lower())

    async def store(
        self,
        provider: str,
        *,
        access_token: str,
        refresh_token: Optional[str],
        expires_in: Optional[int],
        scopes: Optional[list[str]] = None,
        account_email: Optional[str] = None,
        user_id: str = DEFAULT_USER,
    ) -> dict[str, Any]:
        provider = self._canon(provider)
        expires_at = (
            (utcnow() + timedelta(seconds=int(expires_in))).isoformat()
            if expires_in
            else None
        )
        payload = {
            "access_token": encrypt(access_token),
            "refresh_token": encrypt(refresh_token) if refresh_token else "",
            "expires_at": expires_at,
            "scopes": scopes or [],
            "account_email": account_email,
            "status": "active",
            "last_refreshed_at": utcnow().isoformat(),
        }

        async with get_session() as session:
            stmt = select(BrowserCredential).where(
                BrowserCredential.user_id == user_id,
                BrowserCredential.provider == provider,
            )
            result = await session.execute(stmt)
            row = result.scalar_one_or_none()
            if row:
                # Preserve existing refresh_token if a new one wasn't issued (Google's behavior).
                if not refresh_token and row.payload.get("refresh_token"):
                    payload["refresh_token"] = row.payload["refresh_token"]
                row.payload = payload
                row.account_label = account_email
                row.updated_at = utcnow()
            else:
                row = BrowserCredential(
                    user_id=user_id,
                    provider=provider,
                    account_label=account_email,
                    payload=payload,
                )
                session.add(row)
        return self._public(row)

    async def status(self, provider: str, *, user_id: str = DEFAULT_USER) -> dict[str, Any] | None:
        provider = self._canon(provider)
        async with get_session() as session:
            stmt = select(BrowserCredential).where(
                BrowserCredential.user_id == user_id,
                BrowserCredential.provider == provider,
            )
            row = (await session.execute(stmt)).scalar_one_or_none()
            return self._public(row) if row else None

    async def list_all(self, *, user_id: str = DEFAULT_USER) -> list[dict[str, Any]]:
        async with get_session() as session:
            stmt = select(BrowserCredential).where(BrowserCredential.user_id == user_id)
            rows = (await session.execute(stmt)).scalars().all()
            return [self._public(r) for r in rows]

    async def delete(self, provider: str, *, user_id: str = DEFAULT_USER) -> bool:
        provider = self._canon(provider)
        async with get_session() as session:
            stmt = select(BrowserCredential).where(
                BrowserCredential.user_id == user_id,
                BrowserCredential.provider == provider,
            )
            row = (await session.execute(stmt)).scalar_one_or_none()
            if not row:
                return False
            await session.delete(row)
            return True

    async def get_access_token(self, provider: str, *, user_id: str = DEFAULT_USER) -> str:
        """Return a valid access token, refreshing if needed. Raises NeedsReauth on failure."""
        provider = self._canon(provider)
        async with get_session() as session:
            stmt = select(BrowserCredential).where(
                BrowserCredential.user_id == user_id,
                BrowserCredential.provider == provider,
            )
            row = (await session.execute(stmt)).scalar_one_or_none()
            if not row:
                raise NeedsReauth(provider, "not_connected")
            if row.payload.get("status") == "needs_reauth":
                raise NeedsReauth(provider)

            if not self._is_expired(row.payload):
                return decrypt(row.payload["access_token"])

            # Refresh
            if provider == "google":
                new_payload = self._refresh_google(row.payload)
            elif provider == "github":
                # GitHub OAuth tokens don't expire by default; treat as fine.
                return decrypt(row.payload["access_token"])
            else:
                return decrypt(row.payload["access_token"])

            if not new_payload:
                row.payload = {**row.payload, "status": "needs_reauth"}
                row.updated_at = utcnow()
                raise NeedsReauth(provider)

            row.payload = new_payload
            row.updated_at = utcnow()
            return decrypt(new_payload["access_token"])

    @staticmethod
    def _is_expired(payload: dict[str, Any]) -> bool:
        exp = payload.get("expires_at")
        if not exp:
            return False
        try:
            dt = datetime.fromisoformat(exp)
        except ValueError:
            return True
        return dt <= datetime.now(timezone.utc) + timedelta(seconds=60)

    @staticmethod
    def _refresh_google(payload: dict[str, Any]) -> dict[str, Any] | None:
        settings = get_settings()
        if not settings.google_client_secret:
            logger.error("Cannot refresh Google token: GOOGLE_CLIENT_SECRET not set")
            return None
        rt_enc = payload.get("refresh_token")
        if not rt_enc:
            return None
        try:
            refresh_token = decrypt(rt_enc)
        except Exception:
            logger.exception("Failed to decrypt stored refresh_token")
            return None
        try:
            resp = requests.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "refresh_token": refresh_token,
                    "client_id": settings.google_oauth_client_id,
                    "client_secret": settings.google_client_secret,
                    "grant_type": "refresh_token",
                },
                timeout=10,
            )
        except Exception:
            logger.exception("Google token refresh request failed")
            return None
        if resp.status_code != 200:
            logger.warning("Google token refresh failed: %s %s", resp.status_code, resp.text[:200])
            return None
        data = resp.json()
        new_access = data.get("access_token")
        if not new_access:
            return None
        new_expires_in = data.get("expires_in")
        new_payload = dict(payload)
        new_payload["access_token"] = encrypt(new_access)
        new_payload["expires_at"] = (
            (utcnow() + timedelta(seconds=int(new_expires_in))).isoformat()
            if new_expires_in
            else None
        )
        new_payload["last_refreshed_at"] = utcnow().isoformat()
        new_payload["status"] = "active"
        # Google sometimes returns a new refresh_token on rotation.
        if data.get("refresh_token"):
            new_payload["refresh_token"] = encrypt(data["refresh_token"])
        return new_payload

    @staticmethod
    def _public(row: BrowserCredential | None) -> dict[str, Any] | None:
        if row is None:
            return None
        p = row.payload or {}
        return {
            "provider": row.provider,
            "account_email": p.get("account_email") or row.account_label,
            "status": p.get("status", "active"),
            "scopes": p.get("scopes", []),
            "expires_at": p.get("expires_at"),
            "last_refreshed_at": p.get("last_refreshed_at"),
            "connected_at": row.created_at.isoformat() if row.created_at else None,
        }


async def resolve_google_token_optional() -> str | None:
    """Best-effort token lookup. Returns None if not connected or refresh failed.
    For agent flows that may or may not actually need Google."""
    try:
        return await get_oauth_credentials_service().get_access_token("google")
    except NeedsReauth:
        return None
    except Exception:
        logger.exception("Unexpected error resolving Google token")
        return None


_singleton: OAuthCredentialsService | None = None


def get_oauth_credentials_service() -> OAuthCredentialsService:
    global _singleton
    if _singleton is None:
        _singleton = OAuthCredentialsService()
    return _singleton
