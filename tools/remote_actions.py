"""Actions the agent can take from anywhere, not just the side panel.

browser_task      Runs a multi-step task in the user's real browser through the
                  bridge (the extension's `task.run`), the same planner loop the
                  side panel uses. Works from Telegram and the console as long
                  as the extension is connected.
composio_apps     Lists the apps connected in Composio and, for one app, the
                  actions it offers.
composio_action   Runs one Composio action (send a Slack message, create a
                  Notion page, open a GitHub issue...) on a connected account.

Composio covers apps with an API; browser_task covers everything else.
"""
from __future__ import annotations

from typing import Any, Optional

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from core import get_logger

logger = get_logger(__name__)

TASK_TIMEOUT = 15 * 60


class BrowserTaskInput(BaseModel):
    goal: str = Field(..., description=(
        "What to do in the browser, as a complete instruction with every detail needed, e.g. "
        "'On amazon.in, find the cheapest USB-C cable with 4+ stars and add it to the cart'."))
    url: Optional[str] = Field(default=None, description=(
        "Page to start on. Opens in a new tab. Leave empty to start on the tab that's already open."))


async def _browser_task(goal: str, url: Optional[str] = None) -> str:
    from mcp_server.bridge import BridgeError, manager

    try:
        result = await manager.call("task.run", {"goal": goal, "url": url}, timeout=TASK_TIMEOUT)
    except BridgeError as exc:
        return f"Couldn't run the browser task: {exc}"
    except Exception as exc:
        logger.exception("browser_task failed")
        return f"The browser task failed: {exc}"
    if not isinstance(result, dict):
        return str(result)
    lines = [result.get("answer") or "The task ended without a message."]
    if result.get("url"):
        lines.append(f"\nEnded on: {result.get('title') or ''} {result['url']}".rstrip())
    if result.get("trail"):
        lines.append(f"Steps taken ({result.get('steps', len(result['trail']))}):")
        lines += [f"- {t}" for t in result["trail"]]
    return "\n".join(lines)


browser_task_tool = StructuredTool(
    name="browser_task",
    coroutine=_browser_task,
    args_schema=BrowserTaskInput,
    description=(
        "Do something in the user's own browser, where they're already logged in: open sites, search, "
        "click, fill forms, read pages, multi-step flows. Use it when the user asks you to do or check "
        "something on a website and no API tool covers it. It returns what happened and where it ended. "
        "It stops at logins, captchas and payment pages. Never buy, pay, send messages or delete anything "
        "unless the user explicitly asked for exactly that."
    ),
)


class ComposioAppsInput(BaseModel):
    app: Optional[str] = Field(default=None, description="An app slug from the list (e.g. 'slack', 'notion') to see its actions. Leave empty to list connected apps.")
    search: Optional[str] = Field(default=None, description="Words to filter that app's actions by, e.g. 'send message'.")


async def _composio_apps(app: Optional[str] = None, search: Optional[str] = None) -> str:
    from services import composio_service as cs

    try:
        if not app:
            accounts = await cs.list_connected_accounts()
            active = [a for a in accounts if a.get("status") == "ACTIVE"]
            if not active:
                return "No apps are connected in Composio. The user can connect them in Settings → Apps."
            by_app: dict[str, list[str]] = {}
            for a in active:
                label = a.get("alias") or a.get("email") or a.get("username") or a.get("id")
                by_app.setdefault(str(a.get("toolkit")), []).append(str(label))
            return "Connected apps:\n" + "\n".join(f"- {k}: {', '.join(v)}" for k, v in sorted(by_app.items()))
        actions = await cs.list_tools_for_toolkit(app.lower())
        if search:
            words = search.lower().split()
            actions = [t for t in actions if all(w in f"{t['slug']} {t['name']} {t.get('description') or ''}".lower() for w in words)]
        if not actions:
            return f"No {app} actions match. Try other words, or no search."
        rows = [f"- {t['slug']}: {(t.get('description') or t['name'])[:140]}" for t in actions[:40]]
        more = f"\n... {len(actions) - 40} more; narrow with search" if len(actions) > 40 else ""
        return f"{app} actions:\n" + "\n".join(rows) + more
    except cs.ComposioNotConfigured:
        return "Composio isn't set up. The user can add a Composio API key in Settings → Apps."
    except Exception as exc:
        return f"Couldn't list Composio apps: {exc}"


class ComposioActionInput(BaseModel):
    app: str = Field(..., description="App slug, e.g. 'slack'.")
    action: str = Field(..., description="Exact action slug from composio_apps, e.g. 'SLACK_SEND_MESSAGE'.")
    arguments: dict[str, Any] = Field(default_factory=dict, description="The action's arguments.")
    account_id: Optional[str] = Field(default=None, description="Connected account id, only when the app has more than one account.")


async def _composio_action(app: str, action: str, arguments: Optional[dict[str, Any]] = None, account_id: Optional[str] = None) -> str:
    from services import composio_service as cs

    try:
        result = await cs.execute_toolkit_action(
            app.lower(),
            exact_tool_slugs=[action],
            required_terms=[action.lower()],
            payloads=[arguments or {}],
            connected_account_id=account_id,
        )
        return cs.stringify_result(result)[:12000]
    except cs.ComposioNotConfigured:
        return "Composio isn't set up. The user can add a Composio API key in Settings → Apps."
    except Exception as exc:
        return f"{action} failed: {exc}"


composio_apps_tool = StructuredTool(
    name="composio_apps",
    coroutine=_composio_apps,
    args_schema=ComposioAppsInput,
    description=(
        "See which apps the user connected through Composio (Slack, Notion, GitHub, Linear, Drive and "
        "others), and the actions one app offers. Call it before composio_action."
    ),
)

composio_action_tool = StructuredTool(
    name="composio_action",
    coroutine=_composio_action,
    args_schema=ComposioActionInput,
    description=(
        "Run one action on an app connected through Composio, with its exact slug from composio_apps. "
        "Faster and more reliable than browser_task when the app is connected. Only send, post, delete "
        "or pay when the user explicitly asked for that."
    ),
)

REMOTE_TOOLS = [browser_task_tool, composio_apps_tool, composio_action_tool]
