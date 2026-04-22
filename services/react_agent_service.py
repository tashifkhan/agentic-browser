from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncGenerator, Awaitable, Callable
from typing import Any, Dict

from core import get_logger
from core.llm import _model
from models.requests.pyjiit import PyjiitLoginResponse
from tools.website_context import html_md_convertor
from agents.while_loop_harness import run_supervisor_harness

logger = get_logger(__name__)

EventCallback = Callable[[dict[str, Any]], Awaitable[None]]


class ReactAgentService:
    async def _build_context(
        self,
        google_access_token: str | None = None,
        pyjiit_login_response: PyjiitLoginResponse | Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        context: Dict[str, Any] = {}

        if google_access_token:
            context["google_access_token"] = google_access_token

        if pyjiit_login_response is not None:
            if hasattr(pyjiit_login_response, "model_dump"):
                context["pyjiit_login_response"] = pyjiit_login_response.model_dump(  # type: ignore
                    mode="python"
                )
            else:
                context["pyjiit_login_response"] = pyjiit_login_response

        return context

    def _build_goal_prompt(
        self,
        question: str,
        chat_history: list[dict[str, Any]] | None,
        client_html: str | None,
    ) -> str:
        history_lines: list[str] = []
        for entry in chat_history or []:
            if not isinstance(entry, dict):
                continue
            role = str(entry.get("role") or "user").strip().lower()
            content = str(entry.get("content") or "").strip()
            if content:
                history_lines.append(f"{role}: {content}")

        client_markdown = ""
        if client_html:
            logger.info(
                "Received client HTML (%d chars), converting to markdown for while-loop context",
                len(client_html),
            )
            client_markdown = html_md_convertor(client_html)

        sections: list[str] = [f"User request:\n{question}"]

        if history_lines:
            sections.append("Conversation context:\n" + "\n".join(history_lines[-20:]))

        if client_markdown:
            sections.append(
                "Current page context (markdown):\n"
                + client_markdown[:12000]
            )

        sections.append(
            "Execution policy: auto-execute browser actions when needed and keep iterating "
            "until the task is satisfactory or loop limits are reached."
        )
        return "\n\n".join(sections)

    async def _handle_attached_file(
        self,
        question: str,
        client_html: str | None,
        attached_file_path: str,
    ) -> str:
        logger.info(
            "Attached file found: %s. Using google-genai SDK directly.",
            attached_file_path,
        )
        try:
            from google import genai

            api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
            client = genai.Client(api_key=api_key)

            logger.info("Uploading file to Google GenAI...")
            uploaded_file = client.files.upload(file=attached_file_path)
            logger.info("File uploaded successfully. URI: %s", uploaded_file.uri)

            contents: list[Any] = [uploaded_file]
            if client_html:
                client_markdown = html_md_convertor(client_html)
                if client_markdown:
                    contents.append(
                        "Context from the current web page the user is viewing:\n\n"
                        + client_markdown
                    )

            contents.append(question)

            logger.info(
                "Generating content with %s for file processing...",
                _model.model_name,
            )

            response = client.models.generate_content(
                model=_model.model_name,
                contents=contents,
            )
            return response.text
        except Exception as exc:
            logger.error("Failed to process attached file with google-genai: %s", exc)
            return f"I couldn't process the attached file due to an error: {str(exc)}"

    async def generate_answer(
        self,
        question: str,
        chat_history: list[dict[str, Any]] | None,
        google_access_token: str | None = None,
        pyjiit_login_response: PyjiitLoginResponse | Dict[str, Any] | None = None,
        client_html: str | None = None,
        attached_file_path: str | None = None,
    ) -> str:
        try:
            if attached_file_path:
                return await self._handle_attached_file(
                    question=question,
                    client_html=client_html,
                    attached_file_path=attached_file_path,
                )

            context = await self._build_context(
                google_access_token=google_access_token,
                pyjiit_login_response=pyjiit_login_response,
            )
            goal_prompt = self._build_goal_prompt(
                question=question,
                chat_history=chat_history,
                client_html=client_html,
            )

            logger.info("Invoking while-loop harness for react agent")
            final_output = await run_supervisor_harness(
                user_goal=goal_prompt,
                context=context,
            )
            logger.info("While-loop harness final response generated")
            return final_output
        except Exception as exc:  # pragma: no cover
            logger.error("Error generating react agent answer: %s", exc)
            return (
                "I apologize, but I encountered an error processing your question. "
                "Please try again."
            )

    async def stream_answer(
        self,
        question: str,
        chat_history: list[dict[str, Any]] | None,
        google_access_token: str | None = None,
        pyjiit_login_response: PyjiitLoginResponse | Dict[str, Any] | None = None,
        client_html: str | None = None,
        attached_file_path: str | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        queue: asyncio.Queue[Any] = asyncio.Queue()
        done_marker = object()

        async def emit(payload: dict[str, Any]) -> None:
            await queue.put(payload)

        async def _run() -> None:
            try:
                await emit({"event": "run_started"})

                if attached_file_path:
                    answer = await self._handle_attached_file(
                        question=question,
                        client_html=client_html,
                        attached_file_path=attached_file_path,
                    )
                    await emit({"event": "answer_delta", "delta": answer})
                    await emit(
                        {
                            "event": "final",
                            "answer": answer,
                            "iterations": 1,
                            "satisfactory": True,
                        }
                    )
                    return

                context = await self._build_context(
                    google_access_token=google_access_token,
                    pyjiit_login_response=pyjiit_login_response,
                )
                goal_prompt = self._build_goal_prompt(
                    question=question,
                    chat_history=chat_history,
                    client_html=client_html,
                )

                await run_supervisor_harness(
                    user_goal=goal_prompt,
                    context=context,
                    emit=emit,
                )
            except Exception as exc:
                logger.error("Error in stream_answer: %s", exc)
                await emit({"event": "error", "message": str(exc)})
            finally:
                await queue.put(done_marker)

        task = asyncio.create_task(_run())
        try:
            while True:
                item = await queue.get()
                if item is done_marker:
                    break
                yield item
        finally:
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
