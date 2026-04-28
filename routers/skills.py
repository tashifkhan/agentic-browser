import json

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from typing import List

from core import get_logger
from services.skills_service import list_all_skills, get_skill_content_by_name
from services.react_agent_service import ReactAgentService
from models.requests.skills import ExecuteSkillRequest, ExecuteSkillResponse, SkillsListResponse

router = APIRouter()
logger = get_logger(__name__)

def get_react_agent_service():
    return ReactAgentService()


def _sse_event(event_name: str, payload: dict) -> str:
    return f"event: {event_name}\ndata: {json.dumps(payload, ensure_ascii=True)}\n\n"

@router.get("/", response_model=SkillsListResponse)
async def get_skills() -> SkillsListResponse:
    """List all available skills discovered in the /skills directory."""
    try:
        skills = list_all_skills()
        return SkillsListResponse(skills=skills)
    except Exception as exc:
        logger.error("Error listing skills: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to list skills.")

@router.post("/execute", response_model=ExecuteSkillResponse)
async def execute_skill(
    request: ExecuteSkillRequest,
    service: ReactAgentService = Depends(get_react_agent_service),
) -> ExecuteSkillResponse:
    """Execute a specific skill by loading its SKILL.md and using the React Agent to fulfill it."""
    try:
        skill_name = request.skill_name
        user_prompt = request.prompt or ""
        
        # 1. Load the skill instructions
        skill_content = get_skill_content_by_name(skill_name)
        if not skill_content:
            raise HTTPException(status_code=404, detail=f"Skill '{skill_name}' not found.")
            
        # 2. Construct the combined prompt
        combined_question = (
            f"You are executing a skill named '{skill_name}'.\n\n"
            f"=== SKILL INSTRUCTIONS START ===\n"
            f"{skill_content}\n"
            f"=== SKILL INSTRUCTIONS END ===\n\n"
            f"User's specific request for this skill execution: {user_prompt}\n\n"
            f"Follow the instructions defined in the SKILL INSTRUCTIONS above using your tools (like bash_agent and python_agent) "
            f"to complete the user's request. Return a helpful response to the user summarizing what you did."
        )

        # 3. dispatch to the ReactAgentService
        answer = await service.generate_answer(
            combined_question,
            request.chat_history or [],
            google_access_token=request.google_access_token,
            pyjiit_login_response=request.pyjiit_login_response,
            client_html=request.client_html,
            attached_file_path=request.attached_file_path,
            conversation_id=request.conversation_id,
            client_id=request.client_id,
            client_context=request.client_context,
        )
        return ExecuteSkillResponse(answer=answer)

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error executing skill: %s", exc)
        raise HTTPException(status_code=500, detail=f"Internal server error \n{str(exc)}")


@router.post("/execute/stream")
async def execute_skill_stream(
    request: ExecuteSkillRequest,
    service: ReactAgentService = Depends(get_react_agent_service),
):
    skill_name = request.skill_name
    user_prompt = request.prompt or ""

    skill_content = get_skill_content_by_name(skill_name)
    if not skill_content:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_name}' not found.")

    combined_question = (
        f"You are executing a skill named '{skill_name}'.\n\n"
        f"=== SKILL INSTRUCTIONS START ===\n"
        f"{skill_content}\n"
        f"=== SKILL INSTRUCTIONS END ===\n\n"
        f"User's specific request for this skill execution: {user_prompt}\n\n"
        f"Follow the instructions defined in the SKILL INSTRUCTIONS above using your tools (like bash_agent and python_agent) "
        f"to complete the user's request. Return a helpful response to the user summarizing what you did."
    )

    async def event_generator():
        try:
            async for event in service.stream_answer(
                question=combined_question,
                chat_history=request.chat_history or [],
                google_access_token=request.google_access_token,
                pyjiit_login_response=request.pyjiit_login_response,
                client_html=request.client_html,
                attached_file_path=request.attached_file_path,
                conversation_id=request.conversation_id,
                client_id=request.client_id,
                client_context=request.client_context,
            ):
                event_name = str(event.get("event") or "message")
                yield _sse_event(event_name, event)
        except Exception as exc:
            logger.error("Error in execute skill stream: %s", exc)
            yield _sse_event("error", {"event": "error", "message": str(exc)})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
