import sys
import pathlib

_BOT_DIR = pathlib.Path(__file__).parent
_REPO_ROOT = _BOT_DIR.parent.parent

# Make both the bot dir (siblings) and the repo root (core.*, models.*, etc.) importable.
for _p in (_BOT_DIR, _REPO_ROOT):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

import logging

from telegram.ext import Application, ApplicationBuilder

from config import settings, logger as _cfg_logger
import store
import handlers

logging.basicConfig(
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


async def _post_init(app: Application) -> None:
    await store.init()
    logger.info("Session store (telegram_sessions) ready.")


def main() -> None:
    app = (
        ApplicationBuilder()
        .token(settings.telegram_bot_token)
        .post_init(_post_init)
        .build()
    )
    handlers.register(app)
    logger.info("Bot starting — polling for updates.")
    app.run_polling()


if __name__ == "__main__":
    main()
