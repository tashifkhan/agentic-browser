from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from typing import Any

from core import get_logger
from services.secrets_service import get_secrets_service

logger = get_logger(__name__)


@dataclass(frozen=True)
class CuratedToolkit:
    slug: str
    display_name: str
    auth_mode: str


CURATED_TOOLKITS: list[CuratedToolkit] = [
    CuratedToolkit("gmail", "Gmail", "managed"),
    CuratedToolkit("googlecalendar", "Google Calendar", "managed"),
    CuratedToolkit("googledrive", "Google Drive", "managed"),
    CuratedToolkit("googlesheets", "Google Sheets", "managed"),
    CuratedToolkit("googledocs", "Google Docs", "managed"),
    CuratedToolkit("slack", "Slack", "managed"),
    CuratedToolkit("github", "GitHub", "managed"),
    CuratedToolkit("linear", "Linear", "managed"),
    CuratedToolkit("notion", "Notion", "managed"),
    CuratedToolkit("hubspot", "HubSpot", "managed"),
    CuratedToolkit("discord", "Discord", "managed"),
    CuratedToolkit("trello", "Trello", "managed"),
    CuratedToolkit("asana", "Asana", "managed"),
    CuratedToolkit("jira", "Jira", "managed"),
    CuratedToolkit("airtable", "Airtable", "managed"),
    CuratedToolkit("figma", "Figma", "managed"),
    CuratedToolkit("dropbox", "Dropbox", "managed"),
    CuratedToolkit("stripe", "Stripe", "managed"),
    CuratedToolkit("supabase", "Supabase", "managed"),
    CuratedToolkit("granola_mcp", "Granola", "managed"),
    CuratedToolkit("salesforce", "Salesforce", "managed"),
    CuratedToolkit("twitter", "Twitter / X", "byo"),
    CuratedToolkit("linkedin", "LinkedIn", "managed"),
    CuratedToolkit("instagram", "Instagram", "managed"),
    CuratedToolkit("aeroleads", "AeroLeads", "managed"),
]

_DISPLAY_NAME_BY_SLUG = {item.slug: item.display_name for item in CURATED_TOOLKITS}


class ComposioNotConfigured(RuntimeError):
    pass


class ComposioNeedsAuthConfigError(RuntimeError):
    def __init__(self, toolkit: str, message: str | None = None):
        super().__init__(message or f"Toolkit '{toolkit}' requires a BYO auth config")
        self.toolkit = toolkit


def display_name_for(slug: str) -> str:
    return _DISPLAY_NAME_BY_SLUG.get(slug, _humanize(slug))


def _humanize(slug: str) -> str:
    return " ".join(
        part[:1].upper() + part[1:]
        for part in slug.replace("-", "_").split("_")
        if part
    )


def _items(obj: Any) -> list[Any]:
    if obj is None:
        return []
    if isinstance(obj, list):
        return obj
    items = getattr(obj, "items", None)
    if isinstance(items, list):
        return items
    return list(obj) if isinstance(obj, tuple) else []


def _as_dict(obj: Any) -> dict[str, Any]:
    if isinstance(obj, dict):
        return obj
    for attr in ("model_dump", "dict", "to_dict"):
        fn = getattr(obj, attr, None)
        if callable(fn):
            try:
                value = fn()
                if isinstance(value, dict):
                    return value
            except Exception:
                pass
    if hasattr(obj, "__dict__"):
        return dict(vars(obj))
    return {}


def _nested_value(obj: Any, *path: str) -> Any:
    cur = obj
    for key in path:
        if cur is None:
            return None
        if isinstance(cur, dict):
            cur = cur.get(key)
        else:
            cur = getattr(cur, key, None)
    return cur


def _extract_identity(seed: Any) -> dict[str, Any]:
    email = None
    name = None
    avatar = None
    label = None
    candidates = [seed, _nested_value(seed, "connection"), _nested_value(seed, "state")]
    for candidate in candidates:
        if not candidate:
            continue
        email = (
            email
            or _nested_value(candidate, "user", "email")
            or _nested_value(candidate, "account", "email")
            or _nested_value(candidate, "email")
        )
        name = (
            name
            or _nested_value(candidate, "user", "name")
            or _nested_value(candidate, "account", "name")
            or _nested_value(candidate, "name")
        )
        avatar = (
            avatar
            or _nested_value(candidate, "user", "picture")
            or _nested_value(candidate, "account", "avatar_url")
            or _nested_value(candidate, "avatar_url")
        )
        label = (
            label
            or _nested_value(candidate, "label")
            or _nested_value(candidate, "account_label")
        )
    return {
        "account_email": email,
        "account_name": name,
        "account_avatar_url": avatar,
        "account_label": label or email or name,
    }


async def get_client_and_user_id() -> tuple[Any, str | None]:
    cfg = await get_secrets_service().get_composio()
    api_key = cfg.get("api_key")
    user_id = cfg.get("user_id") or None
    if not api_key:
        raise ComposioNotConfigured("Composio API key is not configured")
    try:
        from composio import Composio
    except ImportError as exc:
        raise RuntimeError("Composio SDK is not installed") from exc
    return Composio(api_key=api_key), user_id


