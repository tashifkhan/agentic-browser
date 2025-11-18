import os
from flask import Flask, request, jsonify
from flask_socketio import SocketIO, emit, disconnect
from flask_cors import CORS
from dotenv import load_dotenv
import logging
import asyncio
import json
from threading import Thread
from bs4 import BeautifulSoup
import re

from langchain_groq import ChatGroq
from generator.prompt import SCRIPT_PROMPT
from generator.sanitize import sanitize_json_actions
from generator.conversation_manager import ConversationManager

# Import agent system
from langchain.agents import create_agent
from agents.agent import agent, set_websocket_callback

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key-here')

# Enable CORS for the extension
CORS(app, resources={r"/*": {"origins": "*"}})

# Initialize SocketIO with proper configuration
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode='threading',
    ping_timeout=60,
    ping_interval=25,
    logger=True,
    engineio_logger=True
)

api_key = os.getenv("GROQ_API_KEY")

# Track connected clients and their pending tool calls
connected_clients = {}  # {client_id: {"sid": sid, "pending_tool_calls": {}}}

# Track active agent execution threads
active_agent_threads = {}  # {client_id: {"thread": thread, "stop_flag": bool}}

# Initialize LangChain Groq Model
llm = ChatGroq(
    api_key=api_key,
    model="openai/gpt-oss-120b",  # or any Groq LLM you want
    temperature=0.2,
)

# Initialize Conversation Manager
conversation_manager = ConversationManager()


