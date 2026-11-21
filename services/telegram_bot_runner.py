"""Runs the Telegram bot as a background asyncio task inside the API server.

Called from main.py lifespan so that `uv run main.py` starts both the
FastAPI server and the bot together.  The bot is skipped silently when no
token is configured.
"""
from __future__ import annotations

import asyncio
import pathlib
import sys

from core import get_logger

logger = get_logger(__name__)

# Make the sibling bot modules (handlers, store, backend, config) importable.
_BOT_DIR = pathlib.Path(__file__).parent.parent / "clients" / "telegram-bot"
if str(_BOT_DIR) not in sys.path:
    sys.path.insert(0, str(_BOT_DIR))


async def run_telegram_bot() -> None:
    """Resolve token, build PTB Application, poll until cancelled."""
    from services.secrets_service import get_secrets_service

    token = await get_secrets_service().resolve("telegram_bot_token")
    if not token:
        logger.info("Telegram bot: no token configured — skipping.")
        return

    from telegram.ext import ApplicationBuilder

    import handlers
    import store

    await store.init()

    application = ApplicationBuilder().token(token).build()
    handlers.register(application)
    if not await handlers._allowed_users():
        logger.warning(
            "Telegram bot: no TELEGRAM_ALLOWED_USERS set. Anyone who finds the bot can ask it questions; "
            "browser tasks and Composio actions stay off until you add your user id (send it /whoami)."
        )

    logger.info("Telegram bot: starting polling.")
    async with application:
        await application.start()
        if application.updater:
            await application.updater.start_polling()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            pass
        finally:
            if application.updater:
                await application.updater.stop()
            await application.stop()
    logger.info("Telegram bot: stopped.")
