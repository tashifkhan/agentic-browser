# Tab & Window Control Integration Guide

## Overview
The system now supports **both DOM manipulation** (clicking, typing on pages) **AND tab/window control** (opening tabs, navigating, switching tabs) while maintaining the existing functionality.

## What Changed

### 1. **New Action Types Added**
In addition to the existing DOM actions (CLICK, TYPE, SCROLL, WAIT, SELECT, EXECUTE_SCRIPT), we now have:

#### Tab Control Actions:
- **OPEN_TAB** - Open a new tab with optional URL
- **CLOSE_TAB** - Close a tab (current or by ID)
- **SWITCH_TAB** - Switch to a different tab
- **NAVIGATE** - Navigate current/specified tab to a URL
- **RELOAD_TAB** - Reload/refresh a tab
- **DUPLICATE_TAB** - Duplicate current tab

### 2. **How It Works**

#### Example User Request: "Open a new tab and search for flights"

**Generated Action Plan:**
```json
{
  "actions": [
    {
      "type": "OPEN_TAB",
      "url": "https://www.google.com/search?q=flights",
      "active": true,
      "description": "Open new tab with flight search"
    }
  ]
}
```

#### Example User Request: "Open Google and search for Paris hotels"

**Generated Action Plan:**
```json
{
  "actions": [
    {
      "type": "OPEN_TAB",
      "url": "https://www.google.com",
      "active": true,
      "description": "Open Google in new tab"
    },
    {
      "type": "WAIT",
      "time": 2000,
      "description": "Wait for page to load"
    },
    {
      "type": "TYPE",
      "selector": "textarea[name='q']",
      "value": "Paris hotels",
      "description": "Type search query"
    },
    {
      "type": "CLICK",
      "selector": "input[type='submit']",
      "description": "Submit search"
    }
  ]
}
```

### 3. **Action Type Details**

#### OPEN_TAB
```json
{
  "type": "OPEN_TAB",
  "url": "https://example.com",
  "active": true  // optional, default: true
}
```

#### CLOSE_TAB
```json
{
  "type": "CLOSE_TAB",
  "tabId": 123  // optional, omit to close current tab
}
```

#### SWITCH_TAB
```json
// By tab ID
{
  "type": "SWITCH_TAB",
  "tabId": 123
}

// By direction
{
  "type": "SWITCH_TAB",
  "direction": "next"  // or "prev"
}
```

#### NAVIGATE
```json
{
  "type": "NAVIGATE",
  "url": "https://example.com",
  "tabId": 123  // optional, omit for current tab
}
```

#### RELOAD_TAB
```json
{
  "type": "RELOAD_TAB",
  "tabId": 123,  // optional, omit for current tab
  "bypassCache": false  // optional
}
```

#### DUPLICATE_TAB
```json
{
  "type": "DUPLICATE_TAB",
  "tabId": 123  // optional, omit for current tab
}
```

### 4. **How the System Decides**

The LLM is trained to analyze user intent:

- **"open new tab"** → Use `OPEN_TAB`
- **"click the button"** → Use `CLICK` (DOM action)
- **"open new tab and search"** → Use `OPEN_TAB` + `WAIT` + `TYPE` + `CLICK`
- **"close this tab"** → Use `CLOSE_TAB`
- **"go to example.com"** → Use `NAVIGATE`

### 5. **Architecture Flow**

```
User Request
    ↓
Python Server (server.py)
    ↓
LLM generates action plan (prompt.py)
    ↓
Validation (sanitize.py) - checks both DOM and tab actions
    ↓
Returns to Extension
    ↓
Background Script (background.ts)
    ↓
executeAction() function routes to:
    - Tab Control Actions → Browser APIs (chrome.tabs.*)
    - DOM Actions → Script injection into page
```

### 6. **Key Safety Features**

✅ **Preserved Existing Functionality**: All DOM injection code remains intact
✅ **Clear Separation**: Tab control actions use browser APIs, DOM actions use script injection
✅ **Validation**: sanitize.py validates all new action types
✅ **Wait for Load**: Tab operations wait for page loads before continuing
✅ **Error Handling**: Each action type has proper error handling

### 7. **Testing Examples**

Try these commands:

1. **"Open a new tab and go to YouTube"**
   - Should open new tab with YouTube URL

2. **"Open Google and search for pizza near me"**
   - Should open Google, type query, and submit

3. **"Close the current tab"**
   - Should close the active tab

4. **"Reload this page"**
   - Should reload current tab

5. **"Open 3 tabs with Google, Twitter, and GitHub"**
   - Should create 3 tabs with those URLs

### 8. **No Breaking Changes**

- All existing DOM manipulation continues to work
- Content scripts unchanged
- Popup and sidepanel unchanged
- Only additions, no removals

## Usage

Just send natural language commands like before. The system automatically determines whether to use tab control or DOM actions (or both).

**Simple tab control:**
```
"open a new tab and search for flights"
```

**Complex multi-step:**
```
"open chatgpt, wait for it to load, then type 'hello world' in the prompt"
```

The LLM will generate the appropriate mix of actions automatically!
