import os
import requests
from typing import Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()

class AuthService:
    def __init__(self):
        self.google_client_id = "95116700360-13ege5jmfrjjt4vmd86oh00eu5jlei5e.apps.googleusercontent.com"
        self.google_client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
        self.github_client_id = os.environ.get("GITHUB_CLIENT_ID")
        self.github_client_secret = os.environ.get("GITHUB_CLIENT_SECRET")

    async def exchange_google_code(self, code: str, redirect_uri: str) -> Dict[str, Any]:
        if not self.google_client_secret:
            raise ValueError("GOOGLE_CLIENT_SECRET is not configured")

        token_payload = {
            'code': code,
            'client_id': self.google_client_id,
            'client_secret': self.google_client_secret,
            'redirect_uri': redirect_uri,
            'grant_type': 'authorization_code'
        }

        response = requests.post(
            'https://oauth2.googleapis.com/token',
            data=token_payload,
            timeout=10
        )

        if response.status_code != 200:
            error_details = response.json() if response.headers.get('content-type', '').startswith('application/json') else response.text
            return {"error": "Token exchange failed", "details": error_details, "status_code": response.status_code}

        return response.json()

    async def refresh_google_token(self, refresh_token: str) -> Dict[str, Any]:
        if not self.google_client_secret:
            raise ValueError("GOOGLE_CLIENT_SECRET is not configured")

        response = requests.post(
            'https://oauth2.googleapis.com/token',
            data={
                'refresh_token': refresh_token,
                'client_id': self.google_client_id,
                'client_secret': self.google_client_secret,
                'grant_type': 'refresh_token'
            },
            timeout=10
        )

        if response.status_code != 200:
            return {"error": "Token refresh failed", "details": response.text, "status_code": response.status_code}

        return response.json()

    async def exchange_github_code(self, code: str) -> Dict[str, Any]:
        if not self.github_client_id or not self.github_client_secret:
            raise ValueError("GitHub OAuth is not configured")

        response = requests.post(
            'https://github.com/login/oauth/access_token',
            headers={'Accept': 'application/json'},
            data={
                'client_id': self.github_client_id,
                'client_secret': self.github_client_secret,
                'code': code
            },
            timeout=10
        )

        if response.status_code != 200:
            return {"error": "Token exchange failed", "details": response.text, "status_code": response.status_code}

        token_data = response.json()
        if 'error' in token_data:
            return {"error": token_data.get('error_description', 'Token exchange failed')}

        return token_data
