from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from core import get_logger
from services.auth_service import AuthService
from services.oauth_credentials_service import get_oauth_credentials_service
from services.secrets_service import get_secrets_service

router = APIRouter()
logger = get_logger(__name__)
auth_service = AuthService()
creds = get_oauth_credentials_service()

GOOGLE_SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/youtube.readonly",
]
GITHUB_SCOPES = ["read:user", "user:email", "repo"]
DASHBOARD_SETTINGS = "/settings"


class GoogleExchangeRequest(BaseModel):
    code: str
    redirect_uri: str


class GoogleRefreshRequest(BaseModel):
    refresh_token: str


class GitHubExchangeRequest(BaseModel):
    code: str


@router.post("/exchange-code")
async def exchange_google_code(request: GoogleExchangeRequest):
    try:
        result = await auth_service.exchange_google_code(request.code, request.redirect_uri)
        if "error" in result:
            raise HTTPException(status_code=result.get("status_code", 400), detail=result)
        return result
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/refresh-token")
async def refresh_google_token(request: GoogleRefreshRequest):
    """Legacy endpoint — backend refreshes tokens automatically now. Kept for transition."""
    try:
        result = await auth_service.refresh_google_token(request.refresh_token)
        if "error" in result:
            raise HTTPException(status_code=result.get("status_code", 400), detail=result)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/github/exchange-code")
async def exchange_github_code(request: GitHubExchangeRequest):
    try:
        result = await auth_service.exchange_github_code(request.code)
        if "error" in result:
            raise HTTPException(status_code=result.get("status_code", 400), detail=result)
        return result
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def status():
    """Return all OAuth connections for the current (single) user."""
    return {"connections": await creds.list_all()}


@router.get("/status/{provider}")
async def status_provider(provider: str):
    info = await creds.status(provider)
    if not info:
        raise HTTPException(status_code=404, detail={"code": "not_connected", "provider": provider})
    return info


@router.delete("/connections/{provider}")
async def disconnect(provider: str):
    ok = await creds.delete(provider)
    if not ok:
        raise HTTPException(status_code=404, detail={"code": "not_connected", "provider": provider})
    return {"status": "disconnected", "provider": provider}


@router.get("/health")
async def health():
    return {"status": "ok", "message": "Auth service running"}


# ── Web-initiated OAuth flow (for the debug dashboard) ────────────────────────

def _redirect_uri(request: Request, provider: str) -> str:
    base = str(request.base_url).rstrip("/")
    return f"{base}/api/auth/{provider}/callback"


@router.get("/google/start")
async def google_start(request: Request):
    sec = get_secrets_service()
    client = await sec.get_oauth_client("google")
    client_id = client.get("client_id")
    if not client_id:
        raise HTTPException(status_code=400, detail="google client_id not configured")
    params = {
        "client_id": client_id,
        "redirect_uri": _redirect_uri(request, "google"),
        "response_type": "code",
        "scope": " ".join(GOOGLE_SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
    }
    return RedirectResponse(url=f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}")


@router.get("/google/callback")
async def google_callback(request: Request, code: str | None = None, error: str | None = None):
    if error or not code:
        return RedirectResponse(url=f"{DASHBOARD_SETTINGS}?oauth_error={error or 'missing_code'}")
    try:
        result = await auth_service.exchange_google_code(code, _redirect_uri(request, "google"))
        if "error" in result:
            return RedirectResponse(url=f"{DASHBOARD_SETTINGS}?oauth_error=exchange_failed")
    except Exception:
        logger.exception("Google OAuth callback failed")
        return RedirectResponse(url=f"{DASHBOARD_SETTINGS}?oauth_error=exception")
    return RedirectResponse(url=f"{DASHBOARD_SETTINGS}?oauth_connected=google")


@router.get("/github/start")
async def github_start(request: Request):
    sec = get_secrets_service()
    client = await sec.get_oauth_client("github")
    client_id = client.get("client_id")
    if not client_id:
        raise HTTPException(status_code=400, detail="github client_id not configured")
    params = {
        "client_id": client_id,
        "redirect_uri": _redirect_uri(request, "github"),
        "scope": " ".join(GITHUB_SCOPES),
    }
    return RedirectResponse(url=f"https://github.com/login/oauth/authorize?{urlencode(params)}")


@router.get("/github/callback")
async def github_callback(code: str | None = None, error: str | None = None):
    if error or not code:
        return RedirectResponse(url=f"{DASHBOARD_SETTINGS}?oauth_error={error or 'missing_code'}")
    try:
        result = await auth_service.exchange_github_code(code)
        if "error" in result:
            return RedirectResponse(url=f"{DASHBOARD_SETTINGS}?oauth_error=exchange_failed")
    except Exception:
        logger.exception("GitHub OAuth callback failed")
        return RedirectResponse(url=f"{DASHBOARD_SETTINGS}?oauth_error=exception")
    return RedirectResponse(url=f"{DASHBOARD_SETTINGS}?oauth_connected=github")
