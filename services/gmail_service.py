from core import get_logger
from tools.gmail.fetch_latest_mails import get_latest_emails
from tools.gmail.list_unread_emails import list_unread
from tools.gmail.mark_email_read import mark_read
from tools.gmail.send_email import send_email

logger = get_logger(__name__)


class GmailService:
    def list_unread_messages(self, access_token: str, max_results: int = 10):
        try:
            return list_unread(
                access_token,
                max_results=max_results,
            )

        except Exception as e:
            logger.exception("Error listing unread messages: %s", e)
            raise

    def fetch_latest_messages(self, access_token: str, max_results: int = 5):
        try:
            return get_latest_emails(
                access_token,
                max_results=max_results,
            )

        except Exception as e:
            logger.exception("Error fetching latest messages: %s", e)
            raise

    def mark_message_read(self, access_token: str, message_id: str):
        try:
            return mark_read(
                access_token,
                message_id,
            )

        except Exception as e:
            logger.exception("Error marking message read: %s", e)
            raise

    def send_message(self, access_token: str, to: str, subject: str, body: str):
        try:
            return send_email(
                access_token,
                to,
                subject,
                body,
            )

        except Exception as e:
            logger.exception("Error sending message: %s", e)
            raise
