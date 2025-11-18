from __future__ import annotations

from typing import Any, Dict, cast

from fastapi import APIRouter, HTTPException
from langchain_core.messages import AIMessage, HumanMessage

from core import get_logger
from agents import AgentState, GraphBuilder
from models.requests.crawller import CrawlerRequest
from models.response.crawller import CrawllerResponse
from models.requests.pyjiit import PyjiitLoginResponse

router = APIRouter()
logger = get_logger(__name__)


async def generate_answer(
    question: str,
    chat_history: list[dict[str, Any]] | None,
    google_access_token: str | None = None,
    pyjiit_login_response: PyjiitLoginResponse | Dict[str, Any] | None = None,
) -> str:
    try:
        context: Dict[str, Any] = {}

        if google_access_token:
            context["google_access_token"] = google_access_token
        if pyjiit_login_response is not None:
            if hasattr(pyjiit_login_response, "model_dump"):
                context["pyjiit_login_response"] = pyjiit_login_response.model_dump(  # type: ignore
                    mode="json"
                )
            else:
                context["pyjiit_login_response"] = pyjiit_login_response

        graph = GraphBuilder(context=context or None)()

        messages_list: list = []

        if chat_history:
            for entry in chat_history:
                if isinstance(entry, dict):
                    role = (entry.get("role") or "").lower()
                    content = entry.get("content", "")

                    if role == "user":
                        messages_list.append(HumanMessage(content=content))
                    elif role in {"assistant", "bot", "ai"}:
                        messages_list.append(AIMessage(content=content))

        messages_list.append(HumanMessage(content=question))

        state = cast(AgentState, {"messages": messages_list})

        logger.info(
            "Invoking React agent with %s messages in history", len(messages_list)
        )

        for idx, msg in enumerate(messages_list):
            logger.info(
                "Message %s: %s - %s...",
                idx,
                type(msg).__name__,
                msg.content[:100],
            )

        output = await graph.ainvoke(state)

        if isinstance(output, dict) and "messages" in output:
            final_output = output["messages"][-1].content
        else:
            final_output = str(output)

        logger.info("React agent response: %s", final_output)
        return final_output

    except Exception as exc:  # pragma: no cover - defensive logging
        logger.error("Error generating react agent answer: %s", exc)
        return (
            "I apologize, but I encountered an error processing your question. "
            "Please try again."
        )


@router.post("/", response_model=CrawllerResponse)
async def agent_bhai(request: CrawlerRequest) -> CrawllerResponse:
    try:
        question = request.question
        chat_history = request.chat_history or []

        if not question:
            raise HTTPException(status_code=400, detail="question is required")

        answer = await generate_answer(
            question,
            chat_history,
            google_access_token=request.google_access_token,
            pyjiit_login_response=request.pyjiit_login_response,
        )
        return CrawllerResponse(answer=answer)

    except HTTPException:
        raise

    except Exception as exc:  # pragma: no cover - defensive logging
        logger.error("Error processing agent request: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error \n{str(exc)}",
        )
