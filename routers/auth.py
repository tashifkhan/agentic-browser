from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.auth_service import AuthService
from services.oauth_credentials_service import get_oauth_credentials_service

router = APIRouter()
auth_service = AuthService()
creds = get_oauth_credentials_service()


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
