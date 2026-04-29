from __future__ import annotations

from typing import Any, Dict

import requests
from dotenv import load_dotenv

from core import get_logger
from services.oauth_credentials_service import get_oauth_credentials_service

load_dotenv()
logger = get_logger(__name__)


class AuthService:
    def __init__(self):
        self.creds = get_oauth_credentials_service()

    async def _google_creds(self) -> tuple[str, str]:
        from services.secrets_service import get_secrets_service
        c = await get_secrets_service().get_oauth_client("google")
        return c.get("client_id", ""), c.get("client_secret", "")

    async def _github_creds(self) -> tuple[str, str]:
        from services.secrets_service import get_secrets_service
        c = await get_secrets_service().get_oauth_client("github")
        return c.get("client_id", ""), c.get("client_secret", "")

    async def exchange_google_code(self, code: str, redirect_uri: str) -> Dict[str, Any]:
        google_client_id, google_client_secret = await self._google_creds()
        if not google_client_secret:
            raise ValueError("GOOGLE_CLIENT_SECRET is not configured")

        resp = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": google_client_id,
                "client_secret": google_client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            timeout=10,
        )
        if resp.status_code != 200:
            details = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else resp.text
            return {"error": "Token exchange failed", "details": details, "status_code": resp.status_code}

        token_data = resp.json()
        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")
        expires_in = token_data.get("expires_in")
        scope_str = token_data.get("scope") or ""
        scopes = [s for s in scope_str.split(" ") if s]

        # Fetch profile so we can label the credential row.
        profile: dict[str, Any] = {}
        try:
            ui = requests.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=10,
            )
            if ui.status_code == 200:
                profile = ui.json()
        except Exception:
            logger.exception("Failed to fetch Google userinfo")

        await self.creds.store(
            "google",
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=expires_in,
            scopes=scopes,
            account_email=profile.get("email"),
        )

        return {
            "status": "ok",
            "provider": "google",
            "user": {
                "id": profile.get("id"),
                "email": profile.get("email"),
                "name": profile.get("name"),
                "picture": profile.get("picture"),
            },
        }

    async def refresh_google_token(self, refresh_token: str) -> Dict[str, Any]:
        # Legacy endpoint — kept for back-compat during migration. New flow refreshes server-side.
        google_client_id, google_client_secret = await self._google_creds()
        if not google_client_secret:
            raise ValueError("GOOGLE_CLIENT_SECRET is not configured")

        response = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "refresh_token": refresh_token,
                "client_id": google_client_id,
                "client_secret": google_client_secret,
                "grant_type": "refresh_token",
            },
            timeout=10,
        )
        if response.status_code != 200:
            return {"error": "Token refresh failed", "details": response.text, "status_code": response.status_code}
        return response.json()

    async def exchange_github_code(self, code: str) -> Dict[str, Any]:
        github_client_id, github_client_secret = await self._github_creds()
        if not github_client_id or not github_client_secret:
            raise ValueError("GitHub OAuth is not configured")

        resp = requests.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": github_client_id,
                "client_secret": github_client_secret,
                "code": code,
            },
            timeout=10,
        )
        if resp.status_code != 200:
            return {"error": "Token exchange failed", "details": resp.text, "status_code": resp.status_code}
        token_data = resp.json()
        if "error" in token_data:
            return {"error": token_data.get("error_description", "Token exchange failed")}

        access_token = token_data.get("access_token")
        scope_str = token_data.get("scope") or ""
        scopes = [s for s in scope_str.split(",") if s]

        profile: dict[str, Any] = {}
        try:
            ui = requests.get(
                "https://api.github.com/user",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github+json",
                },
                timeout=10,
            )
            if ui.status_code == 200:
                profile = ui.json()
        except Exception:
            logger.exception("Failed to fetch GitHub userinfo")

        await self.creds.store(
            "github",
            access_token=access_token,
            refresh_token=token_data.get("refresh_token"),
            expires_in=token_data.get("expires_in"),
            scopes=scopes,
            account_email=profile.get("email") or profile.get("login"),
        )

        return {
            "status": "ok",
            "provider": "github",
            "user": {
                "id": profile.get("id"),
                "login": profile.get("login"),
                "email": profile.get("email"),
                "name": profile.get("name"),
                "picture": profile.get("avatar_url"),
            },
        }
