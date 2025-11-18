# AI Agent Web Extension - System Architecture

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           USER INTERFACE                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌────────────────────┐      ┌────────────────────┐                    │
│  │   Extension Popup   │      │   Side Panel       │                    │
│  │   - Quick Actions   │      │   - Agent UI       │                    │
│  │   - Tab Info        │      │   - Progress View  │                    │
│  │   - Settings        │      │   - Result Display │                    │
│  └────────────────────┘      └────────────────────┘                    │
│                                        ↕                                  │
│                                  WebSocket                               │
└───────────────────────────────────────────────────────────────────────┘
                                        ↕
┌─────────────────────────────────────────────────────────────────────────┐
│                        EXTENSION LAYER (Browser)                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  Background Script (Service Worker)                             │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │    │
│  │  │   Message    │  │  WebSocket   │  │   Tool Execution     │ │    │
│  │  │   Router     │→ │   Client     │→ │   Handler            │ │    │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘ │    │
│  │         ↓                                       ↓                │    │
│  │  ┌──────────────────────────────────────────────────────────┐  │    │
│  │  │             Browser API Interface                         │  │    │
│  │  │  - tabs API    - scripting API   - cookies API           │  │    │
│  │  │  - storage API - history API     - downloads API         │  │    │
│  │  └──────────────────────────────────────────────────────────┘  │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                        ↓                                  │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  Content Script (Injected into Pages)                          │    │
│  │  - DOM Manipulation    - Event Listening    - Data Extraction  │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                           │
└───────────────────────────────────────────────────────────────────────┘
                                        ↕ WebSocket
┌─────────────────────────────────────────────────────────────────────────┐
│                        SERVER LAYER (Python)                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  Flask-SocketIO Server                                          │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │    │
│  │  │  WebSocket   │  │   HTTP API   │  │   Client Manager     │ │    │
│  │  │  Handlers    │  │   Endpoints  │  │   (Session Tracking) │ │    │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘ │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                        ↓                                  │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  Agent Orchestration Layer                                      │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │    │
│  │  │  Task Queue  │→ │ Agent Exec   │→ │  Result Aggregator   │ │    │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘ │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                        ↓                                  │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  LangChain ReAct Agent                                          │    │
│  │  ┌──────────────────────────────────────────────────────────┐  │    │
│  │  │  Reasoning Loop:                                          │  │    │
│  │  │  1. Thought  → Analyze situation                          │  │    │
│  │  │  2. Action   → Select and call tool                       │  │    │
│  │  │  3. Observe  → Process tool result                        │  │    │
│  │  │  4. Repeat   → Until goal achieved                        │  │    │
│  │  └──────────────────────────────────────────────────────────┘  │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                        ↓                                  │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  Tool Registry (26 Specialized Tools)                          │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │    │
│  │  │ Page Tools   │  │ Action Tools │  │  Navigation Tools    │ │    │
│  │  │ - get_info   │  │ - click      │  │  - open_tab          │ │    │
│  │  │ - extract    │  │ - type       │  │  - switch            │ │    │
│  │  │ - find       │  │ - fill_form  │  │  - navigate          │ │    │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘ │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │    │
│  │  │ Storage      │  │ Element      │  │  Advanced Tools      │ │    │
│  │  │ - cookies    │  │ - scroll     │  │  - screenshot        │ │    │
│  │  │ - localStorage│  │ - hover      │  │  - execute_js        │ │    │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘ │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                        ↓                                  │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  LLM Interface (Groq)                                           │    │
│  │  - Model: openai/gpt-oss-120b                                  │    │
│  │  - Temperature: 0.2 (consistent behavior)                      │    │
│  │  - Context: Tool descriptions + conversation history           │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                           │
└───────────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

### Agent Execution Flow

