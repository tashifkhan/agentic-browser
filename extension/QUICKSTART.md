# Quick Start Guide - AI Agent System

## 🚀 Installation & Setup

### Prerequisites
- Python 3.8+
- Node.js 18+
- Chrome/Edge browser

### Step 1: Install Python Dependencies

```bash
cd himanshu
pip install -r requirements.txt
```

**New dependencies added for agent system:**
- `langchain` - Agent framework
- `langchain-groq` - Groq LLM integration
- `langchain-core` - Core LangChain functionality

### Step 2: Install Node Dependencies

```bash
cd Extension
npm install
# or
pnpm install
```

**New dependency:**
- `socket.io-client` - Already added

### Step 3: Configure Environment

Create/update `.env` file in `himanshu/` directory:

```bash
GROQ_API_KEY=your_groq_api_key_here
SECRET_KEY=your_secret_key_here
```

Get your Groq API key from: https://console.groq.com/

### Step 4: Start the Server

```bash
cd himanshu
python server.py
```

You should see:
```
Starting Flask-SocketIO server...
Server will be available at http://0.0.0.0:8080
WebSocket endpoint: ws://0.0.0.0:8080/socket.io/
```

### Step 5: Build the Extension

```bash
cd Extension
npm run dev
# or for production
npm run build
```

### Step 6: Load Extension in Browser

1. Open Chrome/Edge
2. Go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the `.output/chrome-mv3` folder (for dev) or `dist` folder (for production build)

## 🎯 Using the Agent System

### Option 1: Via Sidepanel UI

1. **Open Sidepanel**: Click extension icon and select "Open sidepanel"
2. **Check Connection**: Look for 🟢 WebSocket Connected indicator
3. **Enter Goal**: In the "AI Agent Executor" section, type your goal
4. **Execute**: Click "🚀 Execute Agent"
5. **Watch Progress**: Real-time updates show agent's thinking and actions
6. **View Results**: Final result appears when complete

### Option 2: Via WebSocket Client (Programmatic)

```typescript
import { wsClient } from './utils/websocket-client';

// Execute agent with progress tracking
const result = await wsClient.executeAgent(
  "Open Gmail and check for unread emails",
  (progress) => {
    console.log(`[${progress.status}] ${progress.message}`);
  }
);

console.log("Result:", result);
```

### Option 3: Via Python (Direct Agent Access)

```python
from agents.agent import agent, set_websocket_callback
import asyncio

# Mock callback for testing
async def mock_callback(action_type, params):
    print(f"Tool called: {action_type}")
    return {"success": True, "message": "Mocked"}

set_websocket_callback(mock_callback)

# Execute agent
result = agent.invoke({"input": "Your goal here"})
print(result)
```

## 📝 Example Commands

### Simple Commands

```
"Open a new tab and search for AI news"
"Click the first button on this page"
"Fill the email field with test@example.com"
"Take a screenshot of the current page"
"Scroll down 500 pixels"
"Get all links on this page"
```

### Intermediate Commands

```
"Open Google, search for 'Python tutorials', and click the first result"
"Fill out the login form with email test@example.com and password secret123"
"Find all images on the page and count them"
"Navigate to Amazon and search for 'laptop'"
"Get the text from all h1 headings"
```

### Advanced Commands

```
"Go to GitHub, search for 'langchain', and star the first repository"
"Open Twitter, scroll down 3 times, and extract all tweet texts"
"Navigate to a shopping site, search for 'phone', filter by price, and show top 3 results"
"Open Gmail, find emails from today, and summarize the subjects"
"Extract all product prices from this e-commerce page and calculate the average"
```

## 🔧 Testing

### Test Individual Tools

```python
# In Python shell or script
from agents.agent import tools
import asyncio

# Mock the WebSocket callback
async def test_callback(action_type, params):
    print(f"Would execute: {action_type} with {params}")
    return {"success": True, "data": "test"}

from agents.agent import set_websocket_callback
set_websocket_callback(test_callback)

# Test a tool
result = tools[0].invoke({"include_dom": True})  # get_page_info
print(result)
```

### Test WebSocket Connection

```typescript
// In browser console (when extension is loaded)
const ws = new WebSocket('ws://localhost:8080/socket.io/?EIO=4&transport=websocket');

ws.onopen = () => console.log('✅ Connected');
ws.onmessage = (msg) => console.log('📨', msg.data);
ws.onerror = (err) => console.error('❌', err);
```

### Test Tool Execution

```bash
# In one terminal - start server
cd himanshu && python server.py

# In another terminal - test with curl
curl -X POST http://localhost:8080/generate-script \
  -H "Content-Type: application/json" \
  -d '{"goal":"test","target_url":"https://google.com","dom_structure":{}}'
```

## 🐛 Troubleshooting

### Server Won't Start

**Issue**: `ModuleNotFoundError: No module named 'langchain'`

