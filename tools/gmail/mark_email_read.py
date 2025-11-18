import requests
import sys

"""Mark a Gmail message as read.

Usage: python mark_email_read.py <ACCESS_TOKEN> <MESSAGE_ID>
"""


def mark_read(access_token, message_id):
    base_url = "https://gmail.googleapis.com/gmail/v1/users/me"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    body = {"removeLabelIds": ["UNREAD"]}
    resp = requests.post(
        f"{base_url}/messages/{message_id}/modify",
        headers=headers,
        json=body,
        timeout=8,
    )
    if resp.status_code not in (200, 204):
        raise Exception(
            f"Failed to mark message as read: {resp.status_code} {resp.text}"
        )
    return resp.json() if resp.content else {}


def main():
    if len(sys.argv) < 3:
        print("Usage: python mark_email_read.py <ACCESS_TOKEN> <MESSAGE_ID>")
        sys.exit(1)
    token = sys.argv[1]
    msgid = sys.argv[2]

    try:
        res = mark_read(token, msgid)
        print("Marked read:", msgid)
        if res:
            print(res)
    except Exception as e:
        print("Error:", e)


if __name__ == "__main__":
    main()
