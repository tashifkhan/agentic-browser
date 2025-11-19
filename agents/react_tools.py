from __future__ import annotations

import asyncio
import json
import re
from functools import partial
from typing import Any, Dict, Optional, Union

from langchain_core.tools import StructuredTool
from pydantic import AliasChoices, BaseModel, EmailStr, Field, HttpUrl

from prompts.github import get_chain as get_github_chain
from prompts.website import get_answer as get_website_answer
from prompts.website import get_chain as get_website_chain
from prompts.youtube import get_answer as get_youtube_answer
from prompts.youtube import get_chain as get_youtube_chain
from tools.github_crawler.convertor import convert_github_repo_to_markdown
from tools.google_search.seach_agent import web_search_pipeline
from tools.website_context import markdown_fetcher
from tools.gmail.fetch_latest_mails import get_latest_emails
from tools.gmail.send_email import send_email as gmail_send_email
from tools.calendar.get_calender_events import get_calendar_events
from tools.pyjiit.wrapper import Webportal, WebportalSession
from tools.pyjiit.attendance import Semester as SemesterClass
from tools.pyjiit.default import CAPTCHA as DEFAULT_CAPTCHA

from models.requests.pyjiit import PyjiitLoginResponse


def _ensure_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    content = getattr(value, "content", None)
    if isinstance(content, str):
        return content
    try:
        return json.dumps(value, ensure_ascii=True, default=str, indent=2)
    except TypeError:
        return str(value)


def _format_chat_history(history: Optional[list[dict[str, Any]]]) -> str:
    if not history:
        return ""
    lines: list[str] = []
    for entry in history:
        if isinstance(entry, dict):
            role = entry.get("role") or entry.get("speaker") or "role"
            content = entry.get("content") or entry.get("message") or ""
            lines.append(f"{role}: {content}")
        else:
            lines.append(str(entry))
    return "\n".join(lines)


def _normalise_pyjiit_login_payload(payload: Any) -> Optional[dict[str, Any]]:
    if payload is None:
        return None

    if isinstance(payload, PyjiitLoginResponse):
        return payload.model_dump(mode="json")

    if isinstance(payload, BaseModel):
        return payload.model_dump(mode="json")

    if isinstance(payload, dict):
        return payload

    if isinstance(payload, str):
        try:
            return json.loads(payload)
        except json.JSONDecodeError as exc:  # pragma: no cover - defensive parsing
            raise ValueError(
                "Provided PyJIIT login response is not valid JSON."
            ) from exc

    raise ValueError(
        "Unsupported PyJIIT login response type. Provide a JSON object matching the session structure."
    )


class GitHubToolInput(BaseModel):
    url: HttpUrl = Field(..., description="Full URL to a public GitHub repository.")
    question: str = Field(..., description="Question about the repository.")
    chat_history: Optional[list[dict[str, Any]]] = Field(
        default=None,
        description="Optional chat history as a list of {role, content} maps.",
    )


class WebSearchToolInput(BaseModel):
    query: str = Field(..., description="Search query to run against the public web.")
    max_results: int = Field(
        default=5,
        ge=1,
        le=10,
        description="Maximum number of URLs to inspect (1-10).",
    )


class WebsiteToolInput(BaseModel):
    url: HttpUrl = Field(..., description="Website URL to analyse (http or https).")
    question: str = Field(..., description="Question about the fetched page content.")
    chat_history: Optional[list[dict[str, Any]]] = Field(
        default=None,
        description="Optional chat history as a list of {role, content} maps.",
    )


class YouTubeToolInput(BaseModel):
    url: HttpUrl = Field(..., description="Full YouTube video URL.")
    question: str = Field(..., description="Question about the referenced video.")
    chat_history: Optional[list[dict[str, Any]]] = Field(
        default=None,
        description="Optional chat history as a list of {role, content} maps.",
    )


class GmailToolInput(BaseModel):
    access_token: Optional[str] = Field(
        default=None,
        description=(
            "OAuth access token with Gmail scope. "
            "If omitted, a pre-configured token will be used when available."
        ),
    )
    max_results: int = Field(
        default=5,
        ge=1,
        le=25,
        description="Maximum number of messages to retrieve (1-25).",
    )


