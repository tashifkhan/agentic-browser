import requests
import sys
import base64

"""Send a simple plain-text email via Gmail API.

Usage: python send_email.py <ACCESS_TOKEN> <to> <subject> <body>

Note: The authenticated user will be used as the sender.
"""


def build_raw_message(to_addr, subject, body_text):
    # Simple RFC 2822-like message
    message = f"To: {to_addr}\r\nSubject: {subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n{body_text}"
    raw = base64.urlsafe_b64encode(message.encode("utf-8")).decode("ascii")
    return raw


def send_email(access_token, to_addr, subject, body_text):
    base_url = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    raw = build_raw_message(to_addr, subject, body_text)
    payload = {"raw": raw}
    resp = requests.post(base_url, headers=headers, json=payload, timeout=8)
    if resp.status_code != 200:
        raise Exception(f"Failed to send message: {resp.status_code} {resp.text}")
    return resp.json()


def main():
    if len(sys.argv) < 5:
        print("Usage: python send_email.py <ACCESS_TOKEN> <to> <subject> <body>")
        sys.exit(1)
    token = sys.argv[1]
    to_addr = sys.argv[2]
    subject = sys.argv[3]
    body = sys.argv[4]

    try:
        res = send_email(token, to_addr, subject, body)
        print("Message sent:", res.get("id"))
    except Exception as e:
        print("Error:", e)


if __name__ == "__main__":
    main()
