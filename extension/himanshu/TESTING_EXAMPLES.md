# Testing Examples for Tab & Window Control

## Quick Test Cases

### 1. Simple Tab Opening
**User Input:** "open a new tab"

**Expected Action Plan:**
```json
{
  "actions": [
    {
      "type": "OPEN_TAB",
      "url": "about:blank",
      "active": true,
      "description": "Open a new blank tab"
    }
  ]
}
```

---

### 2. Open Tab with URL
**User Input:** "open a new tab and go to youtube.com"

**Expected Action Plan:**
```json
{
  "actions": [
    {
      "type": "OPEN_TAB",
      "url": "https://www.youtube.com",
      "active": true,
      "description": "Open YouTube in new tab"
    }
  ]
}
```

---

### 3. Search in New Tab
**User Input:** "open a new tab and search for flights"

**Expected Action Plan:**
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

---

### 4. Complex Multi-Step (Tab + DOM)
**User Input:** "open google and search for pizza near me"

**Expected Action Plan:**
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
      "value": "pizza near me",
      "description": "Type search query"
    },
    {
      "type": "CLICK",
      "selector": "input[name='btnK']",
      "description": "Click search button"
    }
  ]
}
```

---

### 5. Navigate Current Tab
**User Input:** "navigate to github.com"

**Expected Action Plan:**
```json
{
  "actions": [
    {
      "type": "NAVIGATE",
      "url": "https://github.com",
      "description": "Navigate to GitHub"
    }
  ]
}
```

---

### 6. Reload Page
**User Input:** "refresh this page"

**Expected Action Plan:**
```json
{
  "actions": [
    {
      "type": "RELOAD_TAB",
      "description": "Reload current tab"
    }
  ]
}
```

---

### 7. Multiple Tabs
**User Input:** "open 3 tabs: google, twitter, and youtube"

**Expected Action Plan:**
```json
{
  "actions": [
    {
      "type": "OPEN_TAB",
      "url": "https://www.google.com",
      "active": false,
      "description": "Open Google"
    },
    {
      "type": "OPEN_TAB",
      "url": "https://twitter.com",
      "active": false,
      "description": "Open Twitter"
    },
    {
      "type": "OPEN_TAB",
      "url": "https://www.youtube.com",
      "active": true,
      "description": "Open YouTube"
    }
  ]
}
```

---

### 8. ChatGPT Workflow
**User Input:** "open chatgpt, wait for it to load, and type 'write a poem about coding'"

**Expected Action Plan:**
```json
{
  "actions": [
    {
      "type": "OPEN_TAB",
      "url": "https://chat.openai.com",
      "active": true,
      "description": "Open ChatGPT"
    },
    {
      "type": "WAIT",
      "time": 3000,
      "description": "Wait for ChatGPT to load"
    },
    {
      "type": "TYPE",
      "selector": "#prompt-textarea",
      "value": "write a poem about coding",
      "description": "Type prompt into ChatGPT"
    },
    {
      "type": "CLICK",
      "selector": "button[data-testid='send-button']",
      "description": "Send message"
    }
  ]
}
```

---

### 9. Close Tab
**User Input:** "close this tab"

**Expected Action Plan:**
```json
{
  "actions": [
    {
      "type": "CLOSE_TAB",
      "description": "Close current tab"
    }
  ]
}
```

---

### 10. Switch Tabs
**User Input:** "switch to next tab"

**Expected Action Plan:**
```json
{
  "actions": [
    {
      "type": "SWITCH_TAB",
      "direction": "next",
      "description": "Switch to next tab"
    }
  ]
}
```

---

## Testing Workflow

1. **Start the Python server:**
   ```bash
   cd himanshu
   python server.py
   ```

2. **Build the extension:**
   ```bash
   cd Extension
   npm run dev
   ```

3. **Test via the extension UI** or send POST requests:

   ```bash
   curl -X POST http://localhost:8080/generate-script \
     -H "Content-Type: application/json" \
     -d '{
       "goal": "open a new tab and search for flights",
       "target_url": "",
       "dom_structure": {}
     }'
   ```

4. **Verify the response** contains proper action types and parameters

5. **Execute the action plan** through the extension background script

---

## Validation Checklist

✅ Tab control actions don't require DOM structure
✅ DOM actions still require selectors
✅ Mixed workflows combine both action types properly
✅ Wait actions inserted between tab operations and DOM manipulation
✅ URLs are properly formatted
✅ New tabs wait for load completion before DOM actions
✅ Active tab switching works correctly

---

## Common Patterns

### Pattern 1: Research Task
"Open 5 tabs with different search queries about machine learning"

### Pattern 2: Form Filling
"Go to contact form and fill out my details"

### Pattern 3: Social Media Automation
"Open Twitter, type a tweet, and schedule it"

### Pattern 4: Data Collection
"Open product page, extract price, close tab, repeat for next URL"

### Pattern 5: Multi-Site Workflow
"Open Gmail, check inbox, then open Slack, send a message"

All of these now work with the enhanced system!
