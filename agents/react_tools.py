from __future__ import annotations

import asyncio
import json
import logging
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
from tools.gmail.list_unread_emails import list_unread
from tools.gmail.mark_email_read import mark_read
from tools.gmail.send_email import send_email as gmail_send_email
from tools.calendar.get_calender_events import get_calendar_events
from tools.calendar.create_calender_events import create_calendar_event
from tools.pyjiit.wrapper import Webportal, WebportalSession
from tools.pyjiit.attendance import Semester as SemesterClass


logger = logging.getLogger(__name__)


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


class GmailListUnreadInput(BaseModel):
    access_token: Optional[str] = Field(
        default=None,
        description=(
            "OAuth access token with Gmail scope. "
            "If omitted, a pre-configured token will be used when available."
        ),
    )
    max_results: int = Field(
        default=10,
        ge=1,
        le=50,
        description="Maximum number of unread messages to inspect (1-50).",
    )


class GmailMarkReadInput(BaseModel):
    message_id: str = Field(
        ...,
        min_length=1,
        description="Gmail message identifier to mark as read.",
    )
    access_token: Optional[str] = Field(
        default=None,
        description=(
            "OAuth access token with Gmail modify scope. "
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


class CalendarCreateEventInput(BaseModel):
    summary: str = Field(..., min_length=1, description="Event title/summary text.")
    start_time: str = Field(
        ...,
        description=(
            "Event start datetime in ISO 8601 format (e.g. '2025-11-19T10:00:00Z')."
        ),
    )
    end_time: str = Field(
        ...,
        description=(
            "Event end datetime in ISO 8601 format (e.g. '2025-11-19T11:00:00Z')."
        ),
    )
    description: Optional[str] = Field(
        default="Created via agent",
        description="Optional event description to include in the calendar entry.",
    )
    access_token: Optional[str] = Field(
        default=None,
        description=(
            "OAuth access token with Calendar write scope. "
            "If omitted, a pre-configured token will be used when available."
        ),
    )


class PyjiitAttendanceInput(BaseModel):
    registration_code: Optional[str] = Field(
        default=None,
        description="Optional semester code (e.g. '2025ODDSEM'). If omitted, defaults to latest.",
    )
    session_payload: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Login session payload. If omitted, a pre-configured session will be used.",
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


async def _gmail_list_unread_tool(
    max_results: int = 10,
    access_token: Optional[str] = None,
    *,
    _default_token: Optional[str] = None,
) -> str:
    token = access_token or _default_token
    if not token:
        return (
            "Unable to list unread messages because no Google access token was provided. "
            "Provide 'google_access_token' or include it in the tool call."
        )

    bounded = max(1, min(50, max_results))

    try:
        messages = await asyncio.to_thread(list_unread, token, bounded)
        if not messages:
            return "No unread messages found."
        return _ensure_text({"unread_messages": messages})
    except Exception as exc:
        return f"Failed to list unread messages: {exc}"


async def _gmail_mark_read_tool(
    message_id: str,
    access_token: Optional[str] = None,
    *,
    _default_token: Optional[str] = None,
) -> str:
    token = access_token or _default_token
    if not token:
        return (
            "Unable to mark the message as read because no Google access token was provided. "
            "Provide 'google_access_token' or include it in the tool call."
        )

    try:
        await asyncio.to_thread(mark_read, token, message_id)
        return f"Message {message_id} marked as read."
    except Exception as exc:
        return f"Failed to mark message as read: {exc}"


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


async def _calendar_create_event_tool(
    summary: str,
    start_time: str,
    end_time: str,
    description: str = "Created via agent",
    access_token: Optional[str] = None,
    *,
    _default_token: Optional[str] = None,
) -> str:
    token = access_token or _default_token
    if not token:
        return (
            "Unable to create the calendar event because no Google access token was provided. "
            "Provide 'google_access_token' or include it in the tool call."
        )

    try:

        def _create() -> dict[str, Any]:
            return create_calendar_event(
                token,
                summary=summary,
                start_time=start_time,
                end_time=end_time,
                description=description,
            )

        event = await asyncio.to_thread(_create)
        link = event.get("htmlLink") if isinstance(event, dict) else None
        if link:
            return f"Calendar event created successfully: {link}"
        return "Calendar event created successfully."
    except Exception as exc:
        return f"Failed to create calendar event: {exc}"


async def _pyjiit_attendance_tool(
    registration_code: Optional[str] = None,
    session_payload: Optional[Dict[str, Any]] = None,
    *,
    _default_payload: Optional[Dict[str, Any]] = None,
) -> str:
    payload = session_payload or _default_payload
    if not payload:
        return (
            "Unable to fetch attendance because no PyJIIT login session was provided. "
            "The user must be logged in to access attendance data."
        )

    try:
        # Adapt logic from routers/pyjiit.py
        if isinstance(payload, dict) and "session_payload" in payload:
            payload = payload["session_payload"]
        if isinstance(payload, dict) and "raw_response" in payload:
            payload = payload["raw_response"]

        # Run blocking IO in a thread
        def _fetch() -> list[dict[str, Any]]:
            session = WebportalSession(payload)
            wp = Webportal(session=session)
            meta = wp.get_attendance_meta()

            # Hardcoded mapping from routers/pyjiit.py
            HARD_CODED_SEMESTERS = {
                "2026EVESEM": "JIRUM25100000001",
                "2025ODDSEM": "JIRUM25030000001",
                "2025EVESEM": "JIRUM24100000001",
                "2024ODDSEM": "JIRUM24030000001",
                "2024EVESEM": "JIRUM23110000001",
                "SUMMER2023": "JIRUM23050000001",
                "2023ODDSEM": "JIRUM23040000001",
                "2023EVESEM": "JIRUM22110000001",
                "2022ODDSEM": "JIRUM22050000001",
            }

            # Default to 2025ODDSEM if not specified, matching router logic
            target_code = registration_code or "2025ODDSEM"
            registration_id = HARD_CODED_SEMESTERS.get(target_code)

            if not registration_id:
                # Fallback: try to find it in the meta semesters if possible,
                # or just error out as per original router logic which raises 500.
                # For the agent, we'll return a helpful error message.
                raise ValueError(
                    f"Registration ID for '{target_code}' not found in hardcoded map."
                )

            sem = SemesterClass(
                registration_code=target_code, registration_id=registration_id
            )
            header = meta.latest_header()
            attendance = wp.get_attendance(header, sem)

            raw_list = (
                attendance.get("studentattendancelist", [])
                if isinstance(attendance, dict)
                else []
            )

            processed = []
            for item in raw_list:
                subj = item.get("subjectcode", "") or ""
                m = re.search(r"\(([^)]+)\)\s*$", subj)
                code = m.group(1) if m else ""
                subject_no_bracket = re.sub(r"\s*\([^)]*\)\s*$", "", subj).strip()

                processed.append(
                    {
                        "LTpercantage": item.get("LTpercantage"),
                        "subjectcode": subject_no_bracket,
                        "subjectcode_code": code,
                    }
                )
            return processed

        data = await asyncio.to_thread(_fetch)
        return _ensure_text(data)

    except Exception as exc:
        return f"Failed to fetch attendance: {exc}"


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


gmail_list_unread_agent = StructuredTool(
    name="gmail_list_unread",
    description="List unread Gmail messages with basic metadata.",
    coroutine=_gmail_list_unread_tool,
    args_schema=GmailListUnreadInput,
)


gmail_mark_read_agent = StructuredTool(
    name="gmail_mark_read",
    description="Mark a Gmail message as read using its message id.",
    coroutine=_gmail_mark_read_tool,
    args_schema=GmailMarkReadInput,
)


calendar_agent = StructuredTool(
    name="calendar_agent",
    description="Retrieve upcoming Google Calendar events.",
    coroutine=_calendar_tool,
    args_schema=CalendarToolInput,
)


calendar_create_event_agent = StructuredTool(
    name="calendar_create_event",
    description="Create a new Google Calendar event on the primary calendar.",
    coroutine=_calendar_create_event_tool,
    args_schema=CalendarCreateEventInput,
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
                name=gmail_list_unread_agent.name,
                description=gmail_list_unread_agent.description,
                coroutine=partial(
                    _gmail_list_unread_tool,
                    _default_token=google_token,
                ),
                args_schema=GmailListUnreadInput,
            )
        )
        tools.append(
            StructuredTool(
                name=gmail_mark_read_agent.name,
                description=gmail_mark_read_agent.description,
                coroutine=partial(
                    _gmail_mark_read_tool,
                    _default_token=google_token,
                ),
                args_schema=GmailMarkReadInput,
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
        tools.append(
            StructuredTool(
                name=calendar_create_event_agent.name,
                description=calendar_create_event_agent.description,
                coroutine=partial(
                    _calendar_create_event_tool,
                    _default_token=google_token,
                ),
                args_schema=CalendarCreateEventInput,
            )
        )

    if pyjiit_payload:
        tools.append(
            StructuredTool(
                name=pyjiit_agent.name,
                description=pyjiit_agent.description,
                coroutine=partial(
                    _pyjiit_attendance_tool,
                    _default_payload=pyjiit_payload,
                ),
                args_schema=PyjiitAttendanceInput,
            )
        )

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
    "gmail_list_unread_agent",
    "gmail_mark_read_agent",
    "calendar_agent",
    "calendar_create_event_agent",
    "pyjiit_agent",
]
