from core import get_logger
from tools.calendar.get_calender_events import get_calendar_events
from tools.calendar.create_calender_events import create_calendar_event

logger = get_logger(__name__)


class CalendarService:
    def list_events(self, access_token: str, max_results: int = 10):
        try:
            return get_calendar_events(access_token, max_results=max_results)
        except Exception as e:
            logger.exception("Error fetching calendar events: %s", e)
            raise

    def create_event(
        self,
        access_token: str,
        summary: str,
        start_time: str,
        end_time: str,
        description: str = "Created via API",
    ):
        try:
            return create_calendar_event(
                access_token,
                summary,
                start_time,
                end_time,
                description=description,
            )
        except Exception as e:
            logger.exception("Error creating calendar event: %s", e)
            raise
