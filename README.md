# Agentic Browser — Adaptive, Model-Agnostic Web Automation

### The Open Agent Browser Extension Powered by Python & MCP

> **Mission:** Build an intelligent browser agent that doesn’t just _understand_ the web — it _acts_ on it. Fully **model-agnostic**, **privacy-respecting**, and **BYOKeys-ready**.

---

## Overview

**Agentic Browser** is a **next-generation browser extension** powered by a **Python MCP (Model Context Protocol) server** that bridges modern LLM reasoning with real browser interactivity.

Unlike typical AI assistants, this agent:

- **Understands** complex web content,
- **Takes actions** (like filling forms, navigating, comparing data),
- And **adapts** to any preferred model backend — _OpenAI, Anthropic, Ollama, local LLaMA, Mistral, etc._

It’s your agent, your browser, your keys.

---

## Architecture

<img width="1973" height="1305" alt="image" src="https://github.com/user-attachments/assets/21dac6a5-c9d7-499a-8648-becdb4a04bba" />

### **Key Architectural Principles**

- **Model-Agnostic:** Works with any LLM backend that supports API-style calls (OpenAI-compatible, Anthropic, Ollama, LM Studio).
- **BYOKeys:** No vendor lock-in. Users supply their own API keys via `.env` or runtime UI input.
- **MCP-Compliant:** Uses the [Model Context Protocol](https://modelcontextprotocol.io) for secure and structured interaction.
- **Declarative Action System:** The model _declares_ browser actions (e.g. `click`, `fill_form`, `extract`), and the extension executes them safely.

---

## Core Objectives

### 1. Model-Agnostic Agent Backend

Create a flexible, LLM-agnostic backend using **Python**, **LangChain**, and the **Model Context Protocol (MCP)** framework.  
Allows seamless switching across models (OpenRouter, Ollama, Anthropic, OpenAI, or local inference models).

### 2. Secure Browser Extension

Design a robust and secure browser extension using the **WebExtensions API**, ensuring compatibility across Chrome, Firefox, and other Chromium-based browsers.

### 3. Advanced Agent Workflows

Support sophisticated agentic workflows through **Retrieval Augmented Generation (RAG)**, **persistent memory**, and **automated multi-step browsing tasks** like form filling, search synthesis, and citation retrieval.

### 4. Guardrails & Transparency

Implement strong **security and transparency layers**:

- User approval before every actionable operation
- Comprehensive activity logs
- Intelligent content filtering
- Safe domain allowlisting and IPI protection

### 5. Open-Source Extensibility

Adopt a modular, community-driven architecture encouraging open innovation and integration of new capabilities, workflows, and extensions over time.

---

## Technical Stack: Components & Technologies

| **Component**            | **Functionality**                                                                 | **Technologies / Frameworks**                            |
| ------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Agent Orchestration**  | Task planning, retrieval-augmented reasoning, complex multi-step workflows        | LangChain, LangGraph                                     |
| **Browser Control**      | DOM inspection, navigation, form filling, input injection, and content extraction | WebExtensions API (Chrome / Firefox)                     |
| **LLM Adapters**         | Model-agnostic routing, adapter layer for multi-provider compatibility            | OpenRouter, Ollama, Anthropic, OpenAI, Hugging Face APIs |
| **Backend Agent**        | Core logic execution, action orchestration, safety and state management           | Python MCP Server                                        |
| **Retrieval & Citation** | Web data extraction, embedding-based retrieval, factual grounding                 | Vector Databases (FAISS / Pinecone)                      |
| **Safety & Guardrails**  | Logging, data protection, domain-level security enforcement                       | Secure Audit System, Activity Logger                     |

---

## Core Features

### Model-Agnostic Intelligence

Works with any LLM provider — OpenAI, Anthropic, Mistral, Ollama, LM Studio, or custom deployments — using a unified adapter layer.

### Bring Your Own Keys (BYOKeys)

No vendor dependency. Users supply their own API keys securely via local `.env` or UI input; keys never leave local context.

### Web Interaction Engine

Real-time DOM inspection and manipulation for safe, human-approved automation — including form filling, data extraction, and structured web actions.

### Retrieval & Grounded Reasoning

Leverages RAG pipelines to incorporate external data and enhance factual grounding, improving contextual accuracy in responses.

### Secure Architecture

Every action is validated, logged, and requires explicit permission, ensuring responsible automation and explainability.

### Extensible Agent Tools

Developers can easily extend agent capabilities by adding Python tools, context managers, or new browser-side actions.

---

## Roadmap

- [ ] Add visual DOM debugger panel
- [ ] Multi-model round-robin support (reasoning blending)
- [ ] Offline LLM embedding-based retrieval
- [ ] GUI for managing keys/providers
- [ ] Fine-grained content permissions

---

## Contributing

Contributions are very welcome!  
If you’re into **LLM orchestration**, **WebExtension APIs**, or **intelligent web automation**, this project is an open canvas.

Please:

1. Fork the repo
2. Create a feature branch
3. Submit a well-documented PR

---

## License

Released under the **GPL 3 License** — free to modify, distribute, and extend with attribution.

---

## Key Features

### Browser Action Agent

Directly control the browser with natural language.

- **Command:** `/browser-action [instruction]`
- **Capabilities:**
  - `navigate`: Go to any URL.
  - `click`: Intelligent element targeting.
  - `type`: Fill forms and inputs.
  - `scroll`: Page navigation.
  - **Dynamic Script Generation:** The agent generates safe, executable JavaScript to perform actions on the active tab.

### Advanced Search & Retrieval

- **Tavily Search API:** Powered by **Tavily** for high-quality, hallucination-free web results.
- **RAG Architecture:** Fetches, reads, and synthesizes content from multiple sources.

### Multi-Session Chat

- **Persistent History:** never lose a context. Chats are saved locally and persist across reloads.
- **Session Management:** Create new chats, switch between history, and delete old sessions via the sidebar.
- **Context Awareness:** The agent is aware of your active tab and can answer questions about it.

### Slash Commands & Tools

Quickly access specific capabilities:

- `/browser-action`: Execute browser automation tasks.
- `/react-ask`: Chat with the React ReAct agent.
- `/google-search`: Perform a quick web search.
- `/gmail-unread`: Check unread emails.
- `/calendar-events`: View upcoming schedule.
- `/youtube-ask`: Q&A with YouTube videos.

---

## Architecture Updated

<img width="1973" height="1305" alt="image" src="https://github.com/user-attachments/assets/21dac6a5-c9d7-499a-8648-becdb4a04bba" />

### **Core Components**

- **Extension (React/Vite):** Smart UI with Sidepanel, Multi-session management, and WebSocket client.
- **Backend (Python/FastAPI):**
  - **Graph Agent:** LangGraph-based orchestration.
  - **Tools:** extensive library including Gmail, Calendar, GitHub, and **PyJIIT**.
  - **Browser Agent:** Specialized tool for generating DOM-manipulation scripts.
