import contextvars
from typing import List, Optional
from googleapiclient.discovery import build
from app.providers.base import CalendarProvider, Event

# ContextVar to hold the active request-specific GoogleCalendarProvider client
active_calendar_provider = contextvars.ContextVar("active_calendar_provider")

class CalendarProviderProxy:
    """Proxy object delegating all attribute lookups to active_calendar_provider ContextVar."""
    def __getattr__(self, name):
        try:
            provider = active_calendar_provider.get()
        except LookupError:
            raise RuntimeError("Calendar provider context is not set. Are you calling this inside a graph execution context?")
        return getattr(provider, name)

# This matches the static import pattern: from app.providers.google_calendar import calendar_client
calendar_client = CalendarProviderProxy()


class GoogleCalendarProvider(CalendarProvider):
    def __init__(self, credentials):
        self.service = build("calendar", "v3", credentials=credentials)

    def check_availability(self, start: str, end: str) -> bool:
        result = self.service.freebusy().query(body={
            "timeMin": start,
            "timeMax": end,
            "items": [{"id": "primary"}]
        }).execute()
        busy = result["calendars"]["primary"]["busy"]
        return len(busy) == 0  # True = available

    def create_event(self, title: str, start: str, end: str, attendees: List[str]) -> Event:
        result = self.service.events().insert(
            calendarId="primary",
            body={
                "summary": title,
                "start": {"dateTime": start},
                "end": {"dateTime": end},
                "attendees": [{"email": a} for a in attendees],
                "reminders": {"useDefault": False, "overrides": []}
            },
            sendUpdates="all"
        ).execute()
        # Parse output times
        start_time = result.get("start", {}).get("dateTime") or result.get("start", {}).get("date", "")
        end_time = result.get("end", {}).get("dateTime") or result.get("end", {}).get("date", "")
        return Event(id=result["id"], title=result["summary"], start=start_time, end=end_time)

    def update_event(self, event_id: str, title: Optional[str] = None, start: Optional[str] = None, end: Optional[str] = None, attendees: Optional[List[str]] = None) -> Event:
        # Retrieve original event body
        event = self.service.events().get(calendarId="primary", eventId=event_id).execute()
        
        if title:
            event["summary"] = title
        if start:
            event["start"] = {"dateTime": start}
        if end:
            event["end"] = {"dateTime": end}
        if attendees is not None:
            event["attendees"] = [{"email": a} for a in attendees]
        
        event["reminders"] = {"useDefault": False, "overrides": []}
            
        result = self.service.events().update(
            calendarId="primary",
            eventId=event_id,
            body=event,
            sendUpdates="all"
        ).execute()
        
        start_time = result.get("start", {}).get("dateTime") or result.get("start", {}).get("date", "")
        end_time = result.get("end", {}).get("dateTime") or result.get("end", {}).get("date", "")
        return Event(id=result["id"], title=result["summary"], start=start_time, end=end_time)

    def cancel_event(self, event_id: str) -> None:
        self.service.events().delete(
            calendarId="primary",
            eventId=event_id,
            sendUpdates="all"
        ).execute()