def _list_auth_configs(client: Any, toolkit_slug: str | None = None) -> list[Any]:
    try:
        resp = (
            client.auth_configs.list(limit=200, toolkit=toolkit_slug)
            if toolkit_slug
            else client.auth_configs.list(limit=200)
        )
        return _items(resp)
    except TypeError:
        items = _items(client.auth_configs.list())
        if not toolkit_slug:
            return items
        return [
            item
            for item in items
            if _nested_value(item, "toolkit", "slug") == toolkit_slug
            or _nested_value(item, "toolkit_slug") == toolkit_slug
        ]


async def list_connected_accounts() -> list[dict[str, Any]]:
    client, user_id = await get_client_and_user_id()

    def _list() -> list[Any]:
        resp = (
            client.connected_accounts.list(user_ids=[user_id])
            if user_id
            else client.connected_accounts.list()
        )
        return _items(resp)

    accounts = await asyncio.to_thread(_list)
    out: list[dict[str, Any]] = []
    for account in accounts:
        toolkit_slug = (
            _nested_value(account, "toolkit_slug")
            or _nested_value(account, "toolkit", "slug")
            or _nested_value(account, "toolkit")
        )
        identity = _extract_identity(account)
        out.append(
            {
                "id": _nested_value(account, "id"),
                "toolkit": toolkit_slug,
                "status": _nested_value(account, "status"),
                "user_id": _nested_value(account, "user_id"),
                "alias": _nested_value(account, "alias"),
                "created_at": _nested_value(account, "created_at"),
                **identity,
            }
        )
    out.sort(key=lambda item: (item.get("toolkit") or "", item.get("created_at") or ""))
    return out


async def list_toolkit_meta() -> dict[str, dict[str, Any]]:
    client, _user_id = await get_client_and_user_id()

    def _list() -> dict[str, dict[str, Any]]:
        resp = client.toolkits.list(limit=500)
        out: dict[str, dict[str, Any]] = {}
        for item in _items(resp):
            raw = _as_dict(item)
            slug = raw.get("slug") or _nested_value(item, "slug")
            if not slug:
                continue
            meta = (
                raw.get("meta")
                if isinstance(raw.get("meta"), dict)
                else _as_dict(_nested_value(item, "meta"))
            )
            out[slug] = {
                "slug": slug,
                "name": raw.get("name")
                or _nested_value(item, "name")
                or display_name_for(slug),
                "logo_url": meta.get("logo"),
                "description": meta.get("description"),
                "tool_count": meta.get("tools_count") or meta.get("toolsCount"),
            }
        return out

    return await asyncio.to_thread(_list)


async def list_toolkits_view() -> list[dict[str, Any]]:
    client, _user_id = await get_client_and_user_id()
    connected = await list_connected_accounts()
    meta = await list_toolkit_meta()

    def _configured() -> set[str]:
        out: set[str] = set()
        for item in _list_auth_configs(client):
            slug = _nested_value(item, "toolkit", "slug") or _nested_value(
                item, "toolkit_slug"
            )
            if slug:
                out.add(slug)
        return out

    configured = await asyncio.to_thread(_configured)
    by_toolkit: dict[str, list[dict[str, Any]]] = {}
    for account in connected:
        slug = account.get("toolkit") or "unknown"
        by_toolkit.setdefault(slug, []).append(account)

    out: list[dict[str, Any]] = []
    curated_slugs = {item.slug for item in CURATED_TOOLKITS}
    for item in CURATED_TOOLKITS:
        info = meta.get(item.slug, {})
        out.append(
            {
                "slug": item.slug,
                "display_name": item.display_name,
                "auth_mode": item.auth_mode,
                "has_auth_config": item.slug in configured,
                "logo_url": info.get("logo_url"),
                "description": info.get("description"),
                "tool_count": info.get("tool_count"),
                "connections": by_toolkit.get(item.slug, []),
            }
        )
    extras = sorted(slug for slug in by_toolkit if slug not in curated_slugs)
    for slug in extras:
        info = meta.get(slug, {})
        out.append(
            {
                "slug": slug,
                "display_name": info.get("name") or display_name_for(slug),
                "auth_mode": "byo" if slug in configured else "managed",
                "has_auth_config": slug in configured,
                "logo_url": info.get("logo_url"),
                "description": info.get("description"),
                "tool_count": info.get("tool_count"),
                "connections": by_toolkit.get(slug, []),
            }
        )
    return out


async def list_tools_for_toolkit(slug: str) -> list[dict[str, Any]]:
    client, _user_id = await get_client_and_user_id()

    def _list() -> list[dict[str, Any]]:
        tools = client.tools.get_raw_composio_tools(toolkits=[slug], limit=500)
        out: list[dict[str, Any]] = []
        for tool in tools or []:
            out.append(
                {
                    "slug": _nested_value(tool, "slug") or _nested_value(tool, "name"),
                    "name": _nested_value(tool, "name")
                    or _nested_value(tool, "slug")
                    or "unknown",
                    "description": _nested_value(tool, "description"),
                }
            )
        return out

    return await asyncio.to_thread(_list)


