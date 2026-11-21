# Telegram Bot

Python Telegram bot client for the Agentic Browser backend.

Each message starts a new conversation thread. Replying to a bot message continues that thread.
Typing indicators are shown while the agent generates. Tool calls used are summarised at the bottom of each response.

## Setup

1. Create a bot via [@BotFather](https://t.me/BotFather) and copy the token.
2. Copy the example env file and fill in your token:
   ```bash
   cp clients/telegram-bot/.env.example clients/telegram-bot/.env
   # edit .env and set TELEGRAM_BOT_TOKEN
   ```
3. Install deps (from repo root):
   ```bash
   uv sync
   # or: pip install -e .
   ```

## Run

From the repo root, with the backend already running (`python main.py`):

```bash
python clients/telegram-bot/bot.py
```

## Doing things from your phone

Tell the bot to do something and it does it in your browser, where you're already logged in:
"check my GitHub notifications", "find a table for two at 8 on Zomato", "what's the top story on HN
and how many comments does it have". The backend sends the task to the extension over the local
bridge, the same planner loop the side panel uses runs in a tab, and the answer comes back here.
Apps connected through Composio (Slack, Notion, Linear, GitHub...) are used directly when they fit
better than the browser.

This needs the browser running with the extension, and your Telegram user id on the allow list.

| Command | What it does |
|---|---|
| `/start`, `/help` | What the bot can do, and whether you're set up |
| `/whoami` | Your Telegram user id, for the allow list |
| `/screenshot` | A screenshot of the browser's current tab, with its title and URL |
| `/stop` | Stops a running browser task after its current step |

## Who can use it

Set `TELEGRAM_ALLOWED_USERS` (or Settings → Telegram bot → Allowed users in the console) to your
user id, from `/whoami`. Then the bot ignores everyone else, and only listed users can run browser
tasks and Composio actions. With no list, anyone who finds the bot can ask it questions, but nobody
can act through your browser or apps.

## Conversation threading

| Scenario | Behaviour |
|---|---|
| New message | Fresh conversation — full agent context reset |
| Reply to a bot message | Continues the same conversation — history preserved |
| Reply to your own message | Treated as a new conversation |

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | — | **Required.** Token from @BotFather |
| `TELEGRAM_ALLOWED_USERS` | empty | Comma-separated Telegram user ids allowed to use the bot and run actions |
| `BACKEND_URL` | `http://localhost:5454` | URL of the Agentic Browser backend |
