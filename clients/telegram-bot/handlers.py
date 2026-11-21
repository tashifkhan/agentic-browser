import asyncio
import base64
import io
import logging

from telegram import Update
from telegram.constants import ChatAction, ParseMode
from telegram.error import BadRequest
from telegram.ext import Application, CommandHandler, ContextTypes, MessageHandler, filters

import backend
import store

logger = logging.getLogger(__name__)


async def _allowed_users() -> set[str]:
    from services.secrets_service import get_secrets_service

    raw = await get_secrets_service().resolve("telegram_allowed_users")
    return {u.strip() for u in (raw or "").split(",") if u.strip()}


async def _access(update: Update) -> str:
    """'owner' (on the allow list), 'open' (no list set: questions only) or
    'denied' (a list is set and this user isn't on it)."""
    user = update.effective_user
    allowed = await _allowed_users()
    if not allowed:
        return "open"
    return "owner" if user and str(user.id) in allowed else "denied"


_SETUP_HINT = (
    "To let this bot work in your browser, add your Telegram user id ({uid}) to "
    "Settings → Telegram bot → Allowed users in the console, or set TELEGRAM_ALLOWED_USERS={uid}."
)


async def _keep_typing(bot, chat_id: int, stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            await bot.send_chat_action(chat_id=chat_id, action=ChatAction.TYPING)
        except Exception:
            pass
        await asyncio.sleep(4)


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.effective_message
    if not message or not message.text:
        return

    access = await _access(update)
    if access == "denied":
        await message.reply_text("This bot is private.")
        return

    chat_id = message.chat_id
    question = message.text

    # Resolve conversation thread
    conversation_id: str | None = None
    reply = message.reply_to_message
    if reply and reply.from_user and reply.from_user.is_bot:
        conversation_id = await store.get(reply.message_id)

    # Typing indicator
    stop_event = asyncio.Event()
    typing_task = asyncio.create_task(_keep_typing(context.bot, chat_id, stop_event))

    try:
        result = await backend.stream_response(question, conversation_id, remote_actions=access == "owner")
    finally:
        stop_event.set()
        typing_task.cancel()
        try:
            await typing_task
        except asyncio.CancelledError:
            pass

    if result.error:
        await message.reply_text(f"⚠️ {result.error}")
        return

    # Build response text
    text = result.answer or "_(no response)_"
    if result.tool_calls:
        tools_line = " · ".join(result.tool_calls)
        text += f"\n\n──────────────────\n🔧 Tools used: {tools_line}"
    if "browser_task" in result.tool_calls:
        text += "\nSend /screenshot to see the browser."

    # Send with Markdown, fall back to plain text if parsing fails
    sent = None
    try:
        sent = await message.reply_text(text, parse_mode=ParseMode.MARKDOWN)
    except BadRequest as exc:
        logger.warning("Markdown parse failed (%s), retrying as plain text.", exc)
        try:
            sent = await message.reply_text(text)
        except Exception as exc2:
            logger.error("Failed to send reply: %s", exc2)
            return

    # Store bot_message_id → conversation_id for thread continuity
    if sent and result.conversation_id:
        await store.save(sent.message_id, result.conversation_id)


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    access = await _access(update)
    uid = update.effective_user.id if update.effective_user else "?"
    if access == "denied":
        await update.effective_message.reply_text("This bot is private.")
        return
    lines = [
        "Ask me anything, or tell me to do something in your browser, like "
        "\"check my GitHub notifications\" or \"find a table for two at 8 on Zomato\".",
        "Reply to one of my messages to continue that thread.",
        "/screenshot shows the browser's current tab. /stop stops a running browser task.",
    ]
    if access == "open":
        lines.append("")
        lines.append("Right now I can only answer questions. " + _SETUP_HINT.format(uid=uid))
    await update.effective_message.reply_text("\n".join(lines))


async def cmd_whoami(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    uid = update.effective_user.id if update.effective_user else "?"
    access = await _access(update)
    status = {"owner": "You're on the allow list.", "open": _SETUP_HINT.format(uid=uid), "denied": "You're not on the allow list."}[access]
    await update.effective_message.reply_text(f"Your Telegram user id is {uid}.\n{status}")


async def cmd_screenshot(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if await _access(update) != "owner":
        await update.effective_message.reply_text("Only allowed users can see the browser.")
        return
    from mcp_server.bridge import BridgeError, manager

    try:
        shot = await manager.call("page.screenshot", {}, timeout=20)
        tabs = await manager.call("tabs.list", {}, timeout=10)
    except BridgeError as exc:
        await update.effective_message.reply_text(f"Couldn't reach the browser: {exc}")
        return
    data_url = (shot or {}).get("dataUrl") or ""
    if "," not in data_url:
        await update.effective_message.reply_text("The browser didn't send a screenshot.")
        return
    active = next((t for t in tabs or [] if t.get("id") == shot.get("tabId")), None) if isinstance(tabs, list) else None
    caption = f"{active.get('title', '')}\n{active.get('url', '')}".strip() if active else None
    photo = io.BytesIO(base64.b64decode(data_url.split(",", 1)[1]))
    photo.name = "browser.jpg"
    await update.effective_message.reply_photo(photo=photo, caption=caption[:1000] if caption else None)


async def cmd_stop(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if await _access(update) != "owner":
        await update.effective_message.reply_text("Only allowed users can stop browser tasks.")
        return
    from mcp_server.bridge import BridgeError, manager

    try:
        await manager.call("task.stop", {}, timeout=10)
        await update.effective_message.reply_text("Stopping after the current step.")
    except BridgeError as exc:
        await update.effective_message.reply_text(f"Couldn't reach the browser: {exc}")


def register(app: Application) -> None:
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("help", cmd_start))
    app.add_handler(CommandHandler("whoami", cmd_whoami))
    app.add_handler(CommandHandler("screenshot", cmd_screenshot))
    app.add_handler(CommandHandler("stop", cmd_stop))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
