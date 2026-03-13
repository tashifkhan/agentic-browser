from __future__ import annotations

from typing import Any, Dict, cast

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from agents import AgentState, GraphBuilder
from core import get_logger
from core.llm import _model
from models.requests.pyjiit import PyjiitLoginResponse
from tools.website_context import html_md_convertor

logger = get_logger(__name__)


class ReactAgentService:
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
            # If a file is attached, use the google-genai SDK directly to upload and process it
            if attached_file_path:
                logger.info("Attached file found: %s. Using google-genai SDK directly.", attached_file_path)
                try:
                    from google import genai
                    import os
                    
                    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
                    client = genai.Client(api_key=api_key)
                    
                    # Upload the file
                    logger.info("Uploading file to Google GenAI...")
                    uploaded_file = client.files.upload(file=attached_file_path)
                    logger.info("File uploaded successfully. URI: %s", uploaded_file.uri)
                    
                    contents = [uploaded_file]
                    
                    # Add context from client_html if present
                    if client_html:
                        client_markdown = html_md_convertor(client_html)
                        if client_markdown:
                            contents.append(
                                f"Context from the current web page the user is viewing:\n\n{client_markdown}"
                            )
                            
                    # Add text question
                    contents.append(question)
                    
                    logger.info("Generating content with %s for file processing...", _model.model_name)
                    
                    response = client.models.generate_content(
                        model=_model.model_name,
                        contents=contents
                    )
                    return response.text
                
                except Exception as e:
                    logger.error("Failed to process attached file with google-genai: %s", e)
                    return f"I couldn't process the attached file due to an error: {str(e)}"
            
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

            graph = GraphBuilder(context=context or None)()

            messages_list: list = []

            if chat_history:
                for entry in chat_history:
                    if isinstance(entry, dict):
                        role = (entry.get("role") or "").lower()
                        content = entry.get("content", "")

                        if role == "user":
                            messages_list.append(HumanMessage(content=content))

                        elif role in {
                            "assistant",
                            "bot",
                            "ai",
                        }:
                            messages_list.append(AIMessage(content=content))

            # If client HTML is provided, convert to markdown and inject as context
            if client_html:
                logger.info(
                    "Received client HTML (%d chars), converting to markdown for react agent context",
                    len(client_html),
                )
                client_markdown = html_md_convertor(client_html)
                if client_markdown:
                    page_context_msg = SystemMessage(
                        content=(
                            "The following is the markdown content of the web page the user "
                            "is currently viewing in their browser. Use this as context to "
                            "provide more accurate and relevant answers:\n\n"
                            f"{client_markdown}"
                        )
                    )
                    messages_list.append(page_context_msg)

            messages_list.append(HumanMessage(content=question))

            state = cast(
                AgentState,
                {"messages": messages_list},
            )

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
                last_msg = output["messages"][-1]
                content = last_msg.content
                if isinstance(content, list):
                    final_output = ""
                    for part in content:
                        if isinstance(part, str):
                            final_output += part
                        elif isinstance(part, dict) and part.get("type") == "text":
                            final_output += part.get("text", "")
                else:
                    final_output = str(content)
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
