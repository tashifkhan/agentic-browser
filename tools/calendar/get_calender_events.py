import requests
import datetime
import sys
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

def main():
    if len(sys.argv) < 2:
        print("Usage: python google_user_calendar.py <ACCESS_TOKEN>")
        sys.exit(1)

    access_token = sys.argv[1]

    try:
        print("\nFetching updated calendar events...")
        events = get_calendar_events(access_token)
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