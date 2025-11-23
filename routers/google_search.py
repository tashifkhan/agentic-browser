from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from core import get_logger
from services.google_search_service import GoogleSearchService

router = APIRouter()
logger = get_logger(__name__)


class SearchRequest(BaseModel):
    query: str
    max_results: int = 5


def get_google_search_service():
    return GoogleSearchService()


@router.get("/", response_model=dict)
async def google_search(
    request: SearchRequest,
    service: GoogleSearchService = Depends(get_google_search_service),
):
    try:
        if not request.query:
            raise HTTPException(status_code=400, detail="query is required")

        results = service.search(request.query, max_results=request.max_results)

        return {"results": results}

    except HTTPException:
        raise

    except Exception as e:
        # Service already logs exception
        raise HTTPException(status_code=500, detail=str(e))