```
┌──────────┐
│  User    │
│  Types:  │  "Open Gmail and mark first email as read"
│  Goal    │
└────┬─────┘
     │
     ↓ WebSocket (execute_agent_ws)
┌────┴──────────────────────────────────────────────┐
│  Flask Server                                      │
│  - Creates agent task                              │
│  - Sets up WebSocket callback                      │
│  - Starts agent in background thread               │
└────┬──────────────────────────────────────────────┘
     │
     ↓
┌────┴─────────────────────────────────────────────┐
│  LangChain ReAct Agent                            │
│  Thought: "Need to check current page first"      │
│  Action: get_page_info                            │
└────┬─────────────────────────────────────────────┘
     │
     ↓ WebSocket (tool_execution_request)
┌────┴──────────────────────────────────────────────┐
│  Extension Background Script                       │
│  - Receives tool call                              │
│  - Routes to executeAgentTool()                    │
│  - Executes: getPageInfo()                         │
└────┬──────────────────────────────────────────────┘
     │
     ↓ browser.scripting.executeScript()
┌────┴──────────────────────────────────────────────┐
│  Content Script / Page Context                     │
│  - Extracts page information                       │
│  - Returns: {url, title, interactive elements}     │
└────┬──────────────────────────────────────────────┘
     │
     ↓ Script result
┌────┴──────────────────────────────────────────────┐
│  Extension Background Script                       │
│  - Formats result                                  │
│  - Returns via WebSocket                           │
└────┬──────────────────────────────────────────────┘
     │
     ↓ WebSocket (tool_execution_result)
┌────┴──────────────────────────────────────────────┐
│  Flask Server                                      │
│  - Callback receives result                        │
│  - Passes back to agent                            │
└────┬──────────────────────────────────────────────┘
     │
     ↓
┌────┴──────────────────────────────────────────────┐
│  LangChain ReAct Agent                             │
│  Observation: "On Gmail, see 3 unread emails"     │
│  Thought: "Need to click first unread email"      │
│  Action: click_element                             │
│  Action Input: {selector: ".unread:first-child"}  │
└────┬──────────────────────────────────────────────┘
     │
     ↓ (Repeat tool execution cycle)
     │
     ↓
┌────┴──────────────────────────────────────────────┐
│  LangChain ReAct Agent                             │
│  Final Answer: "Successfully marked email as read" │
└────┬──────────────────────────────────────────────┘
     │
     ↓ WebSocket (agent_completed)
┌────┴──────────────────────────────────────────────┐
│  Extension UI                                      │
│  - Shows success message                           │
│  - Displays execution log                          │
│  - Shows final result                              │
└───────────────────────────────────────────────────┘
```

## Component Interaction Matrix

```
┌─────────────────┬──────────┬──────────┬──────────┬──────────┐
│                 │   User   │Extension │  Server  │  Agent   │
├─────────────────┼──────────┼──────────┼──────────┼──────────┤
│ User            │    -     │  Input   │    -     │    -     │
│ Extension       │ Display  │    -     │ WebSocket│    -     │
│ Server          │    -     │ WebSocket│    -     │  Invoke  │
│ Agent           │    -     │    -     │  Result  │    -     │
│ Tools           │    -     │ Execute  │  Request │  Call    │
│ Browser APIs    │    -     │    Use   │    -     │    -     │
└─────────────────┴──────────┴──────────┴──────────┴──────────┘
```

## State Management

```
┌─────────────────────────────────────────────────┐
│           Server State                          │
├─────────────────────────────────────────────────┤
│ connected_clients = {                           │
│   "client_id_123": {                            │
│     "sid": "socket_id",                         │
│     "pending_tool_calls": {                     │
│       "tool_uuid_456": {                        │
│         "action_type": "CLICK",                 │
│         "params": {...},                        │
│         "result": null,                         │
│         "completed": false                      │
│       }                                          │
│     }                                            │
│   }                                              │
│ }                                                │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│           Extension State                        │
├─────────────────────────────────────────────────┤
│ - wsConnected: boolean                           │
│ - agentExecuting: boolean                        │
│ - progressUpdates: Array<Update>                │
│ - currentResult: any                             │
│ - activeTabs: Set<number>                       │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│           Agent State                            │
├─────────────────────────────────────────────────┤
│ - current_iteration: number                      │
│ - intermediate_steps: Array<Step>               │
│ - tool_results: Array<Result>                   │
│ - agent_scratchpad: string                      │
└─────────────────────────────────────────────────┘
```

## Security Layers

