"""tools.gmail

Exports small Gmail helper functions from this package so callers can
`from tools.gmail import list_unread, mark_read, send_email`.
"""

from .list_unread_emails import list_unread
from .mark_email_read import mark_read
from .send_email import send_email
from .fetch_latest_mails import get_latest_emails

__all__ = ["list_unread", "mark_read", "send_email", "get_latest_emails"]