class GmailSendEmailInput(BaseModel):
    to: EmailStr = Field(..., description="Recipient email address.")
    subject: str = Field(..., min_length=1, description="Email subject line.")
    body: str = Field(..., min_length=1, description="Plain-text body content.")
    access_token: Optional[str] = Field(
        default=None,
        description=(
            "OAuth access token with Gmail send scope. "
            "If omitted, a pre-configured token will be used when available."
        ),
    )


class CalendarToolInput(BaseModel):
    access_token: Optional[str] = Field(
        default=None,
        description=(
            "OAuth access token with Google Calendar scope. "
            "If omitted, a pre-configured token will be used when available."
        ),
    )
    max_results: int = Field(
        default=10,
        ge=1,
        le=25,
        description="Maximum number of calendar events to fetch (1-25).",
    )


class PyjiitAttendanceInput(BaseModel):
    username: Optional[str] = Field(
        default=None,
        description=(
            "Registered JIIT username. Required when no saved login response is provided."
        ),
    )
    password: Optional[str] = Field(
        default=None,
        description=(
            "Corresponding JIIT password. Required when no saved login response is provided."
        ),
    )
    registration_code: Optional[str] = Field(
        default=None,
        description=(
            "Optional semester registration code (e.g. '2025ODDSEM'). "
            "Defaults to the most recent semester."
        ),
    )
    login_response: Optional[Union[PyjiitLoginResponse, Dict[str, Any], str]] = Field(
        default=None,
        validation_alias=AliasChoices(
            "login_response", "pyjiit_login_response", "pyjiit_login_responce"
        ),
        serialization_alias="pyjiit_login_response",
        description=(
            "Serialized PyJIIT login payload returned from the authentication flow. "
            "Provides session reuse without requiring credentials."
        ),
    )


github_chain = get_github_chain()
website_chain = get_website_chain()
youtube_chain = get_youtube_chain()


async def _github_tool(
    url: HttpUrl, question: str, chat_history: Optional[list[dict[str, Any]]] = None
) -> str:
    repo_data = await convert_github_repo_to_markdown(url)
    history = _format_chat_history(chat_history)
    payload = {
        "question": question,
        "text": repo_data.content,
        "tree": repo_data.tree,
        "summary": repo_data.summary,
        "chat_history": history,
    }
    response = await asyncio.to_thread(github_chain.invoke, payload)
    return _ensure_text(response)


async def _websearch_tool(query: str, max_results: int = 5) -> str:
    bounded = max(1, min(10, max_results))
    results = await asyncio.to_thread(web_search_pipeline, query, None, bounded)
    if not results:
        return "No web results were found."

    snippets: list[str] = []
    for item in results[:bounded]:
        url = item.get("url", "")
        text = (item.get("md_body_content") or "").strip().replace("\n", " ")
        if len(text) > 320:
            text = text[:320].rstrip() + "..."
        snippets.append(f"URL: {url}\nSummary: {text}")

    return "\n\n".join(snippets)


async def _website_tool(
    url: HttpUrl, question: str, chat_history: Optional[list[dict[str, Any]]] = None
) -> str:
    markdown = await asyncio.to_thread(markdown_fetcher, str(url))
    history = _format_chat_history(chat_history)
    response = await asyncio.to_thread(
        get_website_answer,
        website_chain,
        question,
        markdown,
        history,
    )
    return _ensure_text(response)


async def _youtube_tool(
    url: HttpUrl, question: str, chat_history: Optional[list[dict[str, Any]]] = None
) -> str:
    history = _format_chat_history(chat_history)
    response = await asyncio.to_thread(
        get_youtube_answer,
        youtube_chain,
        question,
        str(url),
        history,
    )
    return _ensure_text(response)