**Solution**:
```bash
pip install langchain langchain-groq langchain-core
```

### WebSocket Not Connecting

**Issue**: Extension shows 🔴 WebSocket Disconnected

**Solutions**:
1. Check if server is running: `curl http://localhost:8080`
2. Check console for errors
3. Restart server with debug: `python server.py`
4. Check firewall isn't blocking port 8080

### Agent Timeout

**Issue**: Agent execution times out after 5 minutes

**Solutions**:
1. Simplify the goal into smaller steps
2. Increase timeout in `server.py`:
   ```python
   agent = AgentExecutor(
       max_execution_time=600  # 10 minutes
   )
   ```
3. Check if specific tool is hanging

### Tool Execution Fails

**Issue**: Tool returns error "Element not found"

**Solutions**:
1. Verify the page has fully loaded
2. Use `wait_for_element` before interacting
3. Check selector is correct (inspect element in browser)
4. Use `get_page_info` first to understand page structure

### Import Errors in Agent

**Issue**: `ImportError: cannot import name 'create_react_agent'`

**Solution**:
```bash
pip install --upgrade langchain langchain-core
```

### Permission Errors

**Issue**: Extension can't access certain pages

**Solution**: Add permissions to `wxt.config.ts`:
```typescript
export default defineConfig({
  manifest: {
    permissions: [
      'tabs',
      'activeTab',
      'scripting',
      'storage',
      'cookies',  // Add if using cookie tools
    ],
  },
});
```

## 📊 Monitoring

### View Agent Logs

```bash
# Server logs (in terminal running server.py)
# Shows agent thinking, tool calls, and results

# Browser console logs (F12)
# Shows WebSocket events and tool execution
```

### Check Connection Status

```typescript
// In browser console
console.log('WS Status:', wsClient.getStatus());
console.log('Connected:', wsClient.isSocketConnected());
```

### View Conversation Stats

```typescript
const stats = await wsClient.getStats();
console.log('Conversation stats:', stats);
```

## 🔄 Development Workflow

### Make Changes to Tools

1. Edit `himanshu/agents/agent.py`
2. Add/modify tool definition
3. Restart server: `python server.py`
4. Test in extension

### Make Changes to Extension

1. Edit files in `Extension/entrypoints/`
2. Extension auto-rebuilds (if using `npm run dev`)
3. Refresh extension in browser
4. Test functionality

### Add New Tool

```python
# 1. Add to agent.py
@tool
def my_new_tool(param: str) -> str:
    """Description for agent"""
    result = asyncio.run(execute_browser_action("MY_ACTION", {
        "param": param
    }))
    return json.dumps(result)

# 2. Add to tools list
tools = [
    # ...existing tools
    my_new_tool,
]

# 3. Implement in background.ts
case "MY_ACTION":
    return await myActionHandler(tabId, params);
```

## 🎓 Learning Resources

### LangChain & Agents
- Official Docs: https://python.langchain.com/docs/modules/agents/
- ReAct Paper: https://arxiv.org/abs/2210.03629
- Agent Examples: https://github.com/langchain-ai/langchain/tree/master/docs/docs/modules/agents

### WebExtensions
- MDN Docs: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions
- Chrome API: https://developer.chrome.com/docs/extensions/reference/
- WXT Framework: https://wxt.dev/

### WebSocket
- Flask-SocketIO: https://flask-socketio.readthedocs.io/
- Socket.IO Client: https://socket.io/docs/v4/client-api/

## 📈 Performance Tips

1. **Use WebSocket**: Faster than HTTP for repeated requests
2. **Cache Page Info**: Store DOM structure for multiple operations
3. **Batch Operations**: Use `fill_form_fields` instead of multiple `type_text`
4. **Specific Selectors**: Use IDs when available for faster queries
5. **Reasonable Timeouts**: Don't wait too long for elements

## 🔐 Security Best Practices

1. **Never commit API keys**: Use `.env` file (already in `.gitignore`)
2. **Validate user input**: Server validates all tool parameters
3. **Limit permissions**: Only request necessary browser permissions
4. **Sanitize scripts**: Be careful with `execute_javascript` tool
5. **User confirmation**: Consider confirming destructive actions

## 📞 Support

For issues or questions:
1. Check this guide and `AGENT_SYSTEM_GUIDE.md`
2. Review server logs for errors
3. Check browser console for client-side errors
4. Open an issue on GitHub with full error details

## ✅ Verification Checklist

After setup, verify everything works:

- [ ] Server starts without errors
- [ ] Extension loads in browser
- [ ] WebSocket shows 🟢 Connected
- [ ] Simple command works: "Open a new tab"
- [ ] Tool execution visible in logs
- [ ] Progress updates appear in UI
- [ ] Results displayed correctly
- [ ] No console errors

---

**Ready to go!** 🚀

Try your first command: "Open a new tab and search for 'Hello World'"
