import requests
import datetime
import sys

def get_user_info(access_token):
    """Fetch user's email and profile info."""
    url = "https://openidconnect.googleapis.com/v1/userinfo"
    headers = {"Authorization": f"Bearer {access_token}"}

    response = requests.get(url, headers=headers, timeout=8)
    if response.status_code != 200:
        raise Exception(f"Failed to get user info: {response.status_code} {response.text}")
    return response.json()


def get_calendar_events(access_token, max_results=10):
    """Fetch user's upcoming calendar events."""
    url = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
    headers = {"Authorization": f"Bearer {access_token}"}

    params = {
        "maxResults": max_results,
        "orderBy": "startTime",
        "singleEvents": True,
        "timeMin": datetime.datetime.utcnow().isoformat() + "Z"
    }

    response = requests.get(url, headers=headers, params=params, timeout=8)
    if response.status_code != 200:
        raise Exception(f"Failed to get calendar events: {response.status_code} {response.text}")
    return response.json().get("items", [])


def get_latest_emails(access_token, max_results=5):
    """Fetch user's latest Gmail messages."""
    base_url = "https://gmail.googleapis.com/gmail/v1/users/me"
    headers = {"Authorization": f"Bearer {access_token}"}

    # Step 1: Get the latest message IDs
    params = {"maxResults": max_results, "labelIds": ["INBOX"], "q": "is:inbox"}
    response = requests.get(f"{base_url}/messages", headers=headers, params=params, timeout=8)

    if response.status_code != 200:
        raise Exception(f"Failed to list messages: {response.status_code} {response.text}")

    messages = response.json().get("messages", [])
    if not messages:
        return []

    emails = []
    # Step 2: Fetch each message’s details
    for msg in messages:
        msg_id = msg["id"]
        msg_response = requests.get(f"{base_url}/messages/{msg_id}", headers=headers, timeout=8)
        if msg_response.status_code != 200:
            continue

        msg_data = msg_response.json()
        headers_list = msg_data.get("payload", {}).get("headers", [])
        email_info = {"id": msg_id}

        # Extract subject, from, date
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
        print("\n=== USER INFO ===")
        print(f"Name : {user_info.get('name')}")
        print(f"Email: {user_info.get('email')}")
        print(f"Picture: {user_info.get('picture')}\n")

        print("Fetching latest 5 emails...")
        emails = get_latest_emails(access_token)
        print("\n=== LATEST EMAILS ===")
        if not emails:
            print("No emails found.")
        else:
            for e in emails:
                print(f"- {e.get('date')}")
                print(f"  From: {e.get('from')}")
                print(f"  Subject: {e.get('subject')}")
                print(f"  Snippet: {e.get('snippet')}\n")

        print("Fetching upcoming calendar events...")
        events = get_calendar_events(access_token)
        print("\n=== UPCOMING EVENTS ===")
        if not events:
            print("No upcoming events found.")
        else:
            for e in events:
                start = e.get("start", {}).get("dateTime") or e.get("start", {}).get("date")
                summary = e.get("summary", "No title")
                print(f"- {start} | {summary}")

    except Exception as e:
        print("\nError:", e)


if __name__ == "__main__":
    main()