async def _gmail_tool(
    access_token: Optional[str] = None,
    max_results: int = 5,
    *,
    _default_token: Optional[str] = None,
) -> str:
    token = access_token or _default_token
    if not token:
        return (
            "Unable to fetch Gmail messages because no Google access token was provided. "
            "Provide 'google_access_token' or include it in the tool call."
        )

    bounded = max(1, min(25, max_results))

    try:
        messages = await asyncio.to_thread(
            get_latest_emails, token, max_results=bounded
        )
        return _ensure_text({"messages": messages})
    except Exception as exc:
        return f"Failed to fetch Gmail messages: {exc}"


async def _gmail_send_email_tool(
    to: EmailStr,
    subject: str,
    body: str,
    access_token: Optional[str] = None,
    *,
    _default_token: Optional[str] = None,
) -> str:
    token = access_token or _default_token
    if not token:
        return (
            "Unable to send the email because no Google access token was provided. "
            "Provide 'google_access_token' or include it in the tool call."
        )

    try:
        response = await asyncio.to_thread(
            gmail_send_email,
            token,
            to,
            subject,
            body,
        )
        message_id = response.get("id") if isinstance(response, dict) else None
        if message_id:
            return f"Email sent successfully. Gmail message id: {message_id}."
        return "Email sent successfully."
    except Exception as exc:
        return f"Failed to send email: {exc}"


async def _calendar_tool(
    access_token: Optional[str] = None,
    max_results: int = 10,
    *,
    _default_token: Optional[str] = None,
) -> str:
    token = access_token or _default_token
    if not token:
        return (
            "Unable to fetch calendar events because no Google access token was provided. "
            "Provide 'google_access_token' or include it in the tool call."
        )

    bounded = max(1, min(25, max_results))

    try:
        events = await asyncio.to_thread(
            get_calendar_events, token, max_results=bounded
        )
        return _ensure_text({"events": events})
    except Exception as exc:
        return f"Failed to fetch calendar events: {exc}"


async def _pyjiit_attendance_tool(
    username: Optional[str] = None,
    password: Optional[str] = None,
    registration_code: Optional[str] = None,
    login_response: Optional[Union[PyjiitLoginResponse, Dict[str, Any], str]] = None,
    *,
    _default_login_response: Optional[
        Union[PyjiitLoginResponse, Dict[str, Any], str]
    ] = None,
) -> str:
    effective_login_response = login_response or _default_login_response

    try:
        login_payload = _normalise_pyjiit_login_payload(effective_login_response)
    except ValueError as exc:
        return f"Failed to retrieve PyJIIT attendance: {exc}"

    def _collect_attendance() -> dict[str, Any]:
        session = None
        if login_payload:
            try:
                session = WebportalSession(login_payload)
            except Exception as exc:  # pragma: no cover - defensive parsing
                raise ValueError(
                    f"Invalid PyJIIT login response provided: {exc}"
                ) from exc

        wp = Webportal(session=session)

        if session is None:
            if not username or not password:
                raise ValueError(
                    "PyJIIT credentials are missing. Provide username/password or a pyjiit_login_response."
                )
            wp.student_login(username, password, DEFAULT_CAPTCHA)

        meta = wp.get_attendance_meta()
        header = meta.latest_header()
        semester = meta.latest_semester()

        if registration_code:
            for candidate in meta.semesters:
                if candidate.registration_code == registration_code:
                    semester = candidate
                    break

        semester_obj = SemesterClass(
            registration_code=semester.registration_code,
            registration_id=semester.registration_id,
        )

        attendance = wp.get_attendance(header, semester_obj)
        raw_list = (
            attendance.get("studentattendancelist", [])
            if isinstance(attendance, dict)
            else []
        )

        processed: list[dict[str, Any]] = []
        for item in raw_list:
            subj = item.get("subjectcode", "") or ""
            code_match = re.search(r"\(([^)]+)\)\s*$", subj)
            subject_code = code_match.group(1) if code_match else ""
            subject_name = re.sub(r"\s*\([^)]*\)\s*$", "", subj).strip()

            processed.append(
                {
                    "subject": subject_name,
                    "code": subject_code,
                    "attendance": item.get("LTpercantage"),
                }
            )

        return {
            "semester": semester.registration_code,
            "records": processed,
        }

    try:
        result = await asyncio.to_thread(_collect_attendance)
        return _ensure_text(result)
    except Exception as exc:
        return f"Failed to retrieve PyJIIT attendance: {exc}"


