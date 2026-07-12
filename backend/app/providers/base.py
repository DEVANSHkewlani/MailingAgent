from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Dict, Any, Optional

@dataclass
class Message:
    id: str
    thread_id: str

@dataclass
class Thread:
    id: str
    messages: List[Dict[str, Any]]

@dataclass
class Draft:
    id: str
    thread_id: str

@dataclass
class SendResult:
    message_id: str
    status: str

@dataclass
class Event:
    id: str
    title: str
    start: str
    end: str

class MailProvider(ABC):
    @abstractmethod
    def list_messages(self, query: str, max_results: int) -> List[Message]:
        pass

    @abstractmethod
    def get_thread(self, thread_id: str) -> Thread:
        pass

    @abstractmethod
    def create_draft(self, thread_id: str, html_body: str, subject: Optional[str], to: Optional[str] = None) -> Draft:
        pass

    @abstractmethod
    def update_draft(self, draft_id: str, html_body: str, subject: Optional[str] = None) -> Draft:
        pass

    @abstractmethod
    def send_draft(self, draft_id: str) -> SendResult:
        pass

    @abstractmethod
    def apply_label(self, message_id: str, label: str) -> None:
        pass

    @abstractmethod
    def get_attachment(self, message_id: str, attachment_id: str) -> Dict[str, Any]:
        pass

    @abstractmethod
    def check_if_draft_was_sent(self, draft_id: str) -> bool:
        pass

    @abstractmethod
    def delete_draft(self, draft_id: str) -> None:
        pass

    def get_message_body(self, message_id: str) -> str:
        return ""


class CalendarProvider(ABC):
    @abstractmethod
    def check_availability(self, start: str, end: str) -> bool:
        pass

    @abstractmethod
    def create_event(self, title: str, start: str, end: str, attendees: List[str]) -> Event:
        pass

    @abstractmethod
    def update_event(self, event_id: str, title: Optional[str] = None, start: Optional[str] = None, end: Optional[str] = None, attendees: Optional[List[str]] = None) -> Event:
        pass

    @abstractmethod
    def cancel_event(self, event_id: str) -> None:
        pass
