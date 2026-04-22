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
- [ ] **MCP Support**: maybe
