# AI Agent System - Complete Guide

## Overview

This extension now features a **sophisticated AI agent system** that can autonomously control the browser using natural language commands. The agent uses LangChain with ReAct reasoning and has access to 25+ specialized tools for browser automation.

## Architecture

```
User Input (Natural Language)
    ↓
Extension UI (React/TypeScript)
    ↓ WebSocket (Real-time bidirectional)
Flask-SocketIO Server (Python)
    ↓
LangChain ReAct Agent
    ↓
25+ Sophisticated Tools
    ↓ Tool Execution Request via WebSocket
Background Script (TypeScript)
    ↓
Browser APIs + DOM Manipulation
    ↓ Tool Execution Result via WebSocket
Agent receives feedback and continues
    ↓
Final Result to User
```

## Key Features

### 🤖 Intelligent Agent
- **ReAct Reasoning**: Agent thinks through problems step by step
- **Tool Selection**: Automatically chooses the right tools for each task
- **Error Handling**: Gracefully handles failures and retries with alternative approaches
- **Multi-Step Execution**: Can execute complex workflows with multiple actions

### 🔧 25+ Sophisticated Tools

#### Page Information & Analysis
- `get_page_info` - Get comprehensive page info (DOM, forms, media)
- `extract_dom_structure` - Extract detailed DOM hierarchy
- `find_elements` - Find all matching elements with filters
- `get_element_text` - Extract text or attribute values
- `get_element_attributes` - Get all element attributes

#### Element Interaction
- `click_element` - Click any element with CSS selector
- `type_text` - Type into inputs/textareas with enter support
- `fill_form_fields` - Fill multiple form fields at once
- `select_dropdown_option` - Select from dropdowns by value/text/index
- `hover_element` - Trigger hover effects and menus
- `wait_for_element` - Wait for elements (visible/hidden/exists)

#### Navigation & Scrolling
- `scroll_page` - Scroll in any direction or to specific element
- `navigate_to_url` - Navigate to any URL with load waiting
- `reload_page` - Refresh with optional cache bypass
- `go_back` - Navigate back in history
- `go_forward` - Navigate forward in history

#### Tab Management
- `open_new_tab` - Open new tabs with optional activation
- `close_current_tab` - Close active tab
- `switch_tab` - Switch by ID or direction (next/prev)
- `get_all_tabs` - List all open tabs with details

#### Data Access & Storage
- `get_cookies` - Retrieve cookies for any URL
- `set_cookie` - Set cookies with full control
- `get_local_storage` - Read localStorage data
- `set_local_storage` - Write to localStorage
- `take_screenshot` - Capture full page or specific elements

#### Advanced
- `execute_javascript` - Run custom JavaScript for complex tasks

## How It Works

### 1. Agent Initialization
```python
# agent.py
agent = AgentExecutor(
    agent=react_agent,
    tools=tools,
    verbose=True,
    max_iterations=15,
    max_execution_time=300
)
```

### 2. Tool Execution Flow

**Step 1**: User sends goal via WebSocket
```typescript
wsClient.executeAgent("Open Gmail and mark first email as read")
```

**Step 2**: Agent analyzes and selects tools
```
Thought: I need to first check if we're on Gmail, then find the first unread email
Action: get_page_info
Action Input: {"include_dom": true}
```

**Step 3**: Server sends tool request to extension
```python
socketio.emit('tool_execution_request', {
    'tool_id': uuid,
    'action_type': 'GET_PAGE_INFO',
    'params': {'include_dom': True}
})
```

**Step 4**: Background script executes tool
```typescript
executeAgentTool('GET_PAGE_INFO', params)
  → browser.scripting.executeScript(...)
  → Returns result
```

**Step 5**: Extension sends result back
```typescript
socket.emit('tool_execution_result', {
    'tool_id': uuid,
    'result': {success: true, data: {...}}
})
```

**Step 6**: Agent processes result and continues
```
Observation: Page is Gmail, found 5 unread emails
Thought: Now I need to click the first unread email
Action: click_element
Action Input: {"selector": ".unread:first-child"}
```

**Step 7**: Repeat until goal achieved
```
Final Answer: Successfully marked first email as read
```

## Usage Examples

### Example 1: Simple Search
```typescript
"Open a new tab and search for AI news"
```

**Agent Flow**:
1. Uses `open_new_tab` with Google search URL
2. Returns success

### Example 2: Form Filling
```typescript
"Fill the login form with test@example.com and password123"
```

**Agent Flow**:
1. Uses `get_page_info` to find form fields
2. Uses `fill_form_fields` with field mappings
3. Optionally uses `click_element` to submit

### Example 3: Complex Workflow
```typescript
"Go to Amazon, search for laptops, filter by 4+ stars, and show me the first 3 results"
```

**Agent Flow**:
1. `navigate_to_url` to Amazon
2. `wait_for_element` for search box
3. `type_text` in search box with enter
4. `wait_for_element` for results
5. `click_element` on rating filter
6. `wait_for_element` for filtered results
7. `find_elements` to get first 3 items
8. `get_element_text` to extract titles and prices
9. Returns formatted results

## Tool Implementation Details

### Tool Structure
Each tool follows this pattern:

```python
@tool
def tool_name(param1: str, param2: Optional[int] = None) -> str:
    """
    Tool description for the agent.
    
    Args:
        param1: Description of param1
        param2: Optional parameter description
        
    Returns:
        JSON string with result
    
    Use this tool when...
    """
    try:
        result = asyncio.run(execute_browser_action("ACTION_TYPE", {
            "param1": param1,
            "param2": param2
        }))
        return json.dumps(result, indent=2)
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})
```

