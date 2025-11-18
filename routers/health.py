from fastapi import APIRouter
from models.response import HealthResponse

router = APIRouter()


@router.get("/", response_model=HealthResponse)
async def health_handler():
    return HealthResponse(
        status="healthy",
        message="Agentic Browser API is running smoothly.",
    )
