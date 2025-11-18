import requests
import datetime
import sys


def create_calendar_event(
    access_token: str,
    summary: str,
    start_time: str,
    end_time: str,
    description: str = "Created via Python Script",
):
    """
    Creates a new calendar event.
    start_time and end_time must be strings in ISO format (e.g., '2023-11-20T10:00:00Z')
    """
    url = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    event_data = {
        "summary": summary,
        "description": description,
        "start": {"dateTime": start_time, "timeZone": "UTC"},
        "end": {
            "dateTime": end_time,
            "timeZone": "UTC",
        },
    }

    response = requests.post(url, headers=headers, json=event_data, timeout=10)

    if response.status_code != 200:
        raise Exception(
            f"Failed to create event: {response.status_code} {response.text}"
        )

    return response.json()


def main():
    if len(sys.argv) < 2:
        print("Usage: python google_user_calendar.py <ACCESS_TOKEN>")
        sys.exit(1)

    access_token = sys.argv[1]

    try:
        print("Creating a test event for 1 hour from now...")
        now = datetime.datetime.now(datetime.timezone.utc)
        start_dt = now + datetime.timedelta(hours=1)
        end_dt = start_dt + datetime.timedelta(minutes=30)
        start_str = start_dt.isoformat()
        end_str = end_dt.isoformat()
        new_event = create_calendar_event(
            access_token,
            summary="Python API Test Meeting",
            start_time=start_str,
            end_time=end_str,
        )
        print(f"SUCCESS! Event created: {new_event.get('htmlLink')}")
    except Exception as e:
        print("\nError:", e)


if __name__ == "__main__":
    main()
