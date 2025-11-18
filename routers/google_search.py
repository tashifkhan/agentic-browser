from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from core import get_logger
from tools.google_search.seach_agent import web_search_pipeline

router = APIRouter()
logger = get_logger(__name__)


class SearchRequest(BaseModel):
    query: str
    max_results: int = 5


@router.get("/", response_model=dict)
async def google_search(request: SearchRequest):
    try:
        if not request.query:
            raise HTTPException(status_code=400, detail="query is required")

        logger.info(
            "google_search request received: query=%s, max_results=%s",
            request.query,
            request.max_results,
        )
        results = web_search_pipeline(request.query, max_results=request.max_results)
        if not results:
            logger.warning(
                "google_search returned no results for query: %s", request.query
            )
        else:
            logger.info(
                "google_search returned %d result(s) for query: %s",
                len(results),
                request.query,
            )

        return {"results": results}

    except HTTPException:
        raise

    except Exception as e:
        logger.exception("Error in google_search router: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
