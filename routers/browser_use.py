from fastapi import APIRouter, HTTPException, Depends

from core import get_logger
from models.requests.agent import GenerateScriptRequest
from models.response.agent import GenerateScriptResponse
from services.agent_service import AgentService

router = APIRouter()
logger = get_logger(__name__)


def get_agent_service():
    return AgentService()


@router.post("/generate-script", response_model=GenerateScriptResponse)
async def generate_script(
    request: GenerateScriptRequest,
    service: AgentService = Depends(get_agent_service),
) -> GenerateScriptResponse:
    try:
        if not request.goal:
            raise HTTPException(status_code=400, detail="Missing 'goal'")

        result = await service.generate_script(
            goal=request.goal,
            target_url=request.target_url or "",
            dom_structure=request.dom_structure or {},
            constraints=request.constraints or {},
        )

        if not result.get("ok"):
            # If it's a validation error (problems present), return 400
            if result.get("problems"):
                # We can return the response with ok=False and problems,
                # but usually APIs might want to return 400 Bad Request.
                # However, to match the response model which includes error fields:
                return GenerateScriptResponse(**result)

            # If it's a general error, we might want to raise 500 or return the error object
            # The service returns "error" key.
            return GenerateScriptResponse(**result)

        return GenerateScriptResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in generate_script endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))