async def authorize_toolkit(slug: str, alias: str | None = None) -> dict[str, Any]:
    client, user_id = await get_client_and_user_id()
    if not user_id:
        raise ComposioNotConfigured("Composio user ID is not configured")

    def _authorize() -> dict[str, Any]:
        existing_configs = _list_auth_configs(client, slug)
        auth_config_id = (
            _nested_value(existing_configs[0], "id") if existing_configs else None
        )
        if not auth_config_id:
            try:
                created = client.auth_configs.create(
                    slug,
                    {
                        "type": "use_composio_managed_auth",
                        "name": f"{display_name_for(slug)} Auth Config",
                    },
                )
                auth_config_id = _nested_value(created, "id")
            except Exception as exc:
                status_code = getattr(exc, "status_code", None) or getattr(
                    exc, "status", None
                )
                if status_code == 400 or "auth config" in str(exc).lower():
                    raise ComposioNeedsAuthConfigError(slug, str(exc)) from exc
                raise
        active = [
            item
            for item in _items(
                client.connected_accounts.list(user_ids=[user_id], toolkit_slugs=[slug])
            )
            if _nested_value(item, "status") == "ACTIVE"
        ]
        req = client.connected_accounts.initiate(
            user_id,
            auth_config_id,
            allow_multiple=bool(active),
            alias=alias,
        )
        return {
            "toolkit": slug,
            "redirect_url": _nested_value(req, "redirect_url")
            or _nested_value(req, "redirectUrl")
            or _nested_value(req, "url")
            or str(req),
            "connection_id": _nested_value(req, "id"),
        }

    return await asyncio.to_thread(_authorize)


async def disconnect_connection(connection_id: str) -> None:
    client, _user_id = await get_client_and_user_id()
    await asyncio.to_thread(client.connected_accounts.delete, connection_id)


async def rename_connection(connection_id: str, alias: str) -> None:
    client, _user_id = await get_client_and_user_id()
    await asyncio.to_thread(
        client.connected_accounts.update, connection_id, alias=alias
    )


def _tool_text(tool: Any) -> str:
    return " ".join(
        str(part or "")
        for part in (
            _nested_value(tool, "slug"),
            _nested_value(tool, "name"),
            _nested_value(tool, "description"),
        )
    ).lower()


async def execute_toolkit_action(
    toolkit: str,
    *,
    required_terms: list[str],
    preferred_terms: list[str] | None = None,
    payloads: list[dict[str, Any]],
    connected_account_id: str | None = None,
) -> Any:
    client, user_id = await get_client_and_user_id()
    preferred_terms = preferred_terms or []

    def _execute() -> Any:
        account_id = connected_account_id
        if not account_id:
            active = [
                item
                for item in _items(
                    client.connected_accounts.list(
                        user_ids=[user_id], toolkit_slugs=[toolkit]
                    )
                )
                if _nested_value(item, "status") == "ACTIVE"
            ]
            if not active:
                raise RuntimeError(
                    f"No active {display_name_for(toolkit)} connection found"
                )
            if len(active) > 1:
                raise RuntimeError(
                    f"Multiple {display_name_for(toolkit)} accounts are connected. Pass composio_account_id explicitly."
                )
            account_id = _nested_value(active[0], "id")
        tools = client.tools.get_raw_composio_tools(toolkits=[toolkit], limit=500)
        best_tool = None
        best_score = -1
        for tool in tools or []:
            text = _tool_text(tool)
            if not all(term.lower() in text for term in required_terms):
                continue
            score = sum(1 for term in preferred_terms if term.lower() in text)
            if score > best_score:
                best_score = score
                best_tool = tool
        if best_tool is None:
            available = ", ".join(
                _nested_value(tool, "slug") or _nested_value(tool, "name") or "unknown"
                for tool in tools or []
            )
            raise RuntimeError(
                f"No matching Composio tool found for {toolkit}. Available tools: {available}"
            )
        tool_slug = _nested_value(best_tool, "slug") or _nested_value(best_tool, "name")
        last_error: Exception | None = None
        for payload in payloads:
            try:
                return client.tools.execute(
                    tool_slug,
                    payload,
                    connected_account_id=account_id,
                    user_id=user_id,
                    dangerously_skip_version_check=True,
                )
            except Exception as exc:
                last_error = exc
        if last_error is not None:
            raise last_error
        raise RuntimeError(f"Failed to execute Composio tool for {toolkit}")

    return await asyncio.to_thread(_execute)


def stringify_result(result: Any) -> str:
    if isinstance(result, str):
        return result
    payload = _as_dict(result)
    if payload:
        for key in ("data", "response_data", "result"):
            value = payload.get(key)
            if value is not None:
                payload = value if isinstance(value, dict) else {key: value}
                break
        try:
            return json.dumps(payload, ensure_ascii=True, default=str, indent=2)
        except TypeError:
            pass
    try:
        return json.dumps(result, ensure_ascii=True, default=str, indent=2)
    except TypeError:
        return str(result)
