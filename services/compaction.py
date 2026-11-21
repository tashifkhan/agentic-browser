"""Compaction: keep long chats inside the model's context window.

Chats used to be cut to their last 20 messages, so anything older silently
vanished. Now the whole conversation is loaded (up to `max_history`
messages). When it doesn't fit the budget, the recent turns stay word for
word and everything older is folded into a running summary, which is stored
on the conversation (metadata.compaction) and extended, not redone, on later
turns.

The budget is `trigger_ratio` of the picked model's context window
(models.dev), or `budget_tokens` when set. Settings live in the AppSetting
"chat.compaction" and are edited in the console (Settings → Model).

trim_tool_outputs() is the in-run half: during one long agent run, old tool
results are cut down when the messages outgrow the budget.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from core import get_logger

logger = get_logger(__name__)

SETTING_KEY = "chat.compaction"
DEFAULTS: dict[str, Any] = {
    "enabled": True,
    "trigger_ratio": 0.5,  # of the model's context window
    "budget_tokens": None,  # fixed budget instead of the ratio
    "keep_recent": 8,  # messages always kept verbatim
    "max_history": 400,  # messages loaded per conversation
}
FALLBACK_CONTEXT = 128_000
SUMMARY_ROLE = "summary"

_SUMMARY_PROMPT = """\
You keep the running notes for a long chat between a user and their browser agent. The notes
replace the older messages, so anything you leave out is gone for good.

Write the notes in the third person ("The user..."), as short bullet points under these headings,
skipping empty ones:
- Facts and preferences the user stated
- What was asked and done (with the results: numbers, names, prices, versions, URLs, ids, file paths)
- Decisions made
- Open threads: questions not yet answered, tasks not finished, promises made

