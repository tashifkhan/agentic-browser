from fastapi import APIRouter, HTTPException, Depends

from core import get_logger
from models.requests.agent import GenerateScriptRequest
from models.response.agent import GenerateScriptResponse
from services.browser_use_service import AgentService

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
            dom_structure=request.dom_structure,
            constraints=request.constraints,
        )

        if not result.get("ok"):
            if result.get("problems"):
                return GenerateScriptResponse(**result)
            return GenerateScriptResponse(**result)

        return GenerateScriptResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in generate_script endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))