@app.route("/generate-script", methods=["POST"])
def generate_script():
    data = request.get_json() or {}
    goal = data.get("goal")
    target_url = data.get("target_url", "")
    dom_structure = data.get("dom_structure", {})
    constraints = data.get("constraints", {})

    if not goal:
        return jsonify({"error": "Missing 'goal'"}), 400

    try:
        # Get relevant context from past interactions
        relevant_context = conversation_manager.get_relevant_context(
            goal=goal,
            target_url=target_url,
            k=3  # Get top 3 similar interactions
        )
        
        # Format DOM structure for the prompt
        dom_info = ""
        if dom_structure:
            dom_info = f"\n\n=== PAGE INFORMATION ===\n"
            dom_info += f"URL: {dom_structure.get('url', target_url)}\n"
            dom_info += f"Title: {dom_structure.get('title', 'Unknown')}\n\n"
            
            interactive = dom_structure.get('interactive', [])
            if interactive:
                dom_info += f"=== INTERACTIVE ELEMENTS ({len(interactive)} found) ===\n"
                for i, elem in enumerate(interactive[:30], 1):  # Limit to 30 to avoid token limits
                    dom_info += f"\n{i}. {elem.get('tag', 'unknown')}"
                    if elem.get('id'):
                        dom_info += f" id=\"{elem['id']}\""
                    if elem.get('class'):
                        dom_info += f" class=\"{elem['class']}\""
                    if elem.get('type'):
                        dom_info += f" type=\"{elem['type']}\""
                    if elem.get('placeholder'):
                        dom_info += f" placeholder=\"{elem['placeholder']}\""
                    if elem.get('name'):
                        dom_info += f" name=\"{elem['name']}\""
                    if elem.get('ariaLabel'):
                        dom_info += f" aria-label=\"{elem['ariaLabel']}\""
                    if elem.get('text'):
                        dom_info += f"\n   Text: {elem['text'][:80]}"
                dom_info += "\n"

        # Format context from similar past interactions
        context_info = conversation_manager.format_context_for_prompt(relevant_context)

        user_prompt = (
            f"Goal: {goal}\n"
            f"Target URL: {target_url}\n"
            f"Constraints: {constraints}"
            f"{context_info}"
            f"{dom_info}\n\n"
            "IMPORTANT: Analyze the goal carefully:\n"
            "- If the goal involves opening/closing/switching tabs or navigating to URLs, use TAB CONTROL actions\n"
            "- If the goal involves interacting with page elements (clicking, typing), use DOM actions\n"
            "- If the goal requires both (e.g., 'open new tab and search'), combine both action types\n\n"
            "⚠️ CRITICAL FOR SEARCHES:\n"
            "- When user wants to 'search for X' or 'open new tab and search for X':\n"
            "  → Use OPEN_TAB with the complete search URL (e.g., https://www.google.com/search?q=X)\n"
            "  → DO NOT open chrome://newtab or about:blank and then try to type - this FAILS\n"
            "  → Encode spaces in URL as '+' or '%20'\n"
            "- Only use TYPE/CLICK actions if the target is a real website (http/https), not chrome:// pages\n\n"
            "Based on the page structure and past successful interactions above, "
            "generate the most accurate JSON action plan."
        )

        # LangChain prompt → Groq LLM
        ai_response = SCRIPT_PROMPT | llm
        result = ai_response.invoke({"input": user_prompt}).content

        action_plan, problems = sanitize_json_actions(result)

        if problems:
            return jsonify({
                "ok": False,
                "error": "Action plan failed validation.",
                "problems": problems,
                "raw_response": result[:1000]
            }), 400

        # Store this interaction for future reference
        conversation_manager.add_interaction(
            goal=goal,
            target_url=target_url,
            dom_structure=dom_structure,
            action_plan=action_plan,
            result=None  # Will be updated later via /update-result endpoint
        )

        return jsonify({
            "ok": True,
            "action_plan": action_plan,
            "context_used": len(relevant_context) > 0,
            "similar_interactions": len(relevant_context)
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/update-result", methods=["POST"])
def update_result():
    """Update the result of the last action plan execution"""
    data = request.get_json() or {}
    result = data.get("result", {})
    
    try:
        # Get the last interaction from current session
        session_history = conversation_manager.get_session_history()
        if session_history:
            last_interaction = session_history[-1]
            
            # Re-add with updated result
            conversation_manager.add_interaction(
                goal=last_interaction["goal"],
                target_url=last_interaction["target_url"],
                dom_structure={},  # Already stored
                action_plan=last_interaction["action_plan"],
                result=result
            )
        
        return jsonify({
            "ok": True,
            "message": "Result updated successfully"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/conversation-stats", methods=["GET"])
def get_conversation_stats():
    """Get statistics about conversation history"""
    try:
        stats = conversation_manager.get_statistics()
        return jsonify({
            "ok": True,
            "stats": stats
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/clear-session", methods=["POST"])
def clear_session():
    """Clear current session history"""
    try:
        conversation_manager.clear_session()
        return jsonify({
            "ok": True,
            "message": "Session cleared successfully"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/clear-history", methods=["POST"])
def clear_history():
    """Clear all conversation history"""
    try:
        conversation_manager.clear_all_history()
        logger.info("✅ Conversation history cleared via HTTP")
        return jsonify({
            "ok": True,
            "message": "Conversation history cleared successfully"
        })
    except Exception as e:
        logger.error(f"Error clearing history: {str(e)}")
        return jsonify({"error": str(e)}), 500


# =================================================================
# WEBSOCKET EVENT HANDLERS
# =================================================================

@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    client_id = request.sid  # type: ignore
    connected_clients[client_id] = {
        "sid": client_id,
        "pending_tool_calls": {}
    }
    logger.info(f"Client connected: {client_id}. Total clients: {len(connected_clients)}")
    
    emit('connection_established', {
        'status': 'connected',
        'client_id': client_id,
        'message': 'WebSocket connection established successfully'
    })

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    client_id = request.sid  # type: ignore
    if client_id in connected_clients:
        del connected_clients[client_id]
    logger.info(f"Client disconnected: {client_id}. Total clients: {len(connected_clients)}")

@socketio.on('ping')
def handle_ping(data):
    """Handle ping from client to keep connection alive"""
    emit('pong', {'timestamp': data.get('timestamp'), 'server_time': os.times().elapsed})

@socketio.on('generate_script_ws')
def handle_generate_script_ws(data):
    """WebSocket version of generate-script endpoint"""
    goal = data.get('goal')
    target_url = data.get('target_url', '')
    dom_structure = data.get('dom_structure', {})
    constraints = data.get('constraints', {})
    
    if not goal:
        emit('script_error', {'error': 'Missing "goal"'})
        return
    
    try:
        # Send progress update
        emit('script_progress', {'status': 'analyzing', 'message': 'Analyzing request...'})
        
        # Get relevant context from past interactions
        relevant_context = conversation_manager.get_relevant_context(
            goal=goal,
            target_url=target_url,
            k=3
        )
        
        emit('script_progress', {'status': 'extracting_dom', 'message': 'Processing page structure...'})
        
        # Format DOM structure for the prompt
        dom_info = ""
        if dom_structure:
            dom_info = f"\n\n=== PAGE INFORMATION ===\n"
            dom_info += f"URL: {dom_structure.get('url', target_url)}\n"
            dom_info += f"Title: {dom_structure.get('title', 'Unknown')}\n\n"
            
            interactive = dom_structure.get('interactive', [])
            if interactive:
                dom_info += f"=== INTERACTIVE ELEMENTS ({len(interactive)} found) ===\n"
                for i, elem in enumerate(interactive[:30], 1):
                    dom_info += f"\n{i}. {elem.get('tag', 'unknown')}"
                    if elem.get('id'):
                        dom_info += f" id=\"{elem['id']}\""
                    if elem.get('class'):
                        dom_info += f" class=\"{elem['class']}\""
                    if elem.get('type'):
                        dom_info += f" type=\"{elem['type']}\""
                    if elem.get('placeholder'):
                        dom_info += f" placeholder=\"{elem['placeholder']}\""
                    if elem.get('name'):
                        dom_info += f" name=\"{elem['name']}\""
                    if elem.get('ariaLabel'):
                        dom_info += f" aria-label=\"{elem['ariaLabel']}\""
                    if elem.get('text'):
                        dom_info += f"\n   Text: {elem['text'][:80]}"
                dom_info += "\n"
        
        emit('script_progress', {'status': 'generating', 'message': 'Generating action plan...'})
        
        # Format context from similar past interactions
        context_info = conversation_manager.format_context_for_prompt(relevant_context)
        
        user_prompt = (
            f"Goal: {goal}\n"
            f"Target URL: {target_url}\n"
            f"Constraints: {constraints}"
            f"{context_info}"
            f"{dom_info}\n\n"
            "IMPORTANT: Analyze the goal carefully:\n"
            "- If the goal involves opening/closing/switching tabs or navigating to URLs, use TAB CONTROL actions\n"
            "- If the goal involves interacting with page elements (clicking, typing), use DOM actions\n"
            "- If the goal requires both (e.g., 'open new tab and search'), combine both action types\n\n"
            "⚠️ CRITICAL FOR SEARCHES:\n"
            "- When user wants to 'search for X' or 'open new tab and search for X':\n"
            "  → Use OPEN_TAB with the complete search URL (e.g., https://www.google.com/search?q=X)\n"
            "  → DO NOT open chrome://newtab or about:blank and then try to type - this FAILS\n"
            "  → Encode spaces in URL as '+' or '%20'\n"
            "- Only use TYPE/CLICK actions if the target is a real website (http/https), not chrome:// pages\n\n"
            "Based on the page structure and past successful interactions above, "
            "generate the most accurate JSON action plan."
        )
        
        # LangChain prompt → Groq LLM
        ai_response = SCRIPT_PROMPT | llm
        result = ai_response.invoke({"input": user_prompt}).content
        
        emit('script_progress', {'status': 'validating', 'message': 'Validating action plan...'})
        
        action_plan, problems = sanitize_json_actions(result)
        
        if problems:
            emit('script_error', {
                'error': 'Action plan failed validation.',
                'problems': problems,
                'raw_response': result[:1000]
            })
            return
        
        # Store this interaction for future reference
        conversation_manager.add_interaction(
            goal=goal,
            target_url=target_url,
            dom_structure=dom_structure,
            action_plan=action_plan,
            result=None
        )
        
        emit('script_generated', {
            'ok': True,
            'action_plan': action_plan,
            'context_used': len(relevant_context) > 0,
            'similar_interactions': len(relevant_context)
        })
        
    except Exception as e:
        logger.error(f"Error generating script: {str(e)}")
        emit('script_error', {'error': str(e)})

@socketio.on('update_result_ws')
def handle_update_result_ws(data):
    """WebSocket version of update-result endpoint"""
    result = data.get('result', {})
    
    try:
        session_history = conversation_manager.get_session_history()
        if session_history:
            last_interaction = session_history[-1]
            
            conversation_manager.add_interaction(
                goal=last_interaction["goal"],
                target_url=last_interaction["target_url"],
                dom_structure={},
                action_plan=last_interaction["action_plan"],
                result=result
            )
        
        emit('result_updated', {
            'ok': True,
            'message': 'Result updated successfully'
        })
    except Exception as e:
        logger.error(f"Error updating result: {str(e)}")
        emit('update_error', {'error': str(e)})

@socketio.on('get_stats_ws')
def handle_get_stats_ws():
    """WebSocket version of conversation-stats endpoint"""
    try:
        stats = conversation_manager.get_statistics()
        emit('stats_response', {
            'ok': True,
            'stats': stats
        })
    except Exception as e:
        logger.error(f"Error getting stats: {str(e)}")
        emit('stats_error', {'error': str(e)})

@socketio.on('clear_history_ws')
def handle_clear_history_ws():
    """WebSocket version of clear-history endpoint"""
    try:
        conversation_manager.clear_all_history()
        logger.info("✅ Conversation history cleared via WebSocket")
        emit('history_cleared', {
            'ok': True,
            'message': 'Conversation history cleared successfully'
        })
    except Exception as e:
        logger.error(f"Error clearing history: {str(e)}")
        emit('clear_error', {'error': str(e)})

# =================================================================
# AGENT TOOL EXECUTION HANDLERS
# =================================================================

def optimize_dom_data(result: dict) -> dict:
    """Intelligently compress DOM data while retaining essential information for LLM"""
    if not isinstance(result, dict) or not result.get('success'):
        return result
    
    data = result.get('data')
    if not data:
        return result
    
    # Check if this is DOM-related data
    is_dom_data = False
    if isinstance(data, dict):
        # Check for DOM structure indicators
        if 'tag' in data or 'children' in data or 'interactive' in data:
            is_dom_data = True
    elif isinstance(data, str):
        # Check if it's HTML content
        if '<html' in data.lower() or '<body' in data.lower() or '<div' in data.lower():
            is_dom_data = True
    
    if not is_dom_data:
        return result
    
    logger.info("🔬 Optimizing DOM data to reduce token usage...")
    original_size = len(json.dumps(result))
    
    try:
        optimized_data = compress_dom_structure(data)
        result['data'] = optimized_data
        
        new_size = len(json.dumps(result))
        reduction = ((original_size - new_size) / original_size * 100) if original_size > 0 else 0
        
        logger.info(f"✅ DOM optimized: {original_size} → {new_size} bytes ({reduction:.1f}% reduction)")
        
    except Exception as e:
        logger.warning(f"⚠️ DOM optimization failed: {e}, returning original")
    
    return result

def compress_dom_structure(data):
    """Compress DOM structure intelligently"""
    if isinstance(data, dict):
        return compress_dom_dict(data)
    elif isinstance(data, str):
        return compress_html_string(data)
    elif isinstance(data, list):
        return [compress_dom_structure(item) for item in data[:50]]  # Limit list size
    else:
        return data

def compress_dom_dict(node: dict) -> dict:
    """Compress a DOM node dict while keeping essential info"""
    compressed = {}
    
    # Always keep these essential fields
    essential_fields = ['tag', 'id', 'name', 'type', 'placeholder', 'ariaLabel', 'role', 'href', 'src', 'value', 'alt', 'title']
    for field in essential_fields:
        if field in node and node[field]:
            compressed[field] = node[field]
    
    # Handle class attribute - keep only meaningful classes
    if 'class' in node or 'className' in node:
        classes = node.get('class') or node.get('className', '')
        if classes:
            # Filter out utility/layout classes, keep semantic ones
            if isinstance(classes, str):
                class_list = classes.split()
                meaningful_classes = [c for c in class_list if is_meaningful_class(c)]
                if meaningful_classes:
                    compressed['class'] = ' '.join(meaningful_classes[:5])  # Max 5 classes
    
    # Handle text - truncate but keep essential info
    if 'text' in node:
        text = node['text']
        if text and isinstance(text, str):
            text = text.strip()
            if text:
                # Keep first 100 chars for interactive elements, 50 for others
                is_interactive = node.get('tag') in ['button', 'a', 'input', 'textarea', 'select']
                max_len = 100 if is_interactive else 50
                compressed['text'] = text[:max_len] + ('...' if len(text) > max_len else '')
    
    # Handle attributes - only keep interactive/semantic ones
    if 'attributes' in node and isinstance(node['attributes'], dict):
        important_attrs = {}
        for key, value in node['attributes'].items():
            if is_important_attribute(key, value):
                # Truncate long attribute values
                str_value = str(value)
                important_attrs[key] = str_value[:100] if len(str_value) > 100 else str_value
        if important_attrs:
            compressed['attrs'] = important_attrs
    
    # Handle children - recursively compress, limit depth and breadth
    if 'children' in node and isinstance(node['children'], list):
        # Only keep interactive or semantic children
        important_children = []
        for child in node['children'][:20]:  # Max 20 children per node
            if isinstance(child, dict):
                child_tag = child.get('tag', '')
                # Keep interactive, form, semantic, or children with meaningful content
                if (child_tag in ['button', 'a', 'input', 'textarea', 'select', 'form', 'nav', 'main', 'header', 'footer', 'article', 'section'] or
                    child.get('id') or 
                    child.get('role') or
                    (child.get('text', '').strip() and len(child.get('text', '').strip()) > 5)):
                    important_children.append(compress_dom_dict(child))
        
        if important_children:
            compressed['children'] = important_children
    
    # Handle interactive elements list
    if 'interactive' in node and isinstance(node['interactive'], list):
        compressed['interactive'] = [
            compress_interactive_element(elem) 
            for elem in node['interactive'][:30]  # Max 30 interactive elements
        ]
    
    return compressed

def compress_interactive_element(elem: dict) -> dict:
    """Compress interactive element info"""
    compressed = {}
    
    # Essential fields for element identification
    for field in ['tag', 'type', 'id', 'name', 'placeholder', 'ariaLabel']:
        if field in elem and elem[field]:
            compressed[field] = elem[field]
    
    # Simplified class
    if 'class' in elem:
        classes = elem['class']
        if isinstance(classes, str):
            class_list = classes.split()
            meaningful = [c for c in class_list if is_meaningful_class(c)]
            if meaningful:
                compressed['class'] = ' '.join(meaningful[:3])
    
    # Truncated text
    if 'text' in elem and elem['text']:
        text = elem['text'].strip()
        if text:
            compressed['text'] = text[:80] + ('...' if len(text) > 80 else '')
    
    return compressed

def compress_html_string(html: str) -> dict:
    """Parse and compress raw HTML string using BeautifulSoup"""
    try:
        soup = BeautifulSoup(html, 'html.parser')
        
        # Extract meaningful content
        result = {
            'title': soup.title.string if soup.title else None,
            'interactive_elements': [],
            'text_content': [],
            'forms': []
        }
        
        # Find all interactive elements
        interactive_selectors = ['button', 'a', 'input', 'textarea', 'select', '[role="button"]', '[contenteditable="true"]']
        for selector in interactive_selectors:
            for elem in soup.select(selector)[:15]:  # Limit per type
                elem_info = {
                    'tag': elem.name,
                    'id': elem.get('id'),
                    'class': ' '.join([c for c in elem.get('class', []) if is_meaningful_class(c)][:3]),
                    'type': elem.get('type'),
                    'name': elem.get('name'),
                    'placeholder': elem.get('placeholder'),
                    'text': elem.get_text(strip=True)[:60]
                }
                # Remove None/empty values
                elem_info = {k: v for k, v in elem_info.items() if v}
                if elem_info:
                    result['interactive_elements'].append(elem_info)
        
        # Extract forms
        for form in soup.find_all('form')[:5]:
            form_info = {
                'id': form.get('id'),
                'action': form.get('action'),
                'method': form.get('method'),
                'inputs': []
            }
            
            for inp in form.find_all(['input', 'textarea', 'select'])[:10]:
                form_info['inputs'].append({
                    'type': inp.get('type'),
                    'name': inp.get('name'),
                    'id': inp.get('id'),
                    'placeholder': inp.get('placeholder')
                })
            
            result['forms'].append({k: v for k, v in form_info.items() if v})
        
        # Extract main text content (headings, paragraphs)
        for tag in soup.find_all(['h1', 'h2', 'h3', 'p'])[:20]:
            text = tag.get_text(strip=True)
            if text and len(text) > 10:
                result['text_content'].append({
                    'tag': tag.name,
                    'text': text[:100] + ('...' if len(text) > 100 else '')
                })
        
        return {k: v for k, v in result.items() if v}  # Remove empty fields
        
    except Exception as e:
        logger.error(f"Error parsing HTML: {e}")
        # Fallback: return truncated string
        return {'raw': html[:500] + '...' if len(html) > 500 else html}

def is_meaningful_class(class_name: str) -> bool:
    """Check if a CSS class is meaningful for LLM (not just layout/utility)"""
    if not class_name or len(class_name) < 2:
        return False
    
    # Skip common utility classes
    utility_patterns = [
        r'^(p|m|pt|pb|pl|pr|mt|mb|ml|mr|px|py|mx|my)-\d+$',  # Tailwind spacing
        r'^(w|h|min-w|min-h|max-w|max-h)-',  # Size utilities
        r'^(flex|grid|block|inline|hidden)',  # Layout utilities
        r'^(text|font|leading|tracking)-',  # Text utilities
        r'^(bg|border|rounded|shadow)-',  # Styling utilities
        r'^(absolute|relative|fixed|sticky)',  # Position utilities
        r'^(col-|row-|gap-|space-)',  # Grid utilities
    ]
    
    for pattern in utility_patterns:
        if re.match(pattern, class_name, re.IGNORECASE):
            return False
    
    # Keep semantic classes
    semantic_keywords = ['button', 'nav', 'menu', 'modal', 'dialog', 'form', 'input', 'submit', 'search', 
                         'header', 'footer', 'main', 'content', 'sidebar', 'active', 'selected', 'disabled',
                         'primary', 'secondary', 'login', 'signup', 'profile', 'settings', 'dropdown']
    
    class_lower = class_name.lower()
    for keyword in semantic_keywords:
        if keyword in class_lower:
            return True
    
    # Keep if it looks like a component name (CamelCase or kebab-case with meaning)
    if len(class_name) > 4 and ('-' in class_name or any(c.isupper() for c in class_name)):
        return True
    
    return False

def is_important_attribute(key: str, value) -> bool:
    """Check if an attribute is important for LLM understanding"""
    important_attrs = [
        'data-test', 'data-testid', 'data-cy', 'data-id', 'data-action',
        'aria-label', 'aria-describedby', 'role', 'title', 'alt',
        'href', 'src', 'action', 'method', 'target', 'rel',
        'name', 'id', 'type', 'value', 'placeholder', 'required',
        'disabled', 'readonly', 'checked', 'selected'
    ]
    
    key_lower = key.lower()
    
    # Check exact matches
    if key_lower in important_attrs:
        return True
    
    # Check prefixes
    if key_lower.startswith('data-') and len(key_lower) > 5:
        return True
    
    if key_lower.startswith('aria-'):
        return True
    
    return False

@socketio.on('execute_agent_ws')
def handle_execute_agent_ws(data):
    """Execute the LangChain agent with sophisticated tools"""
    goal = data.get('goal')
    client_id = request.sid  # type: ignore
    
    logger.info(f"\n{'='*80}")
    logger.info(f"🚀 AGENT EXECUTION STARTED")
    logger.info(f"Client ID: {client_id}")
    logger.info(f"Goal: {goal}")
    logger.info(f"{'='*80}\n")
    
    if not goal:
        logger.error("❌ Missing goal parameter")
        emit('agent_error', {'error': 'Missing "goal"'})
        return
    
    try:
        emit('agent_progress', {
            'status': 'initializing',
            'message': 'Starting agent execution...'
        })
        logger.info("📤 Sent 'initializing' progress update")
        
        # Set up WebSocket callback for tool execution
        async def tool_callback(action_type: str, params: dict):
            """Callback function for tools to execute browser actions"""
            import uuid
            tool_id = str(uuid.uuid4())
            
            logger.info(f"\n{'='*60}")
            logger.info(f"🔧 TOOL CALLBACK TRIGGERED")
            logger.info(f"Tool ID: {tool_id}")
            logger.info(f"Action Type: {action_type}")
            logger.info(f"Params: {json.dumps(params, indent=2)}")
            logger.info(f"{'='*60}\n")
            
            # Store pending tool call
            if client_id in connected_clients:
                connected_clients[client_id]["pending_tool_calls"][tool_id] = {
                    "action_type": action_type,
                    "params": params,
                    "result": None,
                    "completed": False
                }
                logger.info(f"✅ Stored pending tool call for client {client_id}")
            else:
                logger.error(f"❌ Client {client_id} not found in connected_clients")
            
            # Send tool execution request to extension
            logger.info(f"📤 Sending tool_execution_request to extension...")
            socketio.emit('tool_execution_request', {
                'tool_id': tool_id,
                'action_type': action_type,
                'params': params
            }, to=client_id)
            logger.info(f"✅ Tool execution request sent")
            
            # Wait for result with timeout
            max_wait = 30  # 30 seconds timeout
            waited = 0
            logger.info(f"⏳ Waiting for tool result (timeout: {max_wait}s)...")
            
            while waited < max_wait:
                await asyncio.sleep(0.1)
                waited += 0.1
                
                if waited % 5 == 0:  # Log every 5 seconds
                    logger.info(f"⏱️  Still waiting... ({waited}s elapsed)")
                
                if client_id in connected_clients:
                    tool_call = connected_clients[client_id]["pending_tool_calls"].get(tool_id)
                    if tool_call and tool_call["completed"]:
                        result = tool_call["result"]
                        logger.info(f"✅ Tool result received after {waited:.1f}s")
                        
                        # Optimize DOM data if present
                        if action_type in ['GET_PAGE_INFO', 'EXTRACT_DOM', 'FIND_ELEMENTS']:
                            result = optimize_dom_data(result)
                        
                        logger.info(f"Result: {json.dumps(result, indent=2)[:500]}...")
                        # Clean up
                        del connected_clients[client_id]["pending_tool_calls"][tool_id]
                        return result
            
            # Timeout
            logger.error(f"⏰ Tool execution TIMEOUT after {max_wait}s")
            logger.error(f"Tool ID: {tool_id}, Action: {action_type}")
            return {"success": False, "error": "Tool execution timeout"}
        
        # Set the callback for agent tools
        set_websocket_callback(tool_callback)
        
        emit('agent_progress', {
            'status': 'planning',
            'message': 'Agent is analyzing the task and planning actions...'
        })
        
        # Execute agent in a separate thread to avoid blocking
        def run_agent():
            try:
                # Check if stop was requested
                if client_id in active_agent_threads and active_agent_threads[client_id].get("stop_flag"):
                    logger.info(f"🛑 Agent execution stopped before starting")
                    socketio.emit('agent_error', {'error': 'Agent execution stopped by user'}, to=client_id)
                    if client_id in active_agent_threads:
                        del active_agent_threads[client_id]
                    return
                
                logger.info(f"🤖 Invoking agent with goal: {goal}")
                # Run the agent with correct message format
                result = agent.invoke({
                    "messages": [{"role": "user", "content": goal}]
                })
                
                logger.info(f"📥 Agent returned result")
                logger.info(f"Result type: {type(result)}")
                logger.info(f"Result keys: {result.keys() if isinstance(result, dict) else 'N/A'}")
                
                # Extract the final message content
                messages = result.get('messages', [])
                logger.info(f"Total messages in result: {len(messages)}")
                
                final_message = messages[-1] if messages else None
                output = final_message.content if final_message else str(result)
                
                logger.info(f"✅ Agent execution completed successfully")
                logger.info(f"Final output: {output[:200]}..." if len(str(output)) > 200 else f"Final output: {output}")
                
                socketio.emit('agent_completed', {
                    'ok': True,
                    'result': output,
                    'steps_taken': len(messages) - 1  # Subtract 1 for the initial user message
                }, to=client_id)
                logger.info(f"📤 Sent 'agent_completed' event to client")
                
            except Exception as e:
                logger.error(f"❌ Error in agent execution: {str(e)}")
                logger.error(f"Error type: {type(e).__name__}")
                import traceback
                logger.error(f"Traceback:\n{traceback.format_exc()}")
                socketio.emit('agent_error', {
                    'error': str(e)
                }, to=client_id)
            finally:
                # Clean up active thread tracking
                if client_id in active_agent_threads:
                    del active_agent_threads[client_id]
                    logger.info(f"🧹 Cleaned up agent thread for client {client_id}")
        
        # Start agent execution in background
        thread = Thread(target=run_agent)
        active_agent_threads[client_id] = {"thread": thread, "stop_flag": False}
        thread.start()
        logger.info(f"🚀 Agent thread started for client {client_id}")
        
    except Exception as e:
        logger.error(f"Error executing agent: {str(e)}")
        emit('agent_error', {'error': str(e)})

@socketio.on('tool_execution_result')
def handle_tool_execution_result(data):
    """Receive tool execution results from the extension"""
    tool_id = data.get('tool_id')
    result = data.get('result')
    client_id = request.sid  # type: ignore
    
    if not tool_id:
        logger.error("Missing tool_id in tool execution result")
        return
    
    # Update the pending tool call with result
    if client_id in connected_clients:
        if tool_id in connected_clients[client_id]["pending_tool_calls"]:
            connected_clients[client_id]["pending_tool_calls"][tool_id]["result"] = result
            connected_clients[client_id]["pending_tool_calls"][tool_id]["completed"] = True
            logger.info(f"Tool {tool_id} completed for client {client_id}")

@socketio.on('agent_feedback')
def handle_agent_feedback(data):
    """Receive feedback/status updates from extension during agent execution"""
    message = data.get('message')
    status = data.get('status', 'info')
    
    logger.info(f"Agent feedback [{status}]: {message}")
    
    # Broadcast to all clients or specific client if needed
    emit('agent_progress', {
        'status': status,
        'message': message,
        'timestamp': data.get('timestamp')
    })

@socketio.on('stop_agent_ws')
def handle_stop_agent_ws(data):
    """Stop the currently running agent execution"""
    client_id = request.sid  # type: ignore
    
    logger.info(f"\n{'='*80}")
    logger.info(f"🛑 STOP AGENT REQUEST RECEIVED")
    logger.info(f"Client ID: {client_id}")
    logger.info(f"{'='*80}\n")
    
    try:
        if client_id in active_agent_threads:
            # Set the stop flag
            active_agent_threads[client_id]["stop_flag"] = True
            logger.info(f"✅ Stop flag set for client {client_id}")
            
            # Notify the client
            emit('agent_stopped', {
                'ok': True,
                'message': 'Agent execution stop requested'
            })
            logger.info(f"📤 Sent 'agent_stopped' event to client")
            
            # Clean up pending tool calls
            if client_id in connected_clients:
                connected_clients[client_id]["pending_tool_calls"] = {}
                logger.info(f"🧹 Cleared pending tool calls for client {client_id}")
        else:
            logger.warning(f"⚠️ No active agent execution found for client {client_id}")
            emit('agent_stopped', {
                'ok': False,
                'message': 'No active agent execution to stop'
            })
    
    except Exception as e:
        logger.error(f"❌ Error stopping agent: {str(e)}")
        emit('agent_error', {'error': f'Error stopping agent: {str(e)}'})

# =================================================================
# MAIN
# ==================================================================

if __name__ == "__main__":
    logger.info("Starting Flask-SocketIO server...")
    logger.info(f"Server will be available at http://0.0.0.0:8080")
    logger.info(f"WebSocket endpoint: ws://0.0.0.0:8080/socket.io/")
    
    # Run with SocketIO instead of Flask's run
    socketio.run(
        app,
        host="0.0.0.0",
        port=8080,
        debug=True,
        allow_unsafe_werkzeug=True
    )