```
┌──────────────────────────────────────────────────────┐
│                     Security Layers                   │
├──────────────────────────────────────────────────────┤
│                                                        │
│  ┌─────────────────────────────────────────────────┐ │
│  │  Layer 1: Input Validation                      │ │
│  │  - Validate goal text                            │ │
│  │  - Sanitize parameters                           │ │
│  │  - Check permissions                             │ │
│  └─────────────────────────────────────────────────┘ │
│                         ↓                             │
│  ┌─────────────────────────────────────────────────┐ │
│  │  Layer 2: Tool Authorization                    │ │
│  │  - Check tool allowed for context                │ │
│  │  - Validate selectors                            │ │
│  │  - Limit script execution                        │ │
│  └─────────────────────────────────────────────────┘ │
│                         ↓                             │
│  ┌─────────────────────────────────────────────────┐ │
│  │  Layer 3: Browser Security                      │ │
│  │  - Extension permissions                         │ │
│  │  - Content Security Policy                       │ │
│  │  - Same-Origin Policy                            │ │
│  └─────────────────────────────────────────────────┘ │
│                         ↓                             │
│  ┌─────────────────────────────────────────────────┐ │
│  │  Layer 4: Error Boundaries                      │ │
│  │  - Try-catch at every level                      │ │
│  │  - Timeout protection                            │ │
│  │  - Graceful degradation                          │ │
│  └─────────────────────────────────────────────────┘ │
│                                                        │
└──────────────────────────────────────────────────────┘
```

## Performance Optimization

```
┌──────────────────────────────────────────────────────┐
│              Optimization Strategies                  │
├──────────────────────────────────────────────────────┤
│                                                        │
│  ┌─────────────────────────────────────────────────┐ │
│  │  WebSocket Connection                            │ │
│  │  ✓ Persistent connection (no repeated handshake) │ │
│  │  ✓ Binary protocol for large payloads            │ │
│  │  ✓ Automatic reconnection                        │ │
│  └─────────────────────────────────────────────────┘ │
│                                                        │
│  ┌─────────────────────────────────────────────────┐ │
│  │  Tool Execution                                  │ │
│  │  ✓ Async operations (non-blocking)               │ │
│  │  ✓ Cached DOM queries                            │ │
│  │  ✓ Batch form filling                            │ │
│  └─────────────────────────────────────────────────┘ │
│                                                        │
│  ┌─────────────────────────────────────────────────┐ │
│  │  Agent Reasoning                                 │ │
│  │  ✓ Low temperature (consistent, no retries)      │ │
│  │  ✓ Iteration limits (prevent infinite loops)     │ │
│  │  ✓ Time limits (prevent hanging)                 │ │
│  └─────────────────────────────────────────────────┘ │
│                                                        │
│  ┌─────────────────────────────────────────────────┐ │
│  │  Data Transfer                                   │ │
│  │  ✓ Lazy DOM extraction (only when needed)        │ │
│  │  ✓ Compressed WebSocket messages                 │ │
│  │  ✓ Selective data fields                         │ │
│  └─────────────────────────────────────────────────┘ │
│                                                        │
└──────────────────────────────────────────────────────┘
```

## Scalability Considerations

```
┌─────────────────────────────────────────────────────┐
│            Current                →      Future      │
├─────────────────────────────────────────────────────┤
│                                                       │
│  Single Server              →   Load Balanced       │
│  In-Memory State            →   Redis/Database      │
│  One Agent/Request          →   Agent Pool          │
│  Sequential Tools           →   Parallel Execution  │
│  Single LLM Provider        →   Multi-Provider      │
│  Direct Execution           →   Queue System        │
│                                                       │
└─────────────────────────────────────────────────────┘
```

## Technology Stack

```
┌────────────────────────────────────────────────┐
│              Frontend (Extension)               │
├────────────────────────────────────────────────┤
│  - TypeScript 5.x                               │
│  - React 18.x                                   │
│  - WXT Framework                                │
│  - Socket.IO Client 4.x                         │
│  - Chrome Extension APIs (Manifest V3)          │
└────────────────────────────────────────────────┘

┌────────────────────────────────────────────────┐
│              Backend (Server)                   │
├────────────────────────────────────────────────┤
│  - Python 3.8+                                  │
│  - Flask 3.x                                    │
│  - Flask-SocketIO 5.x                           │
│  - LangChain 0.1.x                              │
│  - Groq LLM API                                 │
└────────────────────────────────────────────────┘

┌────────────────────────────────────────────────┐
│              Communication                      │
├────────────────────────────────────────────────┤
│  - WebSocket (Primary)                          │
│  - HTTP/REST (Fallback)                         │
│  - JSON (Data Format)                           │
└────────────────────────────────────────────────┘
```

---

**Legend:**
- `→` : Data Flow Direction
- `↓` : Process Flow
- `↕` : Bidirectional Communication
- `✓` : Implemented Feature
- `-` : Not Applicable

---

This architecture supports:
- ✅ Real-time communication
- ✅ Sophisticated agent reasoning
- ✅ 26+ specialized tools
- ✅ Error handling at all levels
- ✅ Scalable design
- ✅ Security by layers
- ✅ Performance optimization
