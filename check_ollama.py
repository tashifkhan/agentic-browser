import os
import socket
import requests
import sys

print(f"Python version: {sys.version}")
print(f"Environment variables (filtered for PROXY/HTTP):")
for k, v in os.environ.items():
    if "PROXY" in k.upper() or "HTTP" in k.upper():
        print(f"  {k}: {v}")

url = "http://127.0.0.1:11434/api/tags"
print(f"\nAttempting to connect to: {url}")

try:
    # Try direct socket connection first
    print("Testing socket connection to 127.0.0.1:11434...")
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(2)
    s.connect(("127.0.0.1", 11434))
    print("Socket connection successful!")
    s.close()
except Exception as e:
    print(f"Socket connection failed: {e}")

try:
    print("\nTesting requests.get (with trust_env=False)...")
    session = requests.Session()
    session.trust_env = False  # Ignore system proxies
    r = session.get(url, timeout=2)
    print(f"Status: {r.status_code}")
    print(f"Response: {r.json()}")
except Exception as e:
    print(f"Requests failed (trust_env=False): {e}")

try:
    import httpx
    print("\nTesting httpx.get (default)...")
    r = httpx.get(url, timeout=2)
    print(f"Status: {r.status_code}")
except Exception as e:
    print(f"Httpx failed (default): {e}")

try:
    print("\nTesting requests.get (default) with NO_PROXY=*...")
    import os
    os.environ["NO_PROXY"] = "*"
    r = requests.get(url, timeout=2)
    print(f"Status: {r.status_code}")
except Exception as e:
    print(f"Requests failed (with NO_PROXY=*): {e}")

try:
    print("\nTesting httpx.get (default) with NO_PROXY=*...")
    import httpx
    # Force a new client to ensure it picks up the env var
    with httpx.Client() as client:
        r = client.get(url, timeout=2)
    print(f"Status: {r.status_code}")
except Exception as e:
    print(f"Httpx failed (with NO_PROXY=*): {e}")
