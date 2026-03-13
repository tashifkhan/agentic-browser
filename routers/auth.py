from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from services.auth_service import AuthService

router = APIRouter()
auth_service = AuthService()

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
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/refresh-token")
async def refresh_google_token(request: GoogleRefreshRequest):
    try:
        result = await auth_service.refresh_google_token(request.refresh_token)
        if "error" in result:
            raise HTTPException(status_code=result.get("status_code", 400), detail=result)
        return result
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/github/exchange-code")
async def exchange_github_code(request: GitHubExchangeRequest):
    try:
        result = await auth_service.exchange_github_code(request.code)
        if "error" in result:
            raise HTTPException(status_code=result.get("status_code", 400), detail=result)
        return result
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health")
async def health():
    return {"status": "ok", "message": "Auth service running"}
