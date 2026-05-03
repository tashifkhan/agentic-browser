from __future__ import annotations

from core import get_logger
from models.requests.automation import AutomationStepRequest
from models.requests.browser_runtime import BrowserRuntimeStartRequest, BrowserRuntimeStepRequest
from models.response.automation import AutomationStepResponse
from services.browser_runtime_service import BrowserRuntimeService

logger = get_logger(__name__)


class BrowserAutomationService:
    max_steps = 8

    async def plan_step(self, request: AutomationStepRequest) -> AutomationStepResponse:
        runtime = BrowserRuntimeService()
        last_result = request.previous_results[-1] if request.previous_results else None

        if request.run_id:
            response = await runtime.continue_session(
                BrowserRuntimeStepRequest(
                    session_id=request.run_id,
                    page=request.page,
                    result=last_result,
                )
            )
        else:
            response = await runtime.start_session(
                BrowserRuntimeStartRequest(
                    goal=request.goal,
                    page=request.page,
                    max_steps=self.max_steps,
                )
            )

        return AutomationStepResponse(
            run_id=response.session_id,
            step=response.step,
            done=response.done,
            message=response.message,
            actions=[response.action] if response.action else [],
            expected_state=response.expected_state,
            verification=response.verification,
            reason=response.reason,
        )