### Browser-Side Implementation
```typescript
async function executeAgentTool(actionType: string, params: any): Promise<any> {
    const tabId = await getActiveTabId();
    
    switch (actionType) {
        case "CLICK":
            return await browser.scripting.executeScript({
                target: { tabId },
                func: (selector) => {
                    const el = document.querySelector(selector);
                    if (!el) throw new Error(`Not found: ${selector}`);
                    el.click();
                    return `Clicked: ${selector}`;
                },
                args: [params.selector]
            });
        
        // ... more cases
    }
}
```

## Real-Time Progress Updates

The agent system provides real-time feedback:

```typescript
wsClient.executeAgent(goal, (progress) => {
    console.log(`[${progress.status}] ${progress.message}`);
});

// Output:
// [initializing] Starting agent execution...
// [planning] Agent is analyzing the task...
// [executing] Using tool: get_page_info
// [executing] Using tool: click_element
// [completed] ✅ Agent execution completed!
```

## Configuration

### Agent Settings (server.py)
```python
agent = AgentExecutor(
    agent=react_agent,
    tools=tools,
    verbose=True,              # Show agent thinking
    handle_parsing_errors=True, # Graceful error handling
    max_iterations=15,          # Max tool calls
    max_execution_time=300      # 5 minutes timeout
)
```

### LLM Configuration
```python
llm = ChatGroq(
    api_key=api_key,
    model="openai/gpt-oss-120b",
    temperature=0.2  # Low temperature for consistent behavior
)
```

## Error Handling

The system handles errors at multiple levels:

1. **Tool Level**: Each tool catches exceptions and returns error JSON
2. **Agent Level**: Agent can retry with different approach
3. **WebSocket Level**: Timeouts and connection errors handled
4. **Browser Level**: Script injection errors caught and reported

```python
try:
    result = await execute_browser_action(...)
    return json.dumps(result)
except Exception as e:
    return json.dumps({"success": False, "error": str(e)})
```

## Best Practices

### For Users

1. **Be Specific**: "Click the blue submit button" vs "Click something"
2. **Provide Context**: "On the login page, enter credentials"
3. **Use Natural Language**: The agent understands conversational commands
4. **Check Progress**: Watch the real-time updates to understand what's happening

### For Developers

1. **Add Descriptive Tool Docs**: Helps agent understand when to use each tool
2. **Return Structured Data**: Use JSON for consistent results
3. **Handle Edge Cases**: Check element existence before interaction
4. **Add Wait Times**: Some operations need delays (page loads, animations)
5. **Test Incrementally**: Test each tool individually before complex workflows

## Security Considerations

1. **Script Validation**: Custom JavaScript execution is carefully sandboxed
2. **Selector Validation**: CSS selectors are validated before execution
3. **Cookie Access**: Limited to extension permissions
4. **Same-Origin Policy**: Respects browser security boundaries
5. **User Confirmation**: Critical actions can require confirmation

## Performance Optimization

1. **Tool Call Batching**: Multiple related tools can be executed together
2. **Caching**: DOM structure cached during execution
3. **Lazy Loading**: Only extract needed page information
4. **Timeout Management**: Reasonable timeouts prevent hanging
5. **WebSocket Persistence**: One connection for entire session

## Troubleshooting

### Agent Not Responding
- Check WebSocket connection status
- Verify Flask server is running
- Check browser console for errors

### Tool Execution Fails
- Verify element selectors are correct
- Check page has fully loaded
- Ensure extension has necessary permissions

### Slow Execution
- Reduce max_iterations if agent loops
- Optimize selectors for faster DOM queries
- Check network latency

## Future Enhancements

### Planned Features
- 🎯 **Vision Tools**: Screenshot analysis with vision models
- 📊 **Data Extraction**: Advanced scraping with structure preservation
- 🔄 **Workflow Recording**: Record and replay user actions
- 🧪 **Testing Mode**: Validate automation scripts
- 📝 **Logging**: Detailed execution logs for debugging
- 🔐 **Secure Vault**: Encrypted credential storage

### Experimental Tools
- PDF download and parsing
- Email integration
- Calendar automation
- File upload handling
- Network traffic inspection

## API Reference

### WebSocket Events

#### Client → Server
- `execute_agent_ws` - Start agent execution
  ```typescript
  {goal: string}
  ```

- `tool_execution_result` - Return tool result
  ```typescript
  {tool_id: string, result: any}
  ```

#### Server → Client
- `tool_execution_request` - Request tool execution
  ```typescript
  {tool_id: string, action_type: string, params: any}
  ```

- `agent_progress` - Progress update
  ```typescript
  {status: string, message: string}
  ```

- `agent_completed` - Execution complete
  ```typescript
  {ok: boolean, result: string, steps_taken: number}
  ```

- `agent_error` - Execution failed
  ```typescript
  {error: string}
  ```

## Contributing

To add new tools:

1. **Define tool in agent.py**
   ```python
   @tool
   def my_new_tool(param: str) -> str:
       """Tool description"""
       result = asyncio.run(execute_browser_action("MY_ACTION", {
           "param": param
       }))
       return json.dumps(result)
   ```

2. **Implement in background.ts**
   ```typescript
   case "MY_ACTION":
       return await myActionImplementation(tabId, params);
   ```

3. **Add to tools list**
   ```python
   tools = [
       # ... existing tools
       my_new_tool,
   ]
   ```

4. **Test thoroughly**
   ```typescript
   await wsClient.executeAgent("Test my new feature");
   ```

## Resources

- **LangChain Docs**: https://python.langchain.com/docs/
- **ReAct Paper**: https://arxiv.org/abs/2210.03629
- **WebExtensions API**: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions
- **Flask-SocketIO**: https://flask-socketio.readthedocs.io/

---

**Status**: ✅ Fully implemented and production-ready

**Last Updated**: November 17, 2025

**Maintainers**: AI Extension Team
