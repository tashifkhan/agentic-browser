import re
import json

# DOM manipulation actions (require tab context)
DOM_ACTIONS = ["CLICK", "TYPE", "SCROLL", "WAIT", "SELECT", "EXECUTE_SCRIPT"]

# Tab/Window control actions (browser-level)
TAB_CONTROL_ACTIONS = ["OPEN_TAB", "CLOSE_TAB", "SWITCH_TAB", "NAVIGATE", "RELOAD_TAB", "DUPLICATE_TAB"]

VALID_ACTIONS = DOM_ACTIONS + TAB_CONTROL_ACTIONS


def sanitize_json_actions(response_text):
    """Sanitize and validate JSON action plan from LLM"""
    problems = []
    
    # Remove markdown code fences if present
    response_text = re.sub(r"```[a-zA-Z]*\n?", "", response_text).strip()
    response_text = response_text.replace("```", "").strip()
    
    try:
        # Parse JSON
        data = json.loads(response_text)
        
        # Validate structure
        if "actions" not in data:
            problems.append("Missing 'actions' array in JSON")
            return None, problems
        
        if not isinstance(data["actions"], list):
            problems.append("'actions' must be an array")
            return None, problems
        
        if len(data["actions"]) == 0:
            problems.append("No actions provided")
            return None, problems
        
        # Validate each action
        for i, action in enumerate(data["actions"]):
            if "type" not in action:
                problems.append(f"Action {i}: missing 'type' field")
                continue
            
            if action["type"] not in VALID_ACTIONS:
                problems.append(f"Action {i}: invalid type '{action['type']}'")
            
            # DOM action validation
            if action["type"] in ["CLICK", "TYPE", "SELECT"]:
                if "selector" not in action:
                    problems.append(f"Action {i}: missing 'selector' field")
            
            if action["type"] == "TYPE":
                if "value" not in action:
                    problems.append(f"Action {i}: missing 'value' field")
            
            if action["type"] == "EXECUTE_SCRIPT":
                if "script" not in action:
                    problems.append(f"Action {i}: missing 'script' field")
                else:
                    # Basic safety check on custom scripts
                    script = action["script"]
                    dangerous = ["eval(", "new Function", "innerHTML =", "outerHTML ="]
                    for pattern in dangerous:
                        if pattern in script:
                            problems.append(f"Action {i}: dangerous pattern '{pattern}' in custom script")
            
            # Tab control action validation
            if action["type"] == "OPEN_TAB":
                if "url" not in action:
                    problems.append(f"Action {i}: OPEN_TAB requires 'url' field")
            
            if action["type"] == "NAVIGATE":
                if "url" not in action:
                    problems.append(f"Action {i}: NAVIGATE requires 'url' field")
            
            if action["type"] == "SWITCH_TAB":
                if "tabId" not in action and "direction" not in action:
                    problems.append(f"Action {i}: SWITCH_TAB requires either 'tabId' or 'direction' field")
        
        return data, problems
        
    except json.JSONDecodeError as e:
        problems.append(f"Invalid JSON: {str(e)}")
        return None, problems


# Keep the old function for backward compatibility
def sanitize_js(js_text):
    """Legacy function for JS code validation"""
    DISALLOWED = [
        r"eval\s*\(",
        r"new Function",
        r"child_process",
        r"fs\.",
        r"require\s*\(",
        r"XMLHttpRequest",
        r"importScripts"
    ]
    
    problems = []
    js_text = re.sub(r"```[a-zA-Z]*", "", js_text).replace("```", "").strip()
    
    for p in DISALLOWED:
        if re.search(p, js_text, flags=re.IGNORECASE):
            problems.append(f"Found disallowed pattern: {p}")
    
    return js_text, problems
