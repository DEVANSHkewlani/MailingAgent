from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from langchain_core.tools import tool

class SideEffect(str, Enum):
    READ_ONLY = "read_only"
    REVERSIBLE = "reversible"
    IRREVERSIBLE = "irreversible"

# ---------- Read-only tools ----------

class ListEmailsInput(BaseModel):
    query: str = Field(..., description="Gmail search query syntax, e.g. 'from:boss is:unread'")
    max_results: int = Field(default=20, le=100)

@tool("list_emails", args_schema=ListEmailsInput)
def list_emails(query: str, max_results: int = 20) -> List[Dict[str, Any]]:
    """Search and list emails matching a Gmail query. Read-only."""
    from app.providers.gmail import gmail_client
    return gmail_client.search(query=query, max_results=max_results)


class GetThreadInput(BaseModel):
    thread_id: str

@tool("get_thread", args_schema=GetThreadInput)
def get_thread(thread_id: str) -> Dict[str, Any]:
    """Fetch a full email thread by ID. Read-only."""
    from app.providers.gmail import gmail_client
    thread = gmail_client.get_thread(thread_id)
    return {"id": thread.id, "messages": thread.messages}


class GetAttachmentInput(BaseModel):
    message_id: str
    attachment_id: str

@tool("get_attachment", args_schema=GetAttachmentInput)
def get_attachment(message_id: str, attachment_id: str) -> Dict[str, Any]:
    """Fetch a file attachment content from Gmail by ID. Read-only."""
    from app.providers.gmail import gmail_client
    return gmail_client.get_attachment(message_id, attachment_id)


def get_style_profile_impl(style_profile_id: Optional[str] = None) -> Dict[str, Any]:
    """Plain python implementation of fetching style profile details and signature from the database."""
    from app.db.session import get_db_sync
    db = get_db_sync()
    if style_profile_id:
        row = db.execute(
            "SELECT id, name, signature_html, font_family, font_size, accent_color, tone "
            "FROM style_profiles WHERE id = %s AND user_id = %s",
            (style_profile_id, db.current_user_id)
        ).fetchone()
    else:
        row = db.execute(
            "SELECT id, name, signature_html, font_family, font_size, accent_color, tone "
            "FROM style_profiles WHERE user_id = %s AND is_default = true",
            (db.current_user_id,)
        ).fetchone()
        
    if not row:
        return {
            "id": None, "name": "Default", "signature_html": "",
            "font_family": "Arial", "font_size": 11, "accent_color": "#000000", "tone": "neutral"
        }
    return {
        "id": str(row[0]), "name": row[1], "signature_html": row[2] or "",
        "font_family": row[3] or "Arial", "font_size": row[4] or 11,
        "accent_color": row[5] or "#000000", "tone": row[6] or "neutral"
    }


class GetStyleProfileInput(BaseModel):
    style_profile_id: Optional[str] = Field(default=None, description="The specific UUID to load. If None, loads the default profile.")

@tool("get_style_profile", args_schema=GetStyleProfileInput)
def get_style_profile(style_profile_id: Optional[str] = None) -> Dict[str, Any]:
    """Fetch style profile details and signature from the database. Read-only."""
    return get_style_profile_impl(style_profile_id)


# ---------- Reversible tools ----------

class ApplyLabelInput(BaseModel):
    message_id: str
    label: str

@tool("apply_label", args_schema=ApplyLabelInput)
def apply_label(message_id: str, label: str) -> Dict[str, Any]:
    """Apply a category label to an email. Reversible."""
    from app.providers.gmail import gmail_client
    gmail_client.apply_label(message_id, label)
    return {"message_id": message_id, "label": label, "status": "applied"}


class CreateDraftInput(BaseModel):
    thread_id: str
    body_markdown: str
    style_profile_id: Optional[str] = None
    subject: Optional[str] = None

@tool("create_draft", args_schema=CreateDraftInput)
def create_draft(thread_id: str, body_markdown: str,
                 style_profile_id: Optional[str] = None,
                 subject: Optional[str] = None) -> Dict[str, Any]:
    """Create a reply draft in a thread. Does NOT send. Reversible."""
    from app.style.render import render_styled_html
    from app.providers.gmail import gmail_client
    
    # Load style details
    style_details = get_style_profile_impl(style_profile_id)
    html_body = render_styled_html(body_markdown, style_details)
    
    draft = gmail_client.create_draft(thread_id, html_body, subject)
    return {"draft_id": draft.id, "thread_id": thread_id, "status": "created"}


class UpdateDraftInput(BaseModel):
    draft_id: str
    body_markdown: str
    style_profile_id: Optional[str] = None
    subject: Optional[str] = None

@tool("update_draft", args_schema=UpdateDraftInput)
def update_draft(draft_id: str, body_markdown: str,
                 style_profile_id: Optional[str] = None,
                 subject: Optional[str] = None) -> Dict[str, Any]:
    """Update the contents of an existing draft. Reversible."""
    from app.style.render import render_styled_html
    from app.providers.gmail import gmail_client
    
    # Load style details
    style_details = get_style_profile_impl(style_profile_id)
    html_body = render_styled_html(body_markdown, style_details)
    
    draft = gmail_client.update_draft(draft_id, html_body, subject)
    return {"draft_id": draft.id, "thread_id": draft.thread_id, "status": "updated"}


class CreateReminderInput(BaseModel):
    title: str
    due_at_iso: str
    related_thread_id: Optional[str] = None

