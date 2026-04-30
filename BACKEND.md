# Agentic Browser Backend Documentation

This document provides a detailed technical overview of the **Agentic Browser** backend, which includes a **FastAPI** web server and an **MCP (Model Context Protocol)** server.

---

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Installation & Setup](#installation--setup)
3. [Running the Servers](#running-the-servers)
4. [FastAPI Endpoints](#fastapi-endpoints)
5. [MCP Server & Tools](#mcp-server--tools)
6. [Environment Variables](#environment-variables)

---

## Prerequisites
- **Python 3.12+**
- **uv** (recommended for dependency management)

---

## Installation & Setup

1. **Clone the repository** (if not already done).
2. **Install dependencies** using `uv`:
   ```bash
   uv sync
   ```
3. **Configure Environment Variables**:
   Create a `.env` file in the root directory and add your API keys (see [Environment Variables](#environment-variables)).

---

## Running the Servers

The project uses a unified entry point in `main.py` to start either the API or the MCP server.

### 1. Run as FastAPI Server
The FastAPI server handles requests from the browser extension and other clients.
```bash
uv run main.py --api
# Or directly via uvicorn:
uvicorn api.main:app --reload --host 0.0.0.0 --port 5454
```

### 2. Run as MCP Server
The MCP server communicates over `stdio` and can be used by MCP-compliant clients (like Claude Desktop).
```bash
uv run main.py --mcp
# Or:
python -m mcp_server.server
```

### 3. Interactive Mode
If no flags are provided, the script will prompt you:
```bash
uv run main.py
```

---

## FastAPI Endpoints

The API is hosted on port `5454` by default.

| Category | Prefix | Description |
| :--- | :--- | :--- |
| **Health** | `/api/genai/health` | Service health check. |
| **Chat/Agent** | `/api/genai/react` | ReAct agent for complex tasks. |
| **Browser** | `/api/agent` | Specialized browser automation agent. |
| **GitHub** | `/api/genai/github` | Repository analysis and Q&A. |
| **Website** | `/api/genai/website` | Fetching and converting web content. |
| **Search** | `/api/google-search` | Web search integration. |
| **Gmail** | `/api/gmail` | Email management (list, read, send). |
| **Calendar** | `/api/calendar` | Event management (list, create). |
| **YouTube** | `/api/genai/youtube` | Information and subtitles extraction. |
| **Other** | `/api/pyjiit`, `/api/validator`, `/api/upload`, `/api/skills`, `/api/auth`, `/api/voice` | Specialized services. |

---

## MCP Server & Tools

The MCP server exposes several tools that allow LLMs to interact with the environment.

### Available Tools:
1. **`llm.generate`**: Generate text using configured providers (Google, OpenAI, Anthropic, Ollama, DeepSeek, OpenRouter).
2. **`github.answer`**: Answer questions about a repository based on provided context/tree.
3. **`website.fetch_markdown`**: Fetch markdown content for a URL via Jina proxy.
4. **`website.html_to_md`**: Convert raw HTML strings to clean markdown.

---

## Environment Variables

Key variables required in your `.env` file:

```bash
# LLM Providers
GOOGLE_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
OPENROUTER_API_KEY=your_key_here

# Local LLM
OLLAMA_BASE_URL=http://localhost:11434

# Tools & Services
TAVILY_API_KEY=your_key_here
# (Add other service-specific keys as needed)
```

---
*Documentation generated based on the current implementation of `api/main.py` and `mcp_server/server.py`.*
