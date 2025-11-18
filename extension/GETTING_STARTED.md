# 🚀 Getting Started Guide - AI Extension

Complete setup guide for the AI-powered browser automation extension with LangChain agents and RAG-based learning.

---

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Architecture Overview](#architecture-overview)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the System](#running-the-system)
- [Usage Guide](#usage-guide)
- [Troubleshooting](#troubleshooting)
- [Advanced Features](#advanced-features)

---

## 🔧 Prerequisites

### Required Software

1. **Node.js & npm** (v18 or higher)
   ```bash
   node --version  # Should be v18+
   npm --version
   ```

2. **Python** (v3.10 or higher)
   ```bash
   python --version  # Should be 3.10+
   ```

3. **Ollama** (for local embeddings)
   - Download from: https://ollama.ai
   - Install the `embeddinggemma:latest` model:
   ```bash
   ollama pull embeddinggemma:latest
   ```

4. **Chrome/Edge Browser** (Latest version)
   - Extension requires Chromium-based browser

### Required API Keys

1. **Groq API Key** (for LLM agent)
   - Sign up at: https://console.groq.com
   - Get your API key from dashboard

2. **Google Gemini API Key** (optional, for traditional features)
   - Get from: https://makersuite.google.com/app/apikey

3. **LangSmith API Key** (optional, for tracing)
   - Sign up at: https://smith.langchain.com

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    BROWSER EXTENSION                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Sidepanel  │  │  Background  │  │    Content   │      │
│  │   (React)    │◄─┤   Service    │◄─┤    Script    │      │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘      │
│         │                  │                                 │
└─────────┼──────────────────┼─────────────────────────────────┘
          │                  │
          │ WebSocket        │ Browser API Calls
          │                  │
┌─────────▼──────────────────▼─────────────────────────────────┐
│                  PYTHON BACKEND (Flask)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Server.py  │  │  LangChain   │  │     RAG      │      │
│  │ (SocketIO)   │◄─┤    Agent     │◄─┤   (FAISS)    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                            │                  │               │
│                    ┌───────▼──────────────────▼───────┐      │
│                    │    26 Browser Tools              │      │
│                    │ (Click, Type, Navigate, etc.)    │      │
│                    └──────────────────────────────────┘      │
└───────────────────────────────────────────────────────────────┘
                            │
                    ┌───────▼───────┐
                    │  Groq API     │
                    │  (LLM Model)  │
                    └───────────────┘
```

### Key Components

- **Extension (WXT Framework)**: Browser UI, WebSocket client, tool execution
- **Python Backend**: Flask-SocketIO server, LangChain agent orchestration
- **RAG System**: FAISS vector store with intelligent chunking for learning
- **26 Browser Tools**: Comprehensive automation (click, type, navigate, cookies, etc.)
- **Real-time Communication**: WebSocket bidirectional messaging

---

## 📦 Installation

### Step 1: Clone the Repository

```bash
git clone https://github.com/ShauryaRahlon/AI-Extension.git
cd AI-Extension
```

### Step 2: Install Extension Dependencies

```bash
cd Extension
npm install
# or
pnpm install
```

### Step 3: Install Python Backend Dependencies

```bash
cd ../himanshu
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install packages
pip install -r requirements.txt
```

### Step 4: Verify Ollama Installation

```bash
# Check Ollama is running
ollama list

# Should show embeddinggemma:latest
# If not, pull it:
ollama pull embeddinggemma:latest
```

---

## ⚙️ Configuration

### Step 1: Backend Environment Variables

Create `.env` file in `himanshu/` directory:

```env
# Groq API (Required for Agent)
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxx

# LangSmith (Optional - for debugging/tracing)
LANGSMITH_API_KEY=ls__xxxxxxxxxxxxxxxxxxxxx
LANGSMITH_PROJECT=ai-extension
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT=https://api.smith.langchain.com

# Server Configuration
FLASK_ENV=development
```

### Step 2: Extension Configuration

The extension will prompt for:
- **Google Account**: For authentication (optional)
- **Gemini API Key**: For traditional AI features (optional)

These are stored in browser storage and can be configured via the sidepanel UI.

---

## 🚀 Running the System

### Terminal 1: Start Python Backend

```bash
cd himanshu
# Activate venv if not already active
venv\Scripts\activate  # Windows
# or
source venv/bin/activate  # macOS/Linux

# Start server
python server.py
```

**Expected Output:**
```
Starting Flask-SocketIO server...
Server will be available at http://0.0.0.0:8080
WebSocket endpoint: ws://0.0.0.0:8080/socket.io/
 * Running on http://0.0.0.0:8080
```

### Terminal 2: Start Extension Development Server

```bash
cd Extension
npm run dev
# or
pnpm dev
```

**Expected Output:**
```
Building extension...
✓ Built in XXXms
Extension ready at: chrome-extension://xxxxxxxxxxxxx
```

### Terminal 3: Load Extension in Browser

1. Open Chrome/Edge
2. Navigate to `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**
5. Select: `AI-Extension/Extension/.output/chrome-mv3`

**Verify Extension:**
- Extension icon appears in toolbar
- Click icon to open sidepanel
- Should see "🤖 AI Assistant" interface

---

## 📖 Usage Guide

### 1. Initial Setup

#### Sign In (Optional)
1. Click profile icon in sidepanel header
2. Click "Sign in with Google"
3. Authorize the extension

#### Configure API Keys
1. In sidepanel, find "Gemini API Key" section
2. Enter your API key
3. Click "Save Key"

### 2. Check Connection Status

Look for WebSocket status indicator at top of sidepanel:
- 🟢 **WebSocket Connected** = Backend is reachable
- 🔴 **WebSocket Disconnected** = Backend is offline

If disconnected:
1. Verify Python server is running (`python server.py`)
2. Check console for errors
3. Click "Reconnect" button

### 3. Using the LangChain Agent

The agent can perform complex browser automation tasks using 26 sophisticated tools.

#### Example 1: Simple Navigation
```
User: "Open Google and search for AI news"
```

**What happens:**
1. Agent opens new tab with Google
2. Extracts page info to find search box
3. Types "AI news" into search input
4. Presses enter or clicks search button
5. Reports success

#### Example 2: Email Workflow (Gmail)
```
User: "Send an email to john@example.com saying 'Meeting at 3pm'"
```

**What happens:**
1. Navigates to mail.google.com
2. Checks cookies to verify authentication
3. Clicks "Compose" button
4. Fills recipient, subject, and body
5. Clicks "Send"
6. Verifies email sent

#### Example 3: Form Filling
```
User: "Fill the contact form with my name 'Jane Doe' and email 'jane@example.com'"
```

**What happens:**
1. Extracts DOM to identify form fields
2. Batch fills all form inputs
3. Optionally submits the form
4. Confirms submission success

### 4. AI Learning Stats

The system learns from every interaction:
- **Total Interactions**: Number of completed tasks
- **Successful Interactions**: Tasks that completed successfully
- **Current Session**: Tasks in this session

**View Stats:**
- Check "📚 AI Learning Stats" section in sidepanel
- Click "Refresh Stats" to update
- Click "🗑️ Clear History" to reset learning database

### 5. Generate Custom Agent (Traditional Mode)

For simpler tasks without LangChain:
1. Enter goal: "Click the login button"
2. Enter target URL (optional)
3. Click "Generate Agent"
4. Review action plan
5. Click "Run Agent"

---

## 🔍 Troubleshooting

### Issue: WebSocket Not Connecting

**Symptoms:**
- Red indicator: "🔴 WebSocket Disconnected"
- Agent execution fails immediately

**Solutions:**
1. Check Python server is running:
   ```bash
   cd himanshu
   python server.py
   ```
2. Verify port 8080 is not blocked by firewall
3. Check browser console for errors (F12)
4. Restart both extension and server

### Issue: Agent Execution Timeout

**Symptoms:**
- Agent says "Tool execution timeout"
- Actions hang indefinitely

**Solutions:**
1. Reload the extension:
   - Go to `chrome://extensions/`
   - Click reload icon on extension
2. Check background service worker console:
   - Go to `chrome://extensions/`
   - Click "service worker" link
   - Look for error messages
3. Verify current tab is accessible (not chrome:// page)

### Issue: Ollama Embeddings Error

**Symptoms:**
- Backend crashes with "Connection refused to localhost:11434"
- RAG features don't work

**Solutions:**
1. Start Ollama:
   ```bash
   ollama serve
   ```
2. Verify model is installed:
   ```bash
   ollama list
   # Should show embeddinggemma:latest
   ```
3. Pull model if missing:
   ```bash
   ollama pull embeddinggemma:latest
   ```

### Issue: "No active tab found"

**Symptoms:**
- Agent can't execute tools
- Error: "No active tab found"

**Solutions:**
1. Make sure a regular web page is active (not chrome:// or edge://)
2. Click on the web page content to focus it
3. Ensure tab isn't loading
4. Try refreshing the tab

### Issue: DOM Extraction Returns Empty

**Symptoms:**
- Agent can't find any elements
- "No interactive elements found"

**Solutions:**
1. Wait for page to fully load
2. Check if page has aggressive CSP (Content Security Policy)
3. Try on a simpler page first (like google.com)
4. Use `get_page_info()` instead of `extract_dom_structure()`

---

## 🎓 Advanced Features

### RAG-Based Learning System

The extension learns from every interaction and uses past successful tasks to improve future performance.

**How it works:**
1. Every task is chunked into 5 document types:
   - Goal summary
   - Action sequence
   - Individual actions
   - Result/outcome
   - Domain patterns

2. FAISS vector database stores embeddings
3. On new tasks, retrieves similar past successful interactions
4. LLM uses context to plan better actions

**Benefits:**
- Improves over time
- Adapts to your workflows
- Learns site-specific patterns

### DOM Optimization

Large web pages are automatically compressed to prevent context overflow:

**Compression Strategies:**
- Filters utility CSS classes (Tailwind, Bootstrap)
- Keeps only semantic/interactive elements
- Truncates text to essential content
- Limits depth and breadth of DOM tree
- 50-90% size reduction typical

### Cookie Management

Authentication detection is optimized:
- Returns only auth/session cookies
- Filters out tracking/analytics cookies
- Truncates cookie values to 100 chars
- Max 10 cookies returned

### Tool Execution Flow

```
User Input (Sidepanel)
    │
    ├─> WebSocket: execute_agent_ws
    │
    ├─> Server: Agent.invoke()
    │
    ├─> Agent selects tool
    │
    ├─> Tool callback → WebSocket: tool_execution_request
    │
    ├─> Extension: background.ts handles tool
    │
    ├─> Browser API execution
    │
    ├─> Result → WebSocket: tool_execution_result
    │
    ├─> Agent receives result
    │
    └─> Final answer → WebSocket: agent_completed
```

---

## 🛠️ Development Commands

### Extension Development

```bash
cd Extension

# Development with hot reload
npm run dev

# Build for production
npm run build

# Type checking
npm run type-check

# Build for specific browser
npm run build -- --browser=chrome
npm run build -- --browser=edge
npm run build -- --browser=firefox
```

### Backend Development

```bash
cd himanshu

# Run server (development)
python server.py

# Run with auto-reload (using nodemon or similar)
# Note: Flask debug mode is enabled in server.py

# Test agent directly
python -c "from agents.agent import agent; print(agent)"

# Clear conversation history
# Delete data/faiss_db/index folder
```

---

## 📊 Monitoring & Debugging

### Extension Console Logs

**Background Service Worker:**
1. Go to `chrome://extensions/`
2. Click "service worker" under your extension
3. See tool execution logs with emojis:
   - 🔔 Message received
   - 🎬 Tool execution started
   - ✅ Success
   - ❌ Error

**Sidepanel Console:**
1. Right-click on sidepanel
2. Click "Inspect"
3. See WebSocket connection logs and agent progress

### Backend Logs

Server logs show:
- 🚀 Agent execution started
- 🔧 Tool callbacks triggered
- ✅ Tool results received
- 🔬 DOM optimization metrics
- 📚 RAG retrieval statistics

**Enable verbose logging:**
```python
# In server.py, change:
logging.basicConfig(level=logging.DEBUG)
```

---

## 🔐 Security Notes

- API keys stored in browser local storage (encrypted by browser)
- WebSocket runs on localhost only (not exposed externally)
- No data sent to external servers except API calls (Groq, Gemini)
- Cookies filtered to minimize sensitive data exposure
- RAG database stored locally (`data/faiss_db/`)

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature-name`
3. Make changes and test thoroughly
4. Commit with clear messages
5. Push and create Pull Request

---

## 📝 Common Workflows

### Daily Usage

1. Start backend: `python server.py` (Terminal 1)
2. Start extension dev: `npm run dev` (Terminal 2)
3. Extension auto-reloads on code changes
4. Backend requires manual restart for changes

### Adding New Tools

1. Define tool in `agents/agent.py`:
   ```python
   @tool
   def my_new_tool(param: str) -> str:
       """Tool description"""
       result = asyncio.run(execute_browser_action("MY_ACTION", {"param": param}))
       return json.dumps(result)
   ```

2. Add to tools list:
   ```python
   tools = [...existing..., my_new_tool]
   ```

3. Implement in `background.ts`:
   ```typescript
   case "MY_ACTION":
     return await myActionHandler(params);
   ```

4. Test with agent command

### Debugging Agent Behavior

1. Enable LangSmith tracing (already in .env)
2. Go to https://smith.langchain.com
3. View execution traces, tool calls, and reasoning steps
4. Analyze failures and optimize prompts

---

## 🎯 Next Steps

- Explore the 26 available tools in `agents/agent.py`
- Read system prompt in `agent.py` for agent capabilities
- Check `WEBSOCKET_SETUP.md` for communication details
- Review `TAB_CONTROL_GUIDE.md` for tab management
- See `TESTING_EXAMPLES.md` for test scenarios

---

## 📞 Support

- GitHub Issues: https://github.com/ShauryaRahlon/AI-Extension/issues
- Check existing documentation in repo root
- Review error logs in console and terminal

---

**Happy Automating! 🚀**
