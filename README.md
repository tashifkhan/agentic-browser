# Agentic Browser - Model-Agnostic Web Automation

### The Open Agent Browser Extension Powered by Python & MCP

> **Mission:** Build an intelligent browser agent that doesn’t just *understand* the web — it *acts* on it. Fully **model-agnostic**, **privacy-respecting**, and **BYOKeys-ready**.

---

## Overview

**Agentic Browser** is a **next-generation browser extension** powered by a **Python MCP (Model Context Protocol) server** that bridges modern LLM reasoning with real browser interactivity. 

Unlike typical AI assistants, this agent:
- **Understands** complex web content via real-time DOM inspection.
- **Takes actions** such as filling forms, navigating, comparing data, and executing custom scripts.
- **Adapts** to any model backend — *OpenAI, Anthropic, Ollama, local LLaMA, Mistral, and more.*

---

## Architecture

<img width="1973" height="1305" alt="Agentic Browser Architecture" src="https://github.com/user-attachments/assets/21dac6a5-c9d7-499a-8648-becdb4a04bba" />

### **Key Principles**
- **Model-Agnostic:** Seamlessly switch between LLM providers (OpenAI, Anthropic, Ollama, LM Studio).
- **BYOKeys:** Full privacy. Your keys, your local context, no vendor lock-in.
- **MCP-Compliant:** Leverages the [Model Context Protocol](https://modelcontextprotocol.io) for secure, structured tool interaction.
- **Safe Execution:** Declarative action system with mandatory user approval for browser operations.

---

## Technical Stack

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Frontend** | React, Vite, WXT | High-performance, intelligent sidepanel UI |
| **Agent Core** | LangGraph, LangChain | Orchestration of complex multi-step workflows |
| **Backend** | Python (FastAPI), MCP | Core logic, tool execution, and state management |
| **Browser Control** | WebExtensions API | Secure DOM manipulation and tab management |
| **Safety** | Permission Guards | Per-action approval and comprehensive logging |

---

## Monorepo Layout

```text
clients/
  browser-extension/   # WXT browser extension client
  debug-web/           # Vite debug dashboard client
  telegram-bot/        # Future Python Telegram client

agents/
core/
mcp_server/
models/
routers/
services/
main.py                # Root Python backend entrypoint
pyproject.toml         # Root Python package metadata
pnpm-workspace.yaml    # Frontend workspace definition
```

## Workspace Commands

```bash
pnpm install
pnpm dev:debug
pnpm dev:extension
pnpm build:debug
pnpm build:extension
```

The Python backend stays at the repository root and is still managed through `pyproject.toml` and `uv.lock`.

---

## Use your browser from Claude Code, Codex, T3 Code and other MCP clients

The extension can be driven by any coding agent that speaks MCP. The agent works in your real Chrome, with your logins, through a small local bridge.

```text
Claude Code / Codex / T3 Code / Cursor / OpenCode
        │  MCP (stdio, or HTTP at 127.0.0.1:5455/mcp)
        ▼
agentic-mcp  ──  bridge on 127.0.0.1:5455
        ▲  WebSocket /bridge/ws (the extension dials out)
        │
Agentic Browser extension  ──  chrome.debugger + content scripts  ──  your tabs
```

Setup takes three steps:

1. Build the extension (`pnpm build:extension`) and load `clients/browser-extension/.output/chrome-mv3` as an unpacked extension in Chrome.
2. Install the MCP server. You don't need the full backend for this:
   ```bash
   uv tool install ./mcp_server     # only the MCP server and its few dependencies
   # or, inside a full checkout: uv sync
   ```
3. Register it with your agents:
   ```bash
   agentic-mcp install              # finds Claude Code, Codex, Cursor, Gemini CLI, OpenCode
   agentic-mcp install --dry-run    # show the changes first
   agentic-mcp config               # print snippets to paste by hand
   ```
   T3 Code runs Claude Code and Codex, so it uses whatever you register for those two.

Each MCP client starts `agentic-mcp` over stdio. The first one to start binds `127.0.0.1:5455` and becomes the bridge. Any later ones relay through it, using a token in `~/.agentic-browser/bridge-token`. The backend (`agentic-api-run`) also starts the bridge when it boots, so the extension and backend can run together. To keep an HTTP endpoint up for clients that only support URLs, run `agentic-mcp serve`.

The extension's settings panel has an "MCP Bridge" section with the connection status and a URL override. `agentic-mcp status` shows the same thing from the terminal.

### Tools

There are four tools, on purpose:

| Tool | What it does |
| :--- | :--- |
| `browser_tabs` | List, open, close or focus tabs. Tabs the agent opens go in an "Agent" tab group. |
| `browser_snapshot` | Accessibility outline of a tab with `[ref=e12]` handles, including iframes (`f3e1`). Can add a screenshot. |
| `browser_act` | One action on a ref, CSS selector or `text=Label`: click, type, press, select, check, hover, scroll, navigate, back, forward, reload, wait_for, evaluate, or answering a dialog. |
| `browser_execute` | Code mode. Runs a JavaScript program against a `browser` / `tab` API, so ten steps cost one tool call and only the data you return goes back to the model. |

`browser_execute` runs in a QuickJS sandbox inside `agentic-mcp`. Scripts get no network, file system or Node APIs. Each burst of JS between browser calls is capped at 5 seconds, which kills infinite loops. A `state` object carries data between calls.

```js
const t = await browser.open("https://news.ycombinator.com");
return await t.evaluate(() =>
  [...document.querySelectorAll(".titleline > a")].slice(0, 5).map(a => a.textContent));
```

Set `AGENTIC_BROWSER_TOOLS=execute` to expose only `browser_tabs` and `browser_execute`, or `plain` to hide `browser_execute`.

Clicks, typing and key presses go through `chrome.debugger`, so pages see trusted input events. While it's attached, Chrome shows a "started debugging this browser" bar, which goes away after 90 seconds of inactivity. If the debugger can't attach (DevTools is open, or you're in Firefox), the extension falls back to DOM events.

### Security

- The bridge listens only on 127.0.0.1.
- WebSocket connections are accepted only from `chrome-extension://` and `moz-extension://` origins. To allow only your build, set `AGENTIC_BROWSER_EXTENSION_IDS` to a comma-separated list of extension IDs.
- `/mcp` rejects cross-site `Origin` and foreign `Host` headers, which blocks DNS rebinding.
- The relay endpoint needs the token in `~/.agentic-browser/bridge-token` (file mode 0600).

---

## Slash Commands & Tools

| Command | Capability |
| :--- | :--- |
| `/browser-action` | Execute UI automation (click, type, scroll, navigate) |
| `/voice` | Enter voice interaction mode |
| `/react-ask` | Engage with the ReAct reasoning agent |
| `/google-search` | Rapid web search via multi-provider adapters |
| `/gmail-unread` | Check and summarize your unread emails |
| `/calendar-events` | View and manage your upcoming schedule |
| `/youtube-ask` | Interactive Q&A with video transcripts |
| `/pyjiit-attendance`| Check academic portal attendance |

---

## Roadmap

- [ ] **Offline Mode**: Local embedding-based RAG using lightweight models - Gemma 4 uncensored
- [ ] **Light Mode**: For Presemtation
- [ ] **Skills**: Open Skill Support for stuff like PPT and XLSX
- [ ] **Grpaph RAG**: For important documents like Resume and Gmail mails
- [ ] **Memory  System**: To have persistant Memory and other relevant Facts
- [ ] **Github Integration**: Right its leading to Context rott so need shit with proper tool call and all will use Pi (hopefully)
- [ ] **While True**: Tool called Orgestrated model for the agent.
- [ ] **Telegram / External Chat Support**: use to ask question plus options to switch context or something or atleasr a standalone app for this shit
- [ ] **Computer Use**: Use computer also instead of just the browser
- [ ] **Website / Native App**: To use it beyond tradition browser usecases
- [ ] **Form Filling / Browser Action**: To take actions till the time shit is not resolved - Infinite Loop
- [ ] **Multi Modal**: Image support
- [ ] **Remote Actions**: from phone
- [ ] **Playwrite**: To take actions from the app itself
- [ ] **Compaction**: adding compaction for long chats
- [ ] **Model Blending**: Reasoning pipelines that utilize multiple models for verification.
- [ ] **Visual Debugger**: Real-time DOM element highlighting during agent actions.
- [ ] **Workflow Designer**: Create and share custom agentic browsing workflows.
- [x] **MCP Support**: `agentic-mcp` drives the extension from Claude Code, Codex, T3 Code and other MCP clients (see above)