Keep every concrete detail someone might need later. Drop greetings, filler and repetition.
Stay under 900 words. Reply with the notes only.
"""


def estimate_tokens(text: str) -> int:
    return len(text) // 4 + 1


def _tokens(messages: list[dict[str, Any]]) -> int:
    return sum(estimate_tokens(str(m.get("content") or "")) + 4 for m in messages)


async def load_settings() -> dict[str, Any]:
    out = dict(DEFAULTS)
    try:
        from services.app_state import AppStateService

        saved = await AppStateService().get_setting(SETTING_KEY)
        if isinstance(saved, dict):
            out.update({k: v for k, v in saved.items() if k in DEFAULTS})
    except Exception:
        pass
    return out


async def save_settings(update: dict[str, Any]) -> dict[str, Any]:
    from services.app_state import AppStateService

    current = await load_settings()
    for key, value in update.items():
        if key in DEFAULTS:
            current[key] = value
    await AppStateService().set_setting(SETTING_KEY, current)
    return current


async def budget_tokens(settings: Optional[dict[str, Any]] = None) -> int:
    settings = settings or await load_settings()
    if settings.get("budget_tokens"):
        return int(settings["budget_tokens"])
    context = FALLBACK_CONTEXT
    try:
        from core.llm import get_default_llm
        from core.model_catalog import model_info

        model = get_default_llm()
        info = await model_info(model.provider, model.model_name)
        if info and info.get("context"):
            context = int(info["context"])
    except Exception:
        pass
    return max(4_000, int(context * float(settings.get("trigger_ratio") or 0.5)))


def _transcript(messages: list[dict[str, Any]], limit: int = 6_000) -> str:
    lines = []
    for m in messages:
        text = str(m.get("content") or "").strip()
        if len(text) > limit:
            text = text[: limit // 2] + "\n[...]\n" + text[-limit // 2 :]
        lines.append(f"{m.get('role', 'user')}: {text}")
    return "\n\n".join(lines)


async def _summarise(previous: Optional[str], messages: list[dict[str, Any]]) -> str:
    from langchain_core.messages import HumanMessage, SystemMessage

    from core.llm import get_default_llm

    body = ""
    if previous:
        body += f"Notes so far:\n{previous}\n\nNewer messages to fold in:\n"
    body += _transcript(messages)
    reply = await get_default_llm().client.ainvoke([SystemMessage(content=_SUMMARY_PROMPT), HumanMessage(content=body)])
    content = reply.content
    if isinstance(content, list):
        content = "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in content)
    return str(content).strip()


def _clip_message(m: dict[str, Any], max_tokens: int) -> dict[str, Any]:
    text = str(m.get("content") or "")
    if estimate_tokens(text) <= max_tokens:
        return m
    keep = max_tokens * 4 // 2
    return {**m, "content": f"{text[:keep]}\n[... {len(text) - 2 * keep} characters cut to fit the context ...]\n{text[-keep:]}"}


async def compact_history(conversation_id: str, history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The history to send: unchanged if it fits, otherwise a summary entry
    (role "summary", with a "compaction" field describing what happened)
    followed by the recent messages."""
    settings = await load_settings()
    if not settings.get("enabled") or not history:
        return history
    budget = await budget_tokens(settings)
    if _tokens(history) <= budget:
        return history

    keep_n = max(2, int(settings.get("keep_recent") or 8))
    recent = history[-keep_n:]
    older = history[:-keep_n]
    # Recent turns get at most 60% of the budget between them.
    per_message = max(500, int(budget * 0.6) // max(1, len(recent)))
    recent = [_clip_message(m, per_message) for m in recent]
    if not older:
        return recent

    from services.conversations import ConversationService

    svc = ConversationService()
    conv = await svc.get_conversation(conversation_id) or {}
    stored = ((conv.get("metadata") or {}).get("compaction") or {}) if isinstance(conv, dict) else {}
    through = stored.get("through_message_id")
    ids = [m.get("message_id") for m in older]
    summary = stored.get("summary") if through in ids else None
    fresh = older[ids.index(through) + 1 :] if summary else older

    if fresh:
        try:
            summary = await _summarise(summary, fresh)
        except Exception as exc:
            logger.warning("Compaction failed for %s, sending recent messages only: %s", conversation_id, exc)
            return recent
        record = {
            "summary": summary,
            "through_message_id": older[-1].get("message_id"),
            "messages_summarised": len(older),
            "at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            await svc.update_metadata(conversation_id, {"compaction": record})
        except Exception as exc:
            logger.warning("Couldn't store compaction summary for %s: %s", conversation_id, exc)

    info = {
        "messages_summarised": len(older),
        "summarised_now": len(fresh),
        "kept": len(recent),
        "budget_tokens": budget,
        "summary_tokens": estimate_tokens(summary or ""),
    }
    logger.info("Compacted %s: %s", conversation_id, info)
    return [{"role": SUMMARY_ROLE, "content": summary or "", "compaction": info}, *recent]


def summary_preamble(summary: str) -> str:
    return (
        "Earlier parts of this conversation were summarised to fit the context window. "
        "Treat these notes as what was said before:\n\n" + summary
    )


def trim_tool_outputs(messages: list[Any], budget: int, keep_last: int = 4, head: int = 1_500) -> list[Any]:
    """Within one run: when LangChain messages outgrow the budget, cut the
    content of older tool results (the newest `keep_last` stay whole)."""
    from langchain_core.messages import ToolMessage

    def size(m: Any) -> int:
        c = m.content
        return estimate_tokens(c if isinstance(c, str) else str(c))

    if sum(size(m) for m in messages) <= budget:
        return messages
    tool_idx = [i for i, m in enumerate(messages) if isinstance(m, ToolMessage)]
    out = list(messages)
    for i in tool_idx[:-keep_last] if keep_last else tool_idx:
        m = out[i]
        text = m.content if isinstance(m.content, str) else str(m.content)
        if len(text) > head * 2:
            out[i] = ToolMessage(
                content=f"{text[:head]}\n[... {len(text) - head} characters of this older tool result trimmed to fit the context ...]",
                tool_call_id=m.tool_call_id,
                name=m.name,
            )
        if sum(size(x) for x in out) <= budget:
            break
    return out
