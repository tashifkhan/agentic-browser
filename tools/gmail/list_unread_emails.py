import requests
import sys

"""List unread Gmail messages and print basic info.

Usage: python list_unread_emails.py <ACCESS_TOKEN> [max_results]
"""


def list_unread(access_token, max_results=10):
    base_url = "https://gmail.googleapis.com/gmail/v1/users/me"
    headers = {"Authorization": f"Bearer {access_token}"}

    params = {"maxResults": max_results, "q": "is:unread"}
    resp = requests.get(
        f"{base_url}/messages", headers=headers, params=params, timeout=8
    )
    if resp.status_code != 200:
        raise Exception(f"Failed to list messages: {resp.status_code} {resp.text}")

    messages = resp.json().get("messages", [])
    results = []
    for m in messages:
        msg_id = m["id"]
        msg_resp = requests.get(
            f"{base_url}/messages/{msg_id}",
            headers=headers,
            timeout=8,
            params={
                "format": "metadata",
                "metadataHeaders": ["Subject", "From", "Date"],
            },
        )
        if msg_resp.status_code != 200:
            continue
        data = msg_resp.json()
        headers_list = data.get("payload", {}).get("headers", [])
        info = {"id": msg_id, "snippet": data.get("snippet", "")}
        for h in headers_list:
            name = h.get("name", "").lower()
            if name == "subject":
                info["subject"] = h.get("value")
            elif name == "from":
                info["from"] = h.get("value")
            elif name == "date":
                info["date"] = h.get("value")
        results.append(info)
    return results


def main():
    if len(sys.argv) < 2:
        print("Usage: python list_unread_emails.py <ACCESS_TOKEN> [max_results]")
        sys.exit(1)
    token = sys.argv[1]
    maxr = int(sys.argv[2]) if len(sys.argv) > 2 else 10

    try:
        items = list_unread(token, maxr)
        if not items:
            print("No unread messages found.")
            return
        print("Unread messages:")
        for it in items:
            date = it.get("date") or ""
            subj = it.get("subject") or "(no subject)"
            fr = it.get("from") or ""
            print(f"- {it['id']} | {date} | From: {fr} | Subject: {subj}")
    except Exception as e:
        print("Error:", e)


if __name__ == "__main__":
    main()
