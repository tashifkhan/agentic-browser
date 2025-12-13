from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import os
from dotenv import load_dotenv
import google.generativeai as genai
load_dotenv()

app = Flask(__name__)
CORS(app)  # Allow extension to call this server

CLIENT_ID = "95116700360-13ege5jmfrjjt4vmd86oh00eu5jlei5e.apps.googleusercontent.com"
CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

# GitHub OAuth credentials
GITHUB_CLIENT_ID = os.environ.get("GITHUB_CLIENT_ID")
GITHUB_CLIENT_SECRET = os.environ.get("GITHUB_CLIENT_SECRET")

print(f"Using CLIENT_ID: {CLIENT_ID}")
print(f"Using CLIENT_SECRET: {CLIENT_SECRET}")
print(f"Using GITHUB_CLIENT_ID: {GITHUB_CLIENT_ID}")

# Configure Gemini if API key is available
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

@app.route('/', methods=['GET'])
def home():
    return "<h2>Backend running successfully 🚀</h2>"

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'message': 'Backend service running'})

@app.route('/exchange-code', methods=['POST']) 
def exchange_code():
    """Exchange authorization code for access + refresh tokens"""
    data = request.json
    code = data.get('code')
    redirect_uri = data.get('redirect_uri')
    
    if not code or not redirect_uri:
        return jsonify({'error': 'Missing code or redirect_uri'}), 400
    
    try:
        response = requests.post(
            'https://oauth2.googleapis.com/token',
            data={
                'code': code,
                'client_id': CLIENT_ID,
                'client_secret': CLIENT_SECRET,
                'redirect_uri': redirect_uri,
                'grant_type': 'authorization_code'
            },
            timeout=10
        )
        
        if response.status_code != 200:
            return jsonify({
                'error': 'Token exchange failed',
                'details': response.text
            }), response.status_code
        
        token_data = response.json()
        return jsonify({
            'access_token': token_data.get('access_token'),
            'refresh_token': token_data.get('refresh_token'),
            'expires_in': token_data.get('expires_in', 3600),
            'token_type': token_data.get('token_type')
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/refresh-token', methods=['POST'])  
def refresh_token():
    """Get new access token using refresh token"""
    data = request.json
    refresh_token_value = data.get('refresh_token')
    
    if not refresh_token_value:
        return jsonify({'error': 'Missing refresh_token'}), 400
    
    try:
        response = requests.post(
            'https://oauth2.googleapis.com/token',
            data={
                'refresh_token': refresh_token_value,
                'client_id': CLIENT_ID,
                'client_secret': CLIENT_SECRET,
                'grant_type': 'refresh_token'
            },
            timeout=10
        )
        
        if response.status_code != 200:
            return jsonify({
                'error': 'Token refresh failed',
                'details': response.text
            }), response.status_code
        
        token_data = response.json()
        return jsonify({
            'access_token': token_data.get('access_token'),
            'expires_in': token_data.get('expires_in', 3600),
            'token_type': token_data.get('token_type')
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/github/exchange-code', methods=['POST'])
def github_exchange_code():
    """Exchange GitHub authorization code for access token"""
    data = request.json
    code = data.get('code')
    
    if not code:
        return jsonify({'error': 'Missing code'}), 400
    
    if not GITHUB_CLIENT_ID or not GITHUB_CLIENT_SECRET:
        return jsonify({'error': 'GitHub OAuth not configured'}), 500
    
    try:
        response = requests.post(
            'https://github.com/login/oauth/access_token',
            headers={'Accept': 'application/json'},
            data={
                'client_id': GITHUB_CLIENT_ID,
                'client_secret': GITHUB_CLIENT_SECRET,
                'code': code
            },
            timeout=10
        )
        
        if response.status_code != 200:
            return jsonify({
                'error': 'Token exchange failed',
                'details': response.text
            }), response.status_code
        
        token_data = response.json()
        
        if 'error' in token_data:
            return jsonify({
                'error': token_data.get('error_description', 'Token exchange failed')
            }), 400
        
        return jsonify({
            'access_token': token_data.get('access_token'),
            'token_type': token_data.get('token_type', 'bearer'),
            'scope': token_data.get('scope', '')
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/chat', methods=['POST'])
def chat():
    """Chat with LLM model (Gemini)"""
    data = request.json
    message = data.get('message')
    model_name = data.get('model', 'gemini-2.5-pro')
    conversation_history = data.get('history', [])
    
    if not message:
        return jsonify({'error': 'Missing message'}), 400
    
    if not GEMINI_API_KEY:
        return jsonify({'error': 'GEMINI_API_KEY not configured'}), 500
    
    try:
        # Initialize the model
        model = genai.GenerativeModel(model_name)
        
        # Build conversation history
        chat_session = model.start_chat(history=[
            {
                "role": item.get("role", "user"),
                "parts": [item.get("content", "")]
            }
            for item in conversation_history
        ])
        
        # Send message and get response
        response = chat_session.send_message(message)
        
        return jsonify({
            'response': response.text,
            'model': model_name,
            'success': True
        })
    
    except Exception as e:
        return jsonify({
            'error': str(e),
            'success': False
        }), 500




if __name__ == '__main__':
    if not CLIENT_SECRET:
        print("\n⚠️  WARNING: GOOGLE_CLIENT_SECRET environment variable not set!")
        print("   Google OAuth features will not work.")
    
    if not GITHUB_CLIENT_ID or not GITHUB_CLIENT_SECRET:
        print("\n⚠️  WARNING: GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET not set!")
        print("   GitHub OAuth features will not work.")
    
    if not GEMINI_API_KEY:
        print("\n⚠️  WARNING: GEMINI_API_KEY environment variable not set!")
        print("   Chat features will not work.")
        print("\nSet it with:")
        print("  export GEMINI_API_KEY='your-api-key-here'")
    
    if not CLIENT_SECRET and not GEMINI_API_KEY and not GITHUB_CLIENT_ID:
        print("\n❌ ERROR: No API keys configured!")
        exit(1)
    
    print("\n" + "="*60)
    print("✅ Backend service starting on http://localhost:5000")
    print("="*60)
    app.run(host='0.0.0.0', port=5000, debug=True)