github_agent = StructuredTool(
    name="github_agent",
    description="Answer questions about a GitHub repository using repository contents.",
    coroutine=_github_tool,
    args_schema=GitHubToolInput,
)

websearch_agent = StructuredTool(
    name="websearch_agent",
    description="Search the web and summarise the top results.",
    coroutine=_websearch_tool,
    args_schema=WebSearchToolInput,
)

website_agent = StructuredTool(
    name="website_agent",
    description="Fetch a web page, convert it to markdown, and answer questions about it.",
    coroutine=_website_tool,
    args_schema=WebsiteToolInput,
)

youtube_agent = StructuredTool(
    name="youtube_agent",
    description="Answer questions about a YouTube video using transcript and metadata.",
    coroutine=_youtube_tool,
    args_schema=YouTubeToolInput,
)


gmail_agent = StructuredTool(
    name="gmail_agent",
    description="Fetch recent Gmail messages using an OAuth access token.",
    coroutine=_gmail_tool,
    args_schema=GmailToolInput,
)


gmail_send_agent = StructuredTool(
    name="gmail_send_email",
    description="Send a plain-text email using the authenticated Gmail account.",
    coroutine=_gmail_send_email_tool,
    args_schema=GmailSendEmailInput,
)


calendar_agent = StructuredTool(
    name="calendar_agent",
    description="Retrieve upcoming Google Calendar events.",
    coroutine=_calendar_tool,
    args_schema=CalendarToolInput,
)


pyjiit_agent = StructuredTool(
    name="pyjiit_agent",
    description="Fetch attendance data from the JIIT web portal.",
    coroutine=_pyjiit_attendance_tool,
    args_schema=PyjiitAttendanceInput,
)


def build_agent_tools(context: Optional[Dict[str, Any]] = None) -> list[StructuredTool]:
    ctx: Dict[str, Any] = dict(context or {})
    google_token = ctx.get("google_access_token") or ctx.get("google_acces_token")
    pyjiit_payload = ctx.get("pyjiit_login_response") or ctx.get(
        "pyjiit_login_responce"
    )

    tools: list[StructuredTool] = [
        github_agent,
        websearch_agent,
        website_agent,
        youtube_agent,
    ]

    if google_token:
        tools.append(
            StructuredTool(
                name=gmail_agent.name,
                description=gmail_agent.description,
                coroutine=partial(_gmail_tool, _default_token=google_token),
                args_schema=GmailToolInput,
            )
        )
        tools.append(
            StructuredTool(
                name=gmail_send_agent.name,
                description=gmail_send_agent.description,
                coroutine=partial(
                    _gmail_send_email_tool,
                    _default_token=google_token,
                ),
                args_schema=GmailSendEmailInput,
            )
        )
        tools.append(
            StructuredTool(
                name=calendar_agent.name,
                description=calendar_agent.description,
                coroutine=partial(_calendar_tool, _default_token=google_token),
                args_schema=CalendarToolInput,
            )
        )
    else:
        tools.append(gmail_agent)
        tools.append(gmail_send_agent)
        tools.append(calendar_agent)

    if pyjiit_payload is not None:
        tools.append(
            StructuredTool(
                name=pyjiit_agent.name,
                description=pyjiit_agent.description,
                coroutine=partial(
                    _pyjiit_attendance_tool,
                    _default_login_response=pyjiit_payload,
                ),
                args_schema=PyjiitAttendanceInput,
            )
        )
    else:
        tools.append(pyjiit_agent)

    return tools


AGENT_TOOLS = build_agent_tools()

__all__ = [
    "AGENT_TOOLS",
    "build_agent_tools",
    "github_agent",
    "websearch_agent",
    "website_agent",
    "youtube_agent",
    "gmail_agent",
    "gmail_send_agent",
    "calendar_agent",
    "pyjiit_agent",
]
