from fastapi import APIRouter
from models.response import HealthResponse

router = APIRouter()


@router.get("/", response_model=HealthResponse)
async def health_handler():
    return HealthResponse(
        status="healthy",
        message="YouTube Q&A Backend is running",
    )