@tool("create_reminder", args_schema=CreateReminderInput)
def create_reminder(title: str, due_at_iso: str, related_thread_id: Optional[str] = None) -> Dict[str, Any]:
    """Create a follow-up reminder. Reversible."""
    from app.db.session import get_db_sync
    db = get_db_sync()
    row = db.execute(
        "INSERT INTO reminders (user_id, related_thread_id, title, due_at) "
        "VALUES (%s, %s, %s, %s) RETURNING id",
        (db.current_user_id, related_thread_id, title, due_at_iso)
    ).fetchone()
    return {"reminder_id": str(row[0]), "title": title, "status": "created"}


class CheckAvailabilityInput(BaseModel):
    start_iso: str
    end_iso: str

@tool("check_availability", args_schema=CheckAvailabilityInput)
def check_availability(start_iso: str, end_iso: str) -> bool:
    """Check calendar for conflicts in a time range. Read-only."""
    from app.providers.google_calendar import calendar_client
    return calendar_client.check_availability(start_iso, end_iso)


# ---------- Irreversible / Gated tools ----------

class SendEmailInput(BaseModel):
    draft_id: str
    confirmation_token: str = Field(..., description="Token issued by permission layer after approval")

@tool("send_email", args_schema=SendEmailInput)
def send_email(draft_id: str, confirmation_token: str) -> Dict[str, Any]:
    """Send a previously created draft. IRREVERSIBLE. Requires a valid confirmation_token."""
    from app.permissions.tokens import verify_token
    from app.tools.transactional_send import send_draft_transactionally
    
    verify_token(confirmation_token, action="send_email", resource=draft_id)
    return send_draft_transactionally(draft_id)


class CreateEventInput(BaseModel):
    title: str
    start_iso: str
    end_iso: str
    attendees: List[str] = []
    confirmation_token: str

@tool("create_event", args_schema=CreateEventInput)
def create_event(title: str, start_iso: str, end_iso: str,
                 attendees: List[str], confirmation_token: str) -> Dict[str, Any]:
    """Create a Google Calendar event. IRREVERSIBLE. Requires confirmation_token."""
    from app.permissions.tokens import verify_token
    from app.providers.google_calendar import calendar_client
    
    verify_token(confirmation_token, action="create_event", resource=title)
    event = calendar_client.create_event(title, start_iso, end_iso, attendees)
    return {"event_id": event.id, "title": event.title, "status": "created"}


class UpdateEventInput(BaseModel):
    event_id: str
    title: Optional[str] = None
    start_iso: Optional[str] = None
    end_iso: Optional[str] = None
    attendees: List[str] = []
    confirmation_token: str

@tool("update_event", args_schema=UpdateEventInput)
def update_event(event_id: str, confirmation_token: str, title: Optional[str] = None,
                 start_iso: Optional[str] = None, end_iso: Optional[str] = None,
                 attendees: List[str] = []) -> Dict[str, Any]:
    """Update a Google Calendar event. IRREVERSIBLE. Requires confirmation_token."""
    from app.permissions.tokens import verify_token
    from app.providers.google_calendar import calendar_client
    
    verify_token(confirmation_token, action="update_event", resource=event_id)
    event = calendar_client.update_event(event_id, title, start_iso, end_iso, attendees)
    return {"event_id": event.id, "title": event.title, "status": "updated"}


class CancelEventInput(BaseModel):
    event_id: str
    confirmation_token: str

@tool("cancel_event", args_schema=CancelEventInput)
def cancel_event(event_id: str, confirmation_token: str) -> Dict[str, Any]:
    """Cancel/delete a Google Calendar event. IRREVERSIBLE. Requires confirmation_token."""
    from app.permissions.tokens import verify_token
    from app.providers.google_calendar import calendar_client
    
    verify_token(confirmation_token, action="cancel_event", resource=event_id)
    calendar_client.cancel_event(event_id)
    return {"event_id": event_id, "status": "cancelled"}


class CreateCronJobInput(BaseModel):
    prompt: str = Field(..., description="The instruction/action to execute periodically, e.g. 'Sync unread emails and summarize them'")
    schedule_type: str = Field(..., description="Interval or daily schedule type. Must be 'interval_minutes' or 'daily'")
    schedule_value: str = Field(..., description="Schedule value: minutes (e.g. '30') or daily 24h time (e.g. '09:00')")
    name: Optional[str] = Field(None, description="Optional custom name for this cron job")

@tool("create_cron_job", args_schema=CreateCronJobInput)
def create_cron_job(prompt: str, schedule_type: str, schedule_value: str, name: Optional[str] = None) -> Dict[str, Any]:
    """Create a scheduled cron job. Reversible."""
    from app.db.session import get_db_sync
    from app.routers.cron import compute_next_run
    import uuid
    
    db = get_db_sync()
    user_id = db.current_user_id
    if not user_id:
        raise ValueError("Database user_id context not set for cron job creation")
        
    try:
        next_run = compute_next_run(schedule_type, schedule_value)
    except ValueError as exc:
        raise ValueError(f"Invalid schedule pattern: {str(exc)}")
        
    job_name = name or f"Cron: {prompt[:30]}"
    row = db.execute(
        "INSERT INTO cron_jobs (user_id, name, prompt, schedule_type, schedule_value, next_run_at) "
        "VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
        (uuid.UUID(str(user_id)), job_name, prompt, schedule_type, schedule_value, next_run)
    ).fetchone()
    
    return {"cron_job_id": str(row[0]), "name": job_name, "status": "created"}


ALL_TOOLS = [
    list_emails, get_thread, get_attachment, get_style_profile,
    apply_label, create_draft, update_draft, create_reminder,
    check_availability, send_email, create_event, update_event, cancel_event,
    create_cron_job
]
