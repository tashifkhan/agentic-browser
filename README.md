# agentic-browser

FastAPI backend and MCP server exposing your LLM, GitHub prompt chain, and website tools.

## Run the FastAPI backend

Requirements: Python 3.12+

1. Install deps

```bash
uv sync
```

2. Set env as needed

```bash
export GOOGLE_API_KEY=...
export OPENAI_API_KEY=...
export ANTHROPIC_API_KEY=...
export OLLAMA_BASE_URL=http://localhost:11434
```

3. Start server

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 5454
```

Endpoints:

- GET /health
- POST /v1/chat/generate
- POST /v1/github/answer
- POST /v1/website/markdown
- POST /v1/website/html-to-md

## Run the MCP server

The MCP server communicates over stdio. Many MCP clients can launch it directly.

Entrypoint: `python -m mcp_server.server` or the script `agentic-mcp` if installed as a package.

Tool names:

- llm.generate
- github.answer
- website.fetch_markdown
- website.html_to_md

Input schemas are defined in the server, aligning with the FastAPI payloads.
