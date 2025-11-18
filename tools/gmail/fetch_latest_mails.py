import requests
import datetime
import sys
def get_latest_emails(access_token, max_results=5):
    """Fetch user's latest Gmail messages."""
    base_url = "https://gmail.googleapis.com/gmail/v1/users/me"
    headers = {"Authorization": f"Bearer {access_token}"}

    params = {"maxResults": max_results, "labelIds": ["INBOX"], "q": "is:inbox"}
    response = requests.get(f"{base_url}/messages", headers=headers, params=params, timeout=8)

    if response.status_code != 200:
        raise Exception(f"Failed to list messages: {response.status_code} {response.text}")

    messages = response.json().get("messages", [])
    if not messages:
        return []

    emails = []
    for msg in messages:
        msg_id = msg["id"]
        msg_response = requests.get(f"{base_url}/messages/{msg_id}", headers=headers, timeout=8)
        if msg_response.status_code != 200:
            continue

        msg_data = msg_response.json()
        headers_list = msg_data.get("payload", {}).get("headers", [])
        email_info = {"id": msg_id}

        for h in headers_list:
            name = h["name"].lower()
            if name == "subject":
                email_info["subject"] = h["value"]
            elif name == "from":
                email_info["from"] = h["value"]
            elif name == "date":
                email_info["date"] = h["value"]

        email_info["snippet"] = msg_data.get("snippet", "")
        emails.append(email_info)

    return emails

def main():
    if len(sys.argv) < 2:
        print("Usage: python google_user_calendar.py <ACCESS_TOKEN>")
        sys.exit(1)

    access_token = sys.argv[1]

    try:
        print("Fetching user info...")
        user_info = get_user_info(access_token)
        print(f"Logged in as: {user_info.get('email')}\n")

    except Exception as e:
        print("\nError:", e)


if __name__ == "__main__":
    main()