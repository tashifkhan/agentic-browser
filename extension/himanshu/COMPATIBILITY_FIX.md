# Compatibility Fix: Chrome Internal Pages

## Problem Identified

When users request to "open a new tab and search for X", the system was generating action plans like:

```json
{
  "actions": [
    {"type": "OPEN_TAB", "url": "about:blank"},  // or chrome://newtab
    {"type": "TYPE", "selector": "input[name='q']", "value": "search query"},
    {"type": "CLICK", "selector": "button"}
  ]
}
```

**This FAILS because:**
- Chrome extensions cannot inject scripts into `chrome://` URLs (security restriction)
- `chrome://newtab/` and `about:blank` are protected internal pages
- DOM actions (TYPE, CLICK) require script injection, which is blocked on these pages

## Solution Implemented

### ✅ Updated Prompt Strategy

The LLM now generates search queries directly in the URL:

```json
{
  "actions": [
    {
      "type": "OPEN_TAB",
      "url": "https://www.google.com/search?q=gen+ai+courses",
      "active": true,
      "description": "Open new tab and search for gen ai courses"
    }
  ]
}
```

### Key Changes

#### 1. Enhanced `prompt.py` Rules

Added explicit instruction:
```
6. **IMPORTANT FOR SEARCHES**: When user wants to 'search for X' or 'open tab and search':
   - ALWAYS construct the full search URL directly in OPEN_TAB action
   - Google: https://www.google.com/search?q=YOUR_QUERY
   - Bing: https://www.bing.com/search?q=YOUR_QUERY
   - DuckDuckGo: https://duckduckgo.com/?q=YOUR_QUERY
   - DO NOT open blank/newtab then try to type - this will FAIL on chrome:// pages
```

Also added:
```
- NEVER use DOM actions on chrome:// URLs (chrome://newtab, chrome://extensions, etc.)
```

#### 2. Updated Examples

**Before (WRONG):**
```json
{
  "actions": [
    {"type": "OPEN_TAB", "url": "https://www.google.com"},
    {"type": "TYPE", "selector": "textarea[name='q']", "value": "search term"},
    {"type": "CLICK", "selector": "input[type='submit']"}
  ]
}
```

**After (CORRECT):**
```json
{
  "actions": [
    {
      "type": "OPEN_TAB",
      "url": "https://www.google.com/search?q=search+term"
    }
  ]
}
```

#### 3. Enhanced `server.py` Context

Added critical warnings in the user prompt:
```
⚠️ CRITICAL FOR SEARCHES:
- When user wants to 'search for X' or 'open new tab and search for X':
  → Use OPEN_TAB with the complete search URL
  → DO NOT open chrome://newtab or about:blank and then try to type
  → Encode spaces in URL as '+' or '%20'
- Only use TYPE/CLICK actions if target is a real website (http/https)
```

## Search URL Formats

### Google
```
https://www.google.com/search?q=YOUR_QUERY
```
Example: `https://www.google.com/search?q=gen+ai+courses`

### Bing
```
https://www.bing.com/search?q=YOUR_QUERY
```
Example: `https://www.bing.com/search?q=machine+learning`

### DuckDuckGo
```
https://duckduckgo.com/?q=YOUR_QUERY
```
Example: `https://duckduckgo.com/?q=python+tutorials`

### YouTube
```
https://www.youtube.com/results?search_query=YOUR_QUERY
```
Example: `https://www.youtube.com/results?search_query=javascript+tutorial`

### Amazon
```
https://www.amazon.com/s?k=YOUR_QUERY
```
Example: `https://www.amazon.com/s?k=laptop`

### GitHub
```
https://github.com/search?q=YOUR_QUERY
```
Example: `https://github.com/search?q=react+hooks`

## URL Encoding

Spaces should be encoded as:
- `+` (preferred for search engines)
- `%20` (also valid)

Special characters:
- `&` → `%26`
- `#` → `%23`
- `=` → `%3D`

## When to Use DOM Actions vs Direct URLs

### ✅ Use Direct URL (Preferred):
- Searching on any search engine
- Opening specific pages
- Simple navigation tasks
- Any query that can be expressed in a URL

### ✅ Use DOM Actions:
- Complex form filling (multiple fields)
- Interactions that can't be URL-encoded
- Actions on already-open pages
- Dynamic interactions (clicking specific buttons, scrolling, etc.)

### ❌ Never Do:
- Open `chrome://` or `about:` URLs then try DOM actions
- Use DOM actions before verifying the page is loaded
- Assume chrome new tab page has accessible search box

## Testing

### Test Case 1: Simple Search ✅
**Input:** "open a new tab and search for gen ai courses"

**Generated:**
```json
{
  "actions": [
    {
      "type": "OPEN_TAB",
      "url": "https://www.google.com/search?q=gen+ai+courses",
      "active": true
    }
  ]
}
```

**Result:** ✅ Opens Google with search results

### Test Case 2: Complex Interaction ✅
**Input:** "go to example.com and fill the login form"

**Generated:**
```json
{
  "actions": [
    {
      "type": "OPEN_TAB",
      "url": "https://www.example.com/login",
      "active": true
    },
    {
      "type": "WAIT",
      "time": 2000
    },
    {
      "type": "TYPE",
      "selector": "input[name='email']",
      "value": "user@example.com"
    },
    {
      "type": "CLICK",
      "selector": "button[type='submit']"
    }
  ]
}
```

**Result:** ✅ Opens page and interacts with form

## Summary

The fix ensures that:
1. ✅ Search queries use direct URLs instead of trying to interact with new tab page
2. ✅ LLM understands chrome:// pages are off-limits for DOM actions
3. ✅ Clear examples show the preferred pattern
4. ✅ User prompts reinforce the correct approach

This resolves the compatibility issue while maintaining all existing functionality!
