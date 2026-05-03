import json
from typing import Any

from core.llm import LargeLanguageModel
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate


parser = StrOutputParser()


prompt_template_str = """
You are an expert Chrome extension automation agent.
Your task is to generate a JSON action plan for web automation.
You will be provided with the DOM structure of the page to help you generate accurate selectors.

Output ONLY valid JSON. No markdown, no code blocks, no explanations.

Available Actions:

=== DOM MANIPULATION ACTIONS (for current page) ===
1. CLICK - Click an element on the page
2. TYPE - Type text into an input/textarea
3. SCROLL - Scroll the page
4. WAIT - Wait for an element or time
5. SELECT - Select a dropdown option
6. EXECUTE_SCRIPT - Run custom JavaScript (use sparingly)

=== TAB & WINDOW CONTROL ACTIONS (browser-level) ===
7. OPEN_TAB - Open a new tab with optional URL
8. CLOSE_TAB - Close a tab (current or by ID)
9. SWITCH_TAB - Switch to a different tab
10. NAVIGATE - Navigate current tab to a URL
11. RELOAD_TAB - Reload/refresh a tab
12. DUPLICATE_TAB - Duplicate current tab

JSON Format Examples:

DOM Action Example:
{{
  "actions": [
    {{
      "type": "TYPE",
      "selector": "textarea#prompt-textarea",
      "value": "text to type",
      "description": "Type into search field"
    }}
  ]
}}

Tab Control Example:
{{
  "actions": [
    {{
      "type": "OPEN_TAB",
      "url": "https://www.google.com/search?q=flights",
      "active": true,
      "description": "Open new tab and search for flights"
    }}
  ]
}}

Search Example (PREFERRED - use search URL directly):
{{
  "actions": [
    {{
      "type": "OPEN_TAB",
      "url": "https://www.google.com/search?q=gen+ai+courses",
      "active": true,
      "description": "Open new tab and search for gen ai courses"
    }}
  ]
}}

Combined Example (only when you need to interact AFTER opening a real website):
{{
  "actions": [
    {{
      "type": "OPEN_TAB",
      "url": "https://www.example.com/login",
      "active": true,
      "description": "Open login page"
    }},
    {{
      "type": "WAIT",
      "time": 2000,
      "description": "Wait for page to load"
    }},
    {{
      "type": "TYPE",
      "selector": "input[name=\"email\"]",
      "value": "user@example.com",
      "description": "Enter email"
    }},
    {{
      "type": "CLICK",
      "selector": "button[type=\"submit\"]",
      "description": "Submit form"
    }}
  ]
}}

CRITICAL RULES:
1. ANALYZE THE USER INTENT:
   - If user says 'open new tab', 'close tab', 'switch tab' -> Use TAB CONTROL actions
   - If user says 'click button', 'type text', 'fill form' -> Use DOM actions
   - If user says 'open new tab AND search' -> Use BOTH (OPEN_TAB + DOM actions)

2. DOM Action Rules:
   - Study the provided DOM structure carefully
   - Use the most specific and reliable selector from the DOM data
   - Prefer: IDs > data attributes > specific classes > tag+type
   - Use placeholder, name, or aria-label attributes when available
   - For ChatGPT: look for 'contenteditable', 'prompt-textarea', or main input areas
   - NEVER use DOM actions on chrome:// URLs (chrome://newtab, chrome://extensions, etc.)

3. Tab Control Action Rules:
   - OPEN_TAB: requires 'url' (string), optional 'active' (boolean, default true)
   - CLOSE_TAB: optional 'tabId' (number, omit to close current tab)
   - SWITCH_TAB: requires 'tabId' (number) or 'direction' ('next'/'prev')
   - NAVIGATE: requires 'url' (string), optional 'tabId' (omit for current)
   - RELOAD_TAB: optional 'tabId' (omit for current), 'bypassCache' (boolean)
   - DUPLICATE_TAB: optional 'tabId' (omit for current)

4. Break complex tasks into simple, atomic steps
5. Add clear descriptions for each action
6. IMPORTANT FOR SEARCHES:
   - ALWAYS construct the full search URL directly in OPEN_TAB action
   - Google: https://www.google.com/search?q=YOUR_QUERY
   - Bing: https://www.bing.com/search?q=YOUR_QUERY
   - DuckDuckGo: https://duckduckgo.com/?q=YOUR_QUERY
   - DO NOT open blank/newtab then try to type - this will FAIL on chrome:// pages

Interactive Elements Format:
Each element shows: tag, type, id, class, placeholder, name, text, ariaLabel
Use this information to craft the perfect selector.

User Input:
{input}
"""


prompt = PromptTemplate(
    template=prompt_template_str,
    input_variables=["input"],
)


runtime_system_prompt_str = """
You are a browser runtime planner in a tight action-observation loop.
Plan exactly one safe next browser action, or finish if the task is done.
You do not execute the action yourself; the extension executes it and returns a new observation.

Return only valid JSON. No markdown.

Allowed action types: NAVIGATE, OPEN_TAB, CLICK, TYPE, KEY_PRESS, HOVER, SCROLL, WAIT, MEDIA_CONTROL.

Required JSON shape:
{{
  "done": boolean,
  "message": string,
  "action": {{
    "type": string,
    "selector": string?,
    "text": string?,
    "role": string?,
    "value": string?,
    "url": string?,
    "active": boolean?,
    "key": string?,
    "command": "mute"|"unmute"|"play"|"pause"?,
    "direction": "up"|"down"|"top"|"bottom"?,
    "amount": number?,
    "ms": number?,
    "description": string
  }} | null,
  "expected_state": string,
  "verification": string,
  "reason": string
}}

Rules:
- Plan one action only.
- Prefer direct navigation/open-tab for obvious destinations or search URLs.
- If the target result is already visible, click it instead of searching again.
- If the task is already complete, set done=true and action=null.
- If the page is blocked by login, captcha, payments, or permissions, finish with a concise message.
- Use selectors from the provided interactive elements when possible.
- Do not repeat the same failed action without a clear change in approach.
"""


def _build_chain(llm_options: dict | None = None):
    llm_options = llm_options or {}
    llm = LargeLanguageModel(**llm_options)
    return prompt | llm.client | parser


def get_chain(llm_options: dict | None = None):
    return _build_chain(llm_options)


def get_runtime_system_prompt() -> str:
    return runtime_system_prompt_str.strip()


def build_runtime_prompt_payload(
    *,
    goal: str,
    step: int,
    max_steps: int,
    current_page: dict[str, Any],
    latest_result: dict[str, Any] | None,
    session_state: dict[str, Any],
    extra_context: dict[str, Any],
) -> str:
    payload = {
        "goal": goal,
        "step": step,
        "max_steps": max_steps,
        "session": session_state,
        "current_page": current_page,
        "latest_result": latest_result,
        "extra_context": extra_context,
    }
    return json.dumps(payload, ensure_ascii=True, default=str)
