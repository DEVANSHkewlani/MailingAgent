# Mail Agent — Implementation Guide

Companion to `Mail_Agent_Build_Guide.html`. This file contains complete, runnable code for every part of the system referenced in the build guide. Sections are numbered to match the build guide's references (e.g. "IMPLEMENTATION.md → Section 4" below is Tool Layer).

**Nothing in this project is built yet.** Follow sections in order — each depends on the ones before it.

## Contents

1. Project Setup
2. Database Schema (full migration)
3. LangGraph Multi-Agent Core
4. Tool Layer
5. Permission & Approval System
6. Conversation Memory
7. Categorization Design
8. Gmail + Google Calendar Integration
9. Frontend: Chat Panel + Approval Queue
10. Provider Abstraction (Outlook-ready)
11. Formatting & Style Engine
12. Cost Controls & Rate Limiting
13. Error Handling & Reconciliation
14. Bulk Campaigns — Personalized Outreach (Extension)

---

## 1. Project Setup

```bash
mail-agent/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI entrypoint
│   │   ├── config.py                # Settings (Pydantic Settings)
│   │   ├── db/
│   │   │   ├── models.py            # SQLAlchemy models
│   │   │   └── session.py
│   │   ├── auth/
│   │   │   └── google_oauth.py
│   │   ├── providers/
│   │   │   ├── base.py              # Abstract MailProvider / CalendarProvider
│   │   │   ├── gmail.py
│   │   │   └── google_calendar.py
│   │   ├── agents/
│   │   │   ├── state.py
│   │   │   ├── graph.py
│   │   │   ├── supervisor.py
│   │   │   ├── reader.py
│   │   │   ├── categorizer.py
│   │   │   ├── summarizer.py
│   │   │   ├── drafter.py
│   │   │   ├── sender.py
│   │   │   ├── scheduler.py
│   │   │   └── reminder.py
│   │   ├── tools/
│   │   │   └── mail_tools.py
│   │   ├── permissions/
│   │   │   ├── policy.py
│   │   │   └── tokens.py
│   │   ├── style/
│   │   │   ├── spec.py
│   │   │   └── templates/
│   │   │       ├── email_base.html.j2
│   │   │       └── email_outlook_safe.html.j2
│   │   └── routers/
│   │       ├── chat.py
│   │       ├── approvals.py
│   │       └── auth.py
│   ├── alembic/                     # DB migrations
│   ├── requirements.txt
│   └── tests/
└── frontend/
    └── src/
        ├── components/
        │   ├── ChatPanel.tsx
        │   └── ApprovalQueue.tsx
        └── hooks/
            └── useAgentSocket.ts
```

### requirements.txt

```text
fastapi==0.115.0
uvicorn[standard]==0.31.0
langgraph==0.2.45
langgraph-checkpoint-postgres==2.0.1
langchain-core==0.3.10
langchain-anthropic==0.2.3
anthropic==0.36.0
sqlalchemy==2.0.35
asyncpg==0.29.0
alembic==1.13.3
pydantic==2.9.2
pydantic-settings==2.5.2
google-api-python-client==2.149.0
google-auth-oauthlib==1.2.1
google-auth==2.35.0
jinja2==3.1.4
markdown==3.7
redis==5.1.1
celery==5.4.0
cryptography==43.0.3
websockets==13.1
```

### app/config.py

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    redis_url: str = "redis://localhost:6379/0"
    anthropic_api_key: str
    google_client_id: str
    google_client_secret: str
    google_redirect_uri: str
    token_encryption_key: str  # 32-byte key, base64, for Fernet
    confirmation_token_ttl_minutes: int = 15

    class Config:
        env_file = ".env"

settings = Settings()
```

---

## 2. Database Schema (Full Migration)

This is the complete schema — the 10 original tables plus the 3 added to close the conversation-memory and categorization gaps (`conversations`, `messages`, `category_rules`). Run as a single Alembic migration or raw SQL file.

```sql
-- ============================================================
-- Mail Agent — Initial Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- for gen_random_uuid()

-- ---------- Identity ----------

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    display_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE oauth_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('google','microsoft')),
    access_token_encrypted BYTEA NOT NULL,
    refresh_token_encrypted BYTEA NOT NULL,
    scopes TEXT[] NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------- Conversation memory (NEW — closes Gap: Conversation Memory) ----------

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title TEXT,                          -- auto-generated from first instruction
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user','assistant','tool')),
    content TEXT NOT NULL,
    -- references to entities mentioned/produced in this turn, for resolving
    -- "that email" / "the draft you just made" in later turns
    referenced_entities JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);

-- ---------- Style ----------

CREATE TABLE style_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    signature_html TEXT,
    font_family TEXT DEFAULT 'Arial',
    font_size INT DEFAULT 11,
    accent_color TEXT,
    tone TEXT DEFAULT 'neutral',
    is_default BOOLEAN DEFAULT false
);

-- ---------- Email cache ----------

CREATE TABLE email_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    provider_message_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    sender TEXT,
    subject TEXT,
    snippet TEXT,
    category TEXT,
    category_confidence REAL,
    received_at TIMESTAMPTZ,
    UNIQUE(user_id, provider_message_id)
);
CREATE INDEX idx_email_cache_thread ON email_cache(user_id, thread_id);
CREATE INDEX idx_email_cache_category ON email_cache(user_id, category);

-- Cached summaries, keyed to a watermark so we don't regenerate needlessly
CREATE TABLE thread_summaries (
    thread_id TEXT NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    last_message_id TEXT NOT NULL,  -- watermark: regenerate only if thread advances past this
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, thread_id)
);

-- ---------- Categorization rules (NEW — closes Gap: Categorization Design) ----------

CREATE TABLE category_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    match_type TEXT NOT NULL CHECK (match_type IN ('sender_domain','sender_exact','subject_keyword','gmail_label')),
    match_value TEXT NOT NULL,
    category TEXT NOT NULL,
    is_system_default BOOLEAN DEFAULT false,  -- seeded defaults vs user-created
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_category_rules_user ON category_rules(user_id);

-- ---------- Drafts ----------

CREATE TABLE drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    thread_id TEXT NOT NULL,
    provider_draft_id TEXT,
    body_markdown TEXT,
    body_html TEXT,
    style_profile_id UUID REFERENCES style_profiles(id),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','sent','rejected','send_failed')),
    created_by_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------- Permissions ----------

CREATE TABLE approval_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    payload JSONB NOT NULL,
    agent_reasoning TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired','consumed')),
    confirmation_token TEXT UNIQUE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_approval_queue_status ON approval_queue(user_id, status);

CREATE TABLE permission_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    condition JSONB,
    level TEXT NOT NULL CHECK (level IN ('AUTO','CONFIRM','BLOCKED')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------- Reminders & calendar ----------

CREATE TABLE reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    related_thread_id TEXT,
    title TEXT NOT NULL,
    due_at TIMESTAMPTZ,
    status TEXT DEFAULT 'open' CHECK (status IN ('open','done','dismissed')),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    provider_event_id TEXT,
    title TEXT,
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,
    attendees TEXT[],
    source_thread_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------- Audit ----------

CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    agent_name TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    input_params JSONB,
    output JSONB,
    approval_id UUID REFERENCES approval_queue(id),
    reasoning TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_audit_log_user_time ON audit_log(user_id, created_at DESC);

-- Who looked at whose audit history (Security & Compliance requirement)
CREATE TABLE audit_log_access (
    id BIGSERIAL PRIMARY KEY,
    viewer_user_id UUID REFERENCES users(id),
    viewed_user_id UUID REFERENCES users(id),
    accessed_at TIMESTAMPTZ DEFAULT now()
);

-- LangGraph checkpoints are created automatically by
-- langgraph-checkpoint-postgres's setup() call — do not hand-author.
```

### Seeding default category rules

Run once per new user (or as global defaults referenced by `is_system_default=true` and copied on signup):

```python
DEFAULT_CATEGORY_RULES = [
    {"match_type": "gmail_label", "match_value": "CATEGORY_PROMOTIONS", "category": "newsletter"},
    {"match_type": "gmail_label", "match_value": "CATEGORY_SOCIAL", "category": "fyi"},
    {"match_type": "subject_keyword", "match_value": "unsubscribe", "category": "newsletter"},
    {"match_type": "subject_keyword", "match_value": "invoice", "category": "action_needed"},
]

async def seed_default_rules(user_id: str, db):
    for rule in DEFAULT_CATEGORY_RULES:
        await db.execute(
            "INSERT INTO category_rules (user_id, match_type, match_value, category, is_system_default) "
            "VALUES ($1, $2, $3, $4, true)",
            user_id, rule["match_type"], rule["match_value"], rule["category"]
        )
```
---

## 3. LangGraph Multi-Agent Core

### 3.1 State object (corrected — with reducers)

```python
# app/agents/state.py
from typing import Annotated
from operator import add
from langgraph.graph import MessagesState

class MailAgentState(MessagesState):
    user_id: str
    conversation_id: str
    instruction: str
    plan: list[dict]

    # These fields are written by MULTIPLE parallel worker agents.
    # Without Annotated[..., add], LangGraph's default behavior is to
    # let the last node that finishes overwrite the field entirely —
    # so if Reader and Categorizer both finish around the same time,
    # one of their results silently disappears. operator.add makes
    # LangGraph concatenate lists from parallel branches instead.
    active_tasks: Annotated[list[dict], add]
    completed_tasks: Annotated[list[dict], add]
    pending_approvals: Annotated[list[dict], add]
    email_context: Annotated[list[dict], add]
    draft_results: Annotated[list[dict], add]
    calendar_results: Annotated[list[dict], add]
    errors: Annotated[list[dict], add]

    # Single-writer field (only the style-parsing step writes this) — no reducer needed
    style_profile: dict
```

### 3.2 Full graph definition

```python
# app/agents/graph.py
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from app.agents.state import MailAgentState
from app.agents.supervisor import supervisor_node, route_to_workers
from app.agents.reader import reader_agent_node
from app.agents.categorizer import categorizer_agent_node
from app.agents.summarizer import summarizer_agent_node
from app.agents.drafter import drafter_agent_node
from app.agents.scheduler import scheduler_agent_node
from app.agents.reminder import reminder_agent_node
from app.permissions.policy import permission_gate_node, needs_human_approval
from app.agents.executor import tool_executor_node
from app.agents.aggregator import aggregator_node

WORKER_NODES = ["reader", "categorizer", "summarizer", "drafter", "scheduler", "reminder"]

def build_graph(checkpointer):
    graph = StateGraph(MailAgentState)

    graph.add_node("supervisor", supervisor_node)
    graph.add_node("reader", reader_agent_node)
    graph.add_node("categorizer", categorizer_agent_node)
    graph.add_node("summarizer", summarizer_agent_node)
    graph.add_node("drafter", drafter_agent_node)
    graph.add_node("scheduler", scheduler_agent_node)
    graph.add_node("reminder", reminder_agent_node)
    graph.add_node("permission_gate", permission_gate_node)
    graph.add_node("executor", tool_executor_node)
    graph.add_node("aggregator", aggregator_node)

    graph.add_edge(START, "supervisor")

    # Supervisor fans out to 1..N workers in parallel based on the plan
    graph.add_conditional_edges("supervisor", route_to_workers, WORKER_NODES)

    # All workers converge on permission_gate. Because state fields use
    # operator.add reducers (Section 3.1), this fan-in is now safe —
    # LangGraph runs permission_gate once all branches in this "superstep"
    # have completed, with their results merged, not overwritten.
    for worker in WORKER_NODES:
        graph.add_edge(worker, "permission_gate")

    graph.add_conditional_edges(
        "permission_gate",
        needs_human_approval,
        {"approve_required": END, "auto_approved": "executor"}
    )

    graph.add_edge("executor", "aggregator")
    graph.add_edge("aggregator", END)

    return graph.compile(checkpointer=checkpointer)


async def get_compiled_graph():
    """Call once at app startup; reuse the compiled graph across requests."""
    from app.config import settings
    async with AsyncPostgresSaver.from_conn_string(settings.database_url) as checkpointer:
        await checkpointer.setup()  # creates checkpoint tables if missing
        return build_graph(checkpointer)
```

### 3.3 Supervisor node

```python
# app/agents/supervisor.py
from anthropic import Anthropic
from app.config import settings
from app.agents.state import MailAgentState

client = Anthropic(api_key=settings.anthropic_api_key)

SUPERVISOR_SYSTEM_PROMPT = """You are the Supervisor for Mail Agent, a multi-agent email
assistant. Given the user's instruction and recent conversation history, decide which
worker agents need to run and what each should do.

Available workers:
- reader: fetch emails/threads matching criteria
- categorizer: assign category labels to emails
- summarizer: summarize emails or threads
- drafter: write a reply draft (requires tone/style awareness)
- scheduler: detect meeting intent, create calendar events
- reminder: create follow-up reminders

Return a JSON plan: a list of {"worker": "<name>", "task": "<specific instruction
for that worker, with any entity references already resolved from conversation
history>"}. Only include workers actually needed for this instruction."""

def supervisor_node(state: MailAgentState) -> dict:
    history_text = "\n".join(
        f"{m['role']}: {m['content']}" for m in state.get("messages", [])[-20:]
    )
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=SUPERVISOR_SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": f"Recent conversation:\n{history_text}\n\nNew instruction: {state['instruction']}"
        }],
        tools=[{
            "name": "submit_plan",
            "description": "Submit the decomposed task plan",
            "input_schema": {
                "type": "object",
                "properties": {
                    "plan": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "worker": {"type": "string", "enum": [
                                    "reader", "categorizer", "summarizer",
                                    "drafter", "scheduler", "reminder"
                                ]},
                                "task": {"type": "string"}
                            },
                            "required": ["worker", "task"]
                        }
                    }
                },
                "required": ["plan"]
            }
        }],
        tool_choice={"type": "tool", "name": "submit_plan"}
    )
    plan = next(b.input["plan"] for b in response.content if b.type == "tool_use")
    return {"plan": plan}


def route_to_workers(state: MailAgentState) -> list[str]:
    """Conditional edge function: returns the list of worker node names
    to dispatch to in parallel, based on the supervisor's plan."""
    workers = {task["worker"] for task in state["plan"]}
    return list(workers) if workers else ["reader"]
```

### 3.4 Aggregator node

```python
# app/agents/aggregator.py
from app.agents.state import MailAgentState

def aggregator_node(state: MailAgentState) -> dict:
    """Merge all worker outputs into a final user-facing response."""
    parts = []
    if state.get("email_context"):
        parts.append(f"Found {len(state['email_context'])} matching emails.")
    if state.get("draft_results"):
        parts.append(f"Created {len(state['draft_results'])} draft(s) — review in Approvals.")
    if state.get("calendar_results"):
        parts.append(f"Proposed {len(state['calendar_results'])} calendar event(s).")
    if state.get("errors"):
        parts.append(f"{len(state['errors'])} item(s) failed — see Activity feed.")
    summary = " ".join(parts) or "Done."
    return {"messages": [{"role": "assistant", "content": summary}]}
```

---

## 4. Tool Layer

```python
# app/tools/mail_tools.py
from enum import Enum
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
def list_emails(query: str, max_results: int = 20) -> list[dict]:
    """Search and list emails matching a Gmail query. Read-only."""
    from app.providers.gmail import gmail_client  # resolved per-request user context
    return gmail_client.search(query=query, max_results=max_results)


class GetThreadInput(BaseModel):
    thread_id: str

@tool("get_thread", args_schema=GetThreadInput)
def get_thread(thread_id: str) -> dict:
    """Fetch a full email thread by ID. Read-only."""
    from app.providers.gmail import gmail_client
    return gmail_client.get_thread(thread_id)


# ---------- Reversible tools ----------

class ApplyLabelInput(BaseModel):
    message_id: str
    label: str

@tool("apply_label", args_schema=ApplyLabelInput)
def apply_label(message_id: str, label: str) -> dict:
    """Apply a category label to an email. Reversible."""
    from app.providers.gmail import gmail_client
    return gmail_client.apply_label(message_id, label)


class CreateDraftInput(BaseModel):
    thread_id: str
    body_markdown: str
    style_profile_id: str | None = None
    subject: str | None = None

@tool("create_draft", args_schema=CreateDraftInput)
def create_draft(thread_id: str, body_markdown: str,
                  style_profile_id: str | None = None,
                  subject: str | None = None) -> dict:
    """Create a reply draft in a thread. Does NOT send. Reversible."""
    from app.style.spec import render_styled_html
    from app.providers.gmail import gmail_client
    html_body = render_styled_html(body_markdown, style_profile_id)
    return gmail_client.create_draft(thread_id, html_body, subject)


# ---------- Irreversible / gated tools ----------

class SendEmailInput(BaseModel):
    draft_id: str
    confirmation_token: str = Field(..., description="Token issued by permission layer after approval")

@tool("send_email", args_schema=SendEmailInput)
def send_email(draft_id: str, confirmation_token: str) -> dict:
    """Send a previously created draft. IRREVERSIBLE. Requires a valid
    confirmation_token issued by the permission gate."""
    from app.permissions.tokens import verify_token
    from app.tools.transactional_send import send_draft_transactionally
    verify_token(confirmation_token, action="send_email", resource=draft_id)
    return send_draft_transactionally(draft_id)  # see Section 13


class CheckAvailabilityInput(BaseModel):
    start_iso: str
    end_iso: str

@tool("check_availability", args_schema=CheckAvailabilityInput)
def check_availability(start_iso: str, end_iso: str) -> bool:
    """Check calendar for conflicts in a time range. Read-only."""
    from app.providers.google_calendar import calendar_client
    return calendar_client.check_availability(start_iso, end_iso)


class CreateEventInput(BaseModel):
    title: str
    start_iso: str
    end_iso: str
    attendees: list[str] = []
    confirmation_token: str

@tool("create_event", args_schema=CreateEventInput)
def create_event(title: str, start_iso: str, end_iso: str,
                  attendees: list[str], confirmation_token: str) -> dict:
    """Create a Google Calendar event. IRREVERSIBLE. Requires confirmation_token."""
    from app.permissions.tokens import verify_token
    from app.providers.google_calendar import calendar_client
    verify_token(confirmation_token, action="create_event", resource=title)
    return calendar_client.create_event(title, start_iso, end_iso, attendees)


class CreateReminderInput(BaseModel):
    title: str
    due_at_iso: str
    related_thread_id: str | None = None

@tool("create_reminder", args_schema=CreateReminderInput)
def create_reminder(title: str, due_at_iso: str, related_thread_id: str | None = None) -> dict:
    """Create a follow-up reminder. Reversible."""
    from app.db.session import get_db_sync
    db = get_db_sync()
    row = db.execute(
        "INSERT INTO reminders (user_id, related_thread_id, title, due_at) "
        "VALUES (%s, %s, %s, %s) RETURNING id",
        (db.current_user_id, related_thread_id, title, due_at_iso)
    ).fetchone()
    return {"reminder_id": str(row[0])}


ALL_TOOLS = [
    list_emails, get_thread, apply_label, create_draft,
    send_email, check_availability, create_event, create_reminder,
]
```
---

## 5. Permission & Approval System

### 5.1 Policy classification

```python
# app/permissions/policy.py
from langgraph.types import interrupt
from app.agents.state import MailAgentState
from app.db.session import get_db

DEFAULT_LEVELS = {
    "list_emails": "AUTO", "get_thread": "AUTO", "apply_label": "AUTO",
    "create_draft": "AUTO", "create_reminder": "AUTO",
    "send_email": "CONFIRM", "create_event": "CONFIRM", "update_event": "CONFIRM",
}

async def classify(user_id: str, action_type: str, resource: str) -> str:
    db = get_db()
    # User-specific override rules take precedence over the default table
    rule = await db.fetchrow(
        "SELECT level, condition FROM permission_rules WHERE user_id = $1 AND action_type = $2",
        user_id, action_type
    )
    if rule:
        # condition matching (e.g. recipient domain) would be evaluated here
        return rule["level"]
    return DEFAULT_LEVELS.get(action_type, "CONFIRM")  # unknown actions default to CONFIRM, never AUTO


async def permission_gate_node(state: MailAgentState) -> dict:
    from app.permissions.tokens import issue_token
    from app.notifications.websocket import notify_dashboard
    from app.db.session import get_db

    db = get_db()
    resolved_approvals = []

    for action in state.get("pending_approvals", []):
        level = await classify(state["user_id"], action["type"], action["resource"])

        if level == "AUTO":
            action["status"] = "approved"
            resolved_approvals.append(action)

        elif level == "CONFIRM":
            row = await db.fetchrow(
                "INSERT INTO approval_queue (user_id, action_type, resource_id, payload, agent_reasoning, expires_at) "
                "VALUES ($1, $2, $3, $4, $5, now() + interval '15 minutes') RETURNING id",
                state["user_id"], action["type"], action["resource"],
                action.get("payload", {}), action.get("reasoning", "")
            )
            approval_id = row["id"]
            token = issue_token(approval_id, action["type"], action["resource"])
            await db.execute(
                "UPDATE approval_queue SET confirmation_token = $1 WHERE id = $2",
                token, approval_id
            )
            await notify_dashboard(state["user_id"], {"approval_id": str(approval_id), "action": action})
            # Pause graph execution here. The /approvals/{id}/approve route resumes
            # the graph from this exact checkpoint once the user acts.
            interrupt({"approval_id": str(approval_id), "action": action})

        elif level == "BLOCKED":
            action["status"] = "blocked"
            return {"errors": [{"action": action, "reason": "blocked_by_policy"}]}

    return {"pending_approvals": resolved_approvals}


def needs_human_approval(state: MailAgentState) -> str:
    pending = [a for a in state.get("pending_approvals", []) if a.get("status") != "approved"]
    return "approve_required" if pending else "auto_approved"
```

### 5.2 Confirmation tokens

```python
# app/permissions/tokens.py
import hmac, hashlib, time, base64
from app.config import settings

def issue_token(approval_id: str, action: str, resource: str) -> str:
    """Single-use, short-lived, scoped token. HMAC-signed so it can be
    verified without a DB round-trip, then checked against approval_queue
    for the consumed/expired state."""
    expiry = int(time.time()) + settings.confirmation_token_ttl_minutes * 60
    payload = f"{approval_id}:{action}:{resource}:{expiry}"
    sig = hmac.new(settings.token_encryption_key.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(f"{payload}:{sig}".encode()).decode()


def verify_token(token: str, action: str, resource: str) -> str:
    """Raises if invalid, expired, wrong scope, or already consumed.
    Returns the approval_id on success."""
    from app.db.session import get_db_sync

    decoded = base64.urlsafe_b64decode(token.encode()).decode()
    approval_id, tok_action, tok_resource, expiry, sig = decoded.rsplit(":", 4)
    payload = f"{approval_id}:{tok_action}:{tok_resource}:{expiry}"
    expected_sig = hmac.new(settings.token_encryption_key.encode(), payload.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(sig, expected_sig):
        raise PermissionError("Invalid token signature")
    if int(expiry) < time.time():
        raise PermissionError("Token expired")
    if tok_action != action or tok_resource != resource:
        raise PermissionError("Token scope mismatch")

    db = get_db_sync()
    row = db.execute(
        "SELECT status FROM approval_queue WHERE id = %s", (approval_id,)
    ).fetchone()
    if row is None or row[0] == "consumed":
        raise PermissionError("Token already used or unknown")

    # Mark consumed atomically — this IS the idempotency guard (Section 13)
    db.execute(
        "UPDATE approval_queue SET status = 'consumed', resolved_at = now() "
        "WHERE id = %s AND status != 'consumed'", (approval_id,)
    )
    return approval_id
```

### 5.3 Approval routes (resume the graph)

```python
# app/routers/approvals.py
from fastapi import APIRouter
from langgraph.types import Command

router = APIRouter(prefix="/approvals")

@router.post("/{approval_id}/approve")
async def approve(approval_id: str, edited_payload: dict | None = None):
    from app.db.session import get_db
    from app.agents.graph import get_compiled_graph

    db = get_db()
    if edited_payload:
        await db.execute(
            "UPDATE approval_queue SET payload = $1 WHERE id = $2",
            edited_payload, approval_id
        )
    await db.execute("UPDATE approval_queue SET status = 'approved' WHERE id = $1", approval_id)

    graph = await get_compiled_graph()
    config = {"configurable": {"thread_id": approval_id}}  # same thread_id used when interrupted
    result = await graph.ainvoke(Command(resume={"approved": True}), config=config)
    return {"status": "resumed", "result": result}


@router.post("/{approval_id}/reject")
async def reject(approval_id: str):
    from app.db.session import get_db
    db = get_db()
    await db.execute("UPDATE approval_queue SET status = 'rejected', resolved_at = now() WHERE id = $1", approval_id)
    return {"status": "rejected"}
```

---

## 6. Conversation Memory

```python
# app/agents/memory.py
from app.db.session import get_db

MAX_TURNS = 20

async def load_recent_messages(conversation_id: str) -> list[dict]:
    db = get_db()
    rows = await db.fetch(
        "SELECT role, content FROM messages WHERE conversation_id = $1 "
        "ORDER BY created_at DESC LIMIT $2",
        conversation_id, MAX_TURNS
    )
    return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]


async def save_message(conversation_id: str, role: str, content: str, entities: list[dict] | None = None):
    db = get_db()
    await db.execute(
        "INSERT INTO messages (conversation_id, role, content, referenced_entities) "
        "VALUES ($1, $2, $3, $4)",
        conversation_id, role, content, entities or []
    )
    await db.execute("UPDATE conversations SET updated_at = now() WHERE id = $1", conversation_id)
```

```python
# app/routers/chat.py — entry point that wires memory into a graph run
from fastapi import APIRouter
from app.agents.memory import load_recent_messages, save_message
from app.agents.graph import get_compiled_graph

router = APIRouter(prefix="/chat")

@router.post("/{conversation_id}/message")
async def send_message(conversation_id: str, user_id: str, instruction: str):
    await save_message(conversation_id, "user", instruction)
    history = await load_recent_messages(conversation_id)

    graph = await get_compiled_graph()
    config = {"configurable": {"thread_id": conversation_id}}  # ties to LangGraph checkpointer
    result = await graph.ainvoke(
        {
            "user_id": user_id,
            "conversation_id": conversation_id,
            "instruction": instruction,
            "messages": history,
        },
        config=config
    )

    final_text = result["messages"][-1]["content"]
    await save_message(conversation_id, "assistant", final_text)
    return {"response": final_text}
```

---

## 7. Categorization Design

### 7.1 Resolution order: rules first, LLM fallback, confidence threshold

```python
# app/agents/categorizer.py
from anthropic import Anthropic
from app.config import settings
from app.db.session import get_db
from app.agents.state import MailAgentState

client = Anthropic(api_key=settings.anthropic_api_key)
CONFIDENCE_THRESHOLD = 0.6

async def match_rule(user_id: str, email: dict) -> str | None:
    db = get_db()
    rules = await db.fetch("SELECT * FROM category_rules WHERE user_id = $1", user_id)
    for rule in rules:
        if rule["match_type"] == "sender_domain" and email["sender"].endswith(rule["match_value"]):
            return rule["category"]
        if rule["match_type"] == "sender_exact" and email["sender"] == rule["match_value"]:
            return rule["category"]
        if rule["match_type"] == "subject_keyword" and rule["match_value"].lower() in email["subject"].lower():
            return rule["category"]
        if rule["match_type"] == "gmail_label" and rule["match_value"] in email.get("labels", []):
            return rule["category"]
    return None


def classify_with_llm_batch(emails: list[dict]) -> list[dict]:
    """Batched classification — one call for N emails, not N calls.
    Uses a cheap/fast model since this runs at high volume."""
    items = "\n".join(
        f"{i}. From: {e['sender']} | Subject: {e['subject']} | Snippet: {e['snippet'][:150]}"
        for i, e in enumerate(emails)
    )
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": f"Classify each email into one category: urgent, action_needed, "
                       f"meeting_request, fyi, newsletter, personal.\n\n{items}"
        }],
        tools=[{
            "name": "submit_classifications",
            "description": "Submit category + confidence for each email",
            "input_schema": {
                "type": "object",
                "properties": {
                    "results": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "index": {"type": "integer"},
                                "category": {"type": "string"},
                                "confidence": {"type": "number"}
                            },
                            "required": ["index", "category", "confidence"]
                        }
                    }
                },
                "required": ["results"]
            }
        }],
        tool_choice={"type": "tool", "name": "submit_classifications"}
    )
    return next(b.input["results"] for b in response.content if b.type == "tool_use")


async def categorizer_agent_node(state: MailAgentState) -> dict:
    db = get_db()
    emails = state.get("email_context", [])
    needs_llm = []
    resolved = []

    # Step 1: rules first — zero cost, deterministic, always wins on conflict
    for email in emails:
        rule_match = await match_rule(state["user_id"], email)
        if rule_match:
            resolved.append({"email_id": email["id"], "category": rule_match, "source": "rule"})
        else:
            needs_llm.append(email)

    # Step 2: LLM fallback, batched
    if needs_llm:
        llm_results = classify_with_llm_batch(needs_llm)
        for r in llm_results:
            email = needs_llm[r["index"]]
            if r["confidence"] < CONFIDENCE_THRESHOLD:
                category = "uncategorized"  # surfaced for user labeling, not guessed
            else:
                category = r["category"]
            resolved.append({"email_id": email["id"], "category": category, "source": "llm", "confidence": r["confidence"]})

    for r in resolved:
        await db.execute(
            "UPDATE email_cache SET category = $1, category_confidence = $2 WHERE id = $3",
            r["category"], r.get("confidence"), r["email_id"]
        )

    return {"completed_tasks": [{"agent": "categorizer", "count": len(resolved)}]}
```
---

## 8. Gmail + Google Calendar Integration

### 8.1 OAuth flow

```python
# app/auth/google_oauth.py
from google_auth_oauthlib.flow import Flow
from cryptography.fernet import Fernet
from app.config import settings

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.labels",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.readonly",
]

fernet = Fernet(settings.token_encryption_key.encode())

def get_auth_url() -> str:
    flow = Flow.from_client_config(
        {"web": {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uris": [settings.google_redirect_uri],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }},
        scopes=SCOPES,
        redirect_uri=settings.google_redirect_uri,
    )
    auth_url, _ = flow.authorization_url(access_type="offline", prompt="consent")
    return auth_url


async def handle_callback(code: str, user_id: str):
    from app.db.session import get_db
    flow = Flow.from_client_config(
        {"web": {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uris": [settings.google_redirect_uri],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }},
        scopes=SCOPES,
        redirect_uri=settings.google_redirect_uri,
    )
    flow.fetch_token(code=code)
    creds = flow.credentials

    db = get_db()
    await db.execute(
        "INSERT INTO oauth_credentials (user_id, provider, access_token_encrypted, "
        "refresh_token_encrypted, scopes, expires_at) VALUES ($1, 'google', $2, $3, $4, $5)",
        user_id,
        fernet.encrypt(creds.token.encode()),
        fernet.encrypt(creds.refresh_token.encode()),
        SCOPES,
        creds.expiry
    )
```

### 8.2 Gmail provider implementation

```python
# app/providers/gmail.py
import base64
from email.mime.text import MIMEText
from googleapiclient.discovery import build
from app.providers.base import MailProvider, Message, Thread, Draft, SendResult

class GmailProvider(MailProvider):
    def __init__(self, credentials):
        self.service = build("gmail", "v1", credentials=credentials)

    def list_messages(self, query: str, max_results: int = 20) -> list[Message]:
        result = self.service.users().messages().list(
            userId="me", q=query, maxResults=max_results
        ).execute()
        return [Message(id=m["id"], thread_id=m["threadId"]) for m in result.get("messages", [])]

    def get_thread(self, thread_id: str) -> Thread:
        raw = self.service.users().threads().get(
            userId="me", id=thread_id, format="full"
        ).execute()
        return Thread(id=thread_id, messages=raw["messages"])

    def create_draft(self, thread_id: str, html_body: str, subject: str | None) -> Draft:
        mime = MIMEText(html_body, "html")
        if subject:
            mime["subject"] = subject
        raw = base64.urlsafe_b64encode(mime.as_bytes()).decode()
        result = self.service.users().drafts().create(
            userId="me", body={"message": {"raw": raw, "threadId": thread_id}}
        ).execute()
        return Draft(id=result["id"], thread_id=thread_id)

    def send_draft(self, draft_id: str) -> SendResult:
        result = self.service.users().drafts().send(
            userId="me", body={"id": draft_id}
        ).execute()
        return SendResult(message_id=result["id"], status="sent")

    def apply_label(self, message_id: str, label: str) -> None:
        label_id = self._resolve_label_id(label)
        self.service.users().messages().modify(
            userId="me", id=message_id, body={"addLabelIds": [label_id]}
        ).execute()

    def _resolve_label_id(self, label_name: str) -> str:
        labels = self.service.users().labels().list(userId="me").execute()["labels"]
        for l in labels:
            if l["name"] == label_name:
                return l["id"]
        created = self.service.users().labels().create(
            userId="me", body={"name": label_name}
        ).execute()
        return created["id"]
```

### 8.3 Google Calendar provider

```python
# app/providers/google_calendar.py
from googleapiclient.discovery import build
from app.providers.base import CalendarProvider, Event

class GoogleCalendarProvider(CalendarProvider):
    def __init__(self, credentials):
        self.service = build("calendar", "v3", credentials=credentials)

    def check_availability(self, start: str, end: str) -> bool:
        result = self.service.freebusy().query(body={
            "timeMin": start, "timeMax": end, "items": [{"id": "primary"}]
        }).execute()
        busy = result["calendars"]["primary"]["busy"]
        return len(busy) == 0  # True = available

    def create_event(self, title: str, start: str, end: str, attendees: list[str]) -> Event:
        result = self.service.events().insert(
            calendarId="primary",
            body={
                "summary": title,
                "start": {"dateTime": start},
                "end": {"dateTime": end},
                "attendees": [{"email": a} for a in attendees],
            },
            sendUpdates="all"
        ).execute()
        return Event(id=result["id"], title=title, start=start, end=end)
```

### 8.4 Per-request credential resolution

```python
# app/providers/factory.py
from google.oauth2.credentials import Credentials
from cryptography.fernet import Fernet
from app.config import settings
from app.providers.gmail import GmailProvider
from app.providers.google_calendar import GoogleCalendarProvider

fernet = Fernet(settings.token_encryption_key.encode())

async def get_mail_provider(user_id: str):
    from app.db.session import get_db
    db = get_db()
    row = await db.fetchrow(
        "SELECT * FROM oauth_credentials WHERE user_id = $1 AND provider = 'google'", user_id
    )
    creds = Credentials(
        token=fernet.decrypt(row["access_token_encrypted"]).decode(),
        refresh_token=fernet.decrypt(row["refresh_token_encrypted"]).decode(),
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        token_uri="https://oauth2.googleapis.com/token",
    )
    return GmailProvider(creds)

async def get_calendar_provider(user_id: str):
    # same credential resolution as above, then:
    # return GoogleCalendarProvider(creds)
    ...
```

---

## 9. Frontend: Chat Panel + Approval Queue

### 9.1 WebSocket hook

```typescript
// frontend/src/hooks/useAgentSocket.ts
import { useEffect, useRef, useState } from "react";

export type AgentEvent =
  | { type: "task_started"; agent: string }
  | { type: "task_completed"; agent: string; summary: string }
  | { type: "approval_needed"; approval_id: string; action: any }
  | { type: "error"; agent: string; message: string };

export function useAgentSocket(userId: string) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    ws.current = new WebSocket(`wss://your-backend/ws/${userId}`);
    ws.current.onmessage = (msg) => {
      const event: AgentEvent = JSON.parse(msg.data);
      setEvents((prev) => [...prev, event]);
    };
    return () => ws.current?.close();
  }, [userId]);

  return events;
}
```

### 9.2 Chat panel

```tsx
// frontend/src/components/ChatPanel.tsx
import { useState } from "react";

export default function ChatPanel({ conversationId, userId }: { conversationId: string; userId: string }) {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!input.trim()) return;
    const instruction = input;
    setMessages((m) => [...m, { role: "user", content: instruction }]);
    setInput("");
    setLoading(true);

    const res = await fetch(`/chat/${conversationId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, instruction }),
    });
    const data = await res.json();
    setMessages((m) => [...m, { role: "assistant", content: data.response }]);
    setLoading(false);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <span className="inline-block px-3 py-2 rounded-lg bg-gray-800 text-white max-w-md">
              {m.content}
            </span>
          </div>
        ))}
        {loading && <div className="text-gray-400 text-sm">Agents working…</div>}
      </div>
      <div className="p-4 border-t border-gray-700 flex gap-2">
        <input
          className="flex-1 bg-gray-900 text-white rounded px-3 py-2"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="e.g. Summarize unread emails from clients and draft replies"
        />
        <button onClick={send} className="bg-blue-600 text-white px-4 py-2 rounded">
          Send
        </button>
      </div>
    </div>
  );
}
```

### 9.3 Approval queue

```tsx
// frontend/src/components/ApprovalQueue.tsx
import { useEffect, useState } from "react";

type Approval = {
  approval_id: string;
  action_type: string;
  payload: any;
  agent_reasoning: string;
};

export default function ApprovalQueue({ userId }: { userId: string }) {
  const [approvals, setApprovals] = useState<Approval[]>([]);

  useEffect(() => {
    fetch(`/approvals?user_id=${userId}&status=pending`)
      .then((r) => r.json())
      .then(setApprovals);
  }, [userId]);

  async function act(id: string, decision: "approve" | "reject") {
    await fetch(`/approvals/${id}/${decision}`, { method: "POST" });
    setApprovals((a) => a.filter((x) => x.approval_id !== id));
  }

  return (
    <div className="space-y-3 p-4">
      <h2 className="text-lg font-semibold text-white">Needs your review</h2>
      {approvals.length === 0 && <p className="text-gray-400 text-sm">Nothing pending.</p>}
      {approvals.map((a) => (
        <div key={a.approval_id} className="bg-gray-900 border border-gray-700 rounded-lg p-4">
          <div className="text-xs uppercase text-gray-400 mb-1">{a.action_type}</div>
          <pre className="text-sm text-gray-200 whitespace-pre-wrap mb-2">
            {JSON.stringify(a.payload, null, 2)}
          </pre>
          <p className="text-xs text-gray-500 mb-3">Reasoning: {a.agent_reasoning}</p>
          <div className="flex gap-2">
            <button onClick={() => act(a.approval_id, "approve")} className="bg-green-600 text-white px-3 py-1.5 rounded text-sm">
              Approve
            </button>
            <button onClick={() => act(a.approval_id, "reject")} className="bg-red-600 text-white px-3 py-1.5 rounded text-sm">
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```
---

## 10. Provider Abstraction (Outlook-Ready)

Write these base classes during Phase 1, before `GmailProvider` exists, so Gmail is the first implementation of an interface rather than a hardcoded path.

```python
# app/providers/base.py
from abc import ABC, abstractmethod
from dataclasses import dataclass

@dataclass
class Message:
    id: str
    thread_id: str

@dataclass
class Thread:
    id: str
    messages: list[dict]

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
    def list_messages(self, query: str, max_results: int) -> list[Message]: ...
    @abstractmethod
    def get_thread(self, thread_id: str) -> Thread: ...
    @abstractmethod
    def create_draft(self, thread_id: str, html_body: str, subject: str | None) -> Draft: ...
    @abstractmethod
    def send_draft(self, draft_id: str) -> SendResult: ...
    @abstractmethod
    def apply_label(self, message_id: str, label: str) -> None: ...

class CalendarProvider(ABC):
    @abstractmethod
    def check_availability(self, start: str, end: str) -> bool: ...
    @abstractmethod
    def create_event(self, title: str, start: str, end: str, attendees: list[str]) -> Event: ...
```

```python
# app/providers/outlook.py — Phase 2 skeleton, implement against this when you get there
import requests
from app.providers.base import MailProvider, Message, Thread, Draft, SendResult

GRAPH_BASE = "https://graph.microsoft.com/v1.0"

class OutlookProvider(MailProvider):
    def __init__(self, access_token: str):
        self.headers = {"Authorization": f"Bearer {access_token}"}

    def list_messages(self, query: str, max_results: int = 20) -> list[Message]:
        resp = requests.get(
            f"{GRAPH_BASE}/me/messages",
            headers=self.headers,
            params={"$search": f'"{query}"', "$top": max_results}
        ).json()
        return [Message(id=m["id"], thread_id=m["conversationId"]) for m in resp.get("value", [])]

    def get_thread(self, thread_id: str) -> Thread:
        resp = requests.get(
            f"{GRAPH_BASE}/me/messages",
            headers=self.headers,
            params={"$filter": f"conversationId eq '{thread_id}'"}
        ).json()
        return Thread(id=thread_id, messages=resp.get("value", []))

    def create_draft(self, thread_id: str, html_body: str, subject: str | None) -> Draft:
        resp = requests.post(
            f"{GRAPH_BASE}/me/messages",
            headers=self.headers,
            json={"subject": subject or "", "body": {"contentType": "HTML", "content": html_body}}
        ).json()
        return Draft(id=resp["id"], thread_id=thread_id)

    def send_draft(self, draft_id: str) -> SendResult:
        requests.post(f"{GRAPH_BASE}/me/messages/{draft_id}/send", headers=self.headers)
        return SendResult(message_id=draft_id, status="sent")

    def apply_label(self, message_id: str, label: str) -> None:
        # Outlook uses "categories" rather than labels
        requests.patch(
            f"{GRAPH_BASE}/me/messages/{message_id}",
            headers=self.headers,
            json={"categories": [label]}
        )
```

---

## 11. Formatting & Style Engine

### 11.1 StyleSpec + parsing

```python
# app/style/spec.py
from typing import Literal
from pydantic import BaseModel
from anthropic import Anthropic
from app.config import settings

client = Anthropic(api_key=settings.anthropic_api_key)

class StyleSpec(BaseModel):
    tone: Literal["formal", "casual", "neutral", "match_sender"] = "neutral"
    font_family: str = "Arial"
    font_size_pt: int = 11
    text_color: str = "#000000"
    accent_color: str | None = None
    line_spacing: float = 1.15
    paragraph_indent_px: int = 0
    include_signature: bool = True
    signature_profile_id: str | None = None
    bullet_style: Literal["dash", "dot", "numbered"] = "dot"


def parse_style_instruction(instruction: str) -> StyleSpec:
    """Converts free text like 'make it formal, blue headers, add my
    signature, use Calibri' into a structured StyleSpec via forced tool-call
    output — never letting the model hand-write formatting freeform."""
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=300,
        system="Extract formatting instructions into the StyleSpec schema. "
               "If a field isn't mentioned, omit it (defaults apply). Only extract "
               "explicit or strongly implied preferences — do not invent ones the user didn't state.",
        messages=[{"role": "user", "content": instruction}],
        tools=[{
            "name": "submit_style",
            "description": "Submit the parsed style specification",
            "input_schema": StyleSpec.model_json_schema()
        }],
        tool_choice={"type": "tool", "name": "submit_style"}
    )
    parsed = next(b.input for b in response.content if b.type == "tool_use")
    return StyleSpec(**parsed)
```

### 11.2 Deterministic rendering

```python
# app/style/render.py
import markdown
from jinja2 import Environment, FileSystemLoader
from app.style.spec import StyleSpec

jinja_env = Environment(loader=FileSystemLoader("app/style/templates"))

def render_styled_html(body_markdown: str, style: StyleSpec, signature_html: str = "",
                        outlook_safe: bool = False) -> str:
    body_html = markdown.markdown(body_markdown)
    template_name = "email_outlook_safe.html.j2" if outlook_safe else "email_base.html.j2"
    template = jinja_env.get_template(template_name)
    return template.render(
        body=body_html,
        font_family=style.font_family,
        font_size=style.font_size_pt,
        color=style.text_color,
        accent=style.accent_color or "#1F4E79",
        line_height=style.line_spacing,
        indent=style.paragraph_indent_px,
        signature=signature_html if style.include_signature else "",
    )
```

### 11.3 Standard template

```html
<!-- app/style/templates/email_base.html.j2 -->
<!DOCTYPE html>
<html>
<body style="font-family: {{ font_family }}, sans-serif; font-size: {{ font_size }}pt;
             color: {{ color }}; line-height: {{ line_height }};">
  <div style="padding-left: {{ indent }}px;">
    {{ body | safe }}
  </div>
  {% if signature %}
  <div style="margin-top: 24px; border-top: 1px solid #ddd; padding-top: 12px;">
    {{ signature | safe }}
  </div>
  {% endif %}
</body>
</html>
```

### 11.4 Outlook-safe template (table-based layout)

```html
<!-- app/style/templates/email_outlook_safe.html.j2 -->
<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office">
<body>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="font-family: {{ font_family }}, Arial, sans-serif; font-size: {{ font_size }}pt;
                  color: {{ color }}; padding-left: {{ indent }}px;">
        {{ body | safe }}
      </td>
    </tr>
    {% if signature %}
    <tr>
      <td style="border-top: 1px solid #dddddd; padding-top: 12px; margin-top: 24px;">
        {{ signature | safe }}
      </td>
    </tr>
    {% endif %}
  </table>
</body>
</html>
```

---

## 12. Cost Controls & Rate Limiting

### 12.1 Quota-aware retry wrapper

```python
# app/providers/retry.py
import time
from googleapiclient.errors import HttpError

def with_quota_backoff(func, max_retries: int = 5):
    """Wrap any Gmail/Calendar API call with exponential backoff on
    429/403 quota errors. Use this around every provider call in
    production, not just at the top level."""
    def wrapped(*args, **kwargs):
        delay = 1.0
        for attempt in range(max_retries):
            try:
                return func(*args, **kwargs)
            except HttpError as e:
                if e.resp.status in (429, 403) and attempt < max_retries - 1:
                    time.sleep(delay)
                    delay *= 2
                    continue
                raise
    return wrapped
```

### 12.2 Per-user send rate limiting

```python
# app/permissions/rate_limit.py
from app.db.session import get_db

MAX_SENDS_PER_HOUR = 30

async def check_send_rate_limit(user_id: str) -> bool:
    db = get_db()
    count = await db.fetchval(
        "SELECT count(*) FROM audit_log WHERE user_id = $1 AND tool_name = 'send_email' "
        "AND created_at > now() - interval '1 hour'",
        user_id
    )
    return count < MAX_SENDS_PER_HOUR
```

### 12.3 Summary caching by watermark

```python
# app/agents/summarizer.py
from app.db.session import get_db
from anthropic import Anthropic
from app.config import settings

client = Anthropic(api_key=settings.anthropic_api_key)

async def get_or_create_summary(user_id: str, thread_id: str, thread_messages: list[dict]) -> str:
    db = get_db()
    latest_message_id = thread_messages[-1]["id"]

    cached = await db.fetchrow(
        "SELECT summary, last_message_id FROM thread_summaries WHERE user_id = $1 AND thread_id = $2",
        user_id, thread_id
    )
    if cached and cached["last_message_id"] == latest_message_id:
        return cached["summary"]  # thread hasn't advanced — skip the LLM call entirely

    full_text = "\n---\n".join(m.get("snippet", "") for m in thread_messages)
    response = client.messages.create(
        model="claude-sonnet-4-6", max_tokens=300,
        messages=[{"role": "user", "content": f"Summarize this email thread concisely:\n\n{full_text}"}]
    )
    summary = response.content[0].text

    await db.execute(
        "INSERT INTO thread_summaries (user_id, thread_id, summary, last_message_id) "
        "VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, thread_id) "
        "DO UPDATE SET summary = $3, last_message_id = $4, updated_at = now()",
        user_id, thread_id, summary, latest_message_id
    )
    return summary
```

---

## 13. Error Handling & Reconciliation

### 13.1 Transactional send wrapper

This is the core fix for the "send succeeds but DB write fails" failure mode: durable intent is recorded *before* the irreversible call, and the local record only flips to `sent` *after* the provider confirms.

```python
# app/tools/transactional_send.py
from app.db.session import get_db_sync
from app.providers.factory import get_mail_provider

def send_draft_transactionally(draft_id: str) -> dict:
    db = get_db_sync()

    # Step 1: confirm durable intent already exists (status='approved' was
    # set when the approval was granted — Section 5.3). We do NOT set
    # status='sent' yet.
    draft = db.execute("SELECT * FROM drafts WHERE id = %s", (draft_id,)).fetchone()
    if draft.status != "approved":
        raise ValueError(f"Draft {draft_id} is not in an approved state")

    # Step 2: the irreversible call
    try:
        provider = get_mail_provider(draft.user_id)
        result = provider.send_draft(draft.provider_draft_id)
    except Exception as e:
        # Provider call failed outright — safe, nothing was sent. Leave
        # status as 'approved' so it can be retried.
        db.execute(
            "UPDATE drafts SET status = 'send_failed' WHERE id = %s", (draft_id,)
        )
        raise

    # Step 3: only now, after confirmed success, update local state —
    # in the same transaction as the audit log write.
    with db.transaction():
        db.execute("UPDATE drafts SET status = 'sent' WHERE id = %s", (draft_id,))
        db.execute(
            "INSERT INTO audit_log (user_id, agent_name, tool_name, input_params, output) "
            "VALUES (%s, 'sender', 'send_email', %s, %s)",
            (draft.user_id, {"draft_id": draft_id}, {"message_id": result.message_id})
        )

    return {"message_id": result.message_id, "status": "sent"}
```

### 13.2 Reconciliation job

Catches the rare case where the provider call succeeded but the subsequent local DB transaction itself failed (process crash between step 2 and 3 above).

```python
# app/jobs/reconcile_sends.py
"""Run on a schedule (e.g. every 5 minutes via Celery beat).
Finds drafts stuck in 'approved' or 'send_failed' for too long and checks
actual Gmail state before deciding whether to retry or alert the user —
never blindly re-sends."""
from app.db.session import get_db_sync
from app.providers.factory import get_mail_provider

def reconcile_stuck_sends():
    db = get_db_sync()
    stuck = db.execute(
        "SELECT * FROM drafts WHERE status IN ('approved', 'send_failed') "
        "AND created_at < now() - interval '10 minutes'"
    ).fetchall()

    for draft in stuck:
        provider = get_mail_provider(draft.user_id)
        # Check if a sent message matching this draft's provider_draft_id
        # already exists — if so, only the local write failed; fix the
        # record without re-sending. If not, it's safe to retry the send.
        already_sent = provider.check_if_draft_was_sent(draft.provider_draft_id)
        if already_sent:
            db.execute("UPDATE drafts SET status = 'sent' WHERE id = %s", (draft.id,))
        else:
            # Safe to retry — re-enters the transactional send path
            from app.tools.transactional_send import send_draft_transactionally
            try:
                send_draft_transactionally(draft.id)
            except Exception:
                pass  # will be picked up again next reconciliation cycle
```

### 13.3 Partial batch failure isolation

```python
# app/agents/reader.py — example of isolating per-item failures in a batch
from app.agents.state import MailAgentState

async def reader_agent_node(state: MailAgentState) -> dict:
    from app.providers.factory import get_mail_provider
    provider = await get_mail_provider(state["user_id"])

    results, errors = [], []
    for task in [t for t in state["plan"] if t["worker"] == "reader"]:
        try:
            messages = provider.list_messages(query=task["task"], max_results=50)
            results.extend([{"id": m.id, "thread_id": m.thread_id} for m in messages])
        except Exception as e:
            # One failing query doesn't abort the whole multi-task plan
            errors.append({"task": task, "error": str(e)})

    return {"email_context": results, "errors": errors}
```

---


---

## 14. Bulk Campaigns — Personalized Outreach (Extension)

Companion to `Mail_Agent_Build_Guide.html → Section 15a`. This extends the core architecture to support sending personalized emails to a list of recipients (e.g. outreach campaigns), rather than only single-thread replies. Build this *after* Milestones 1–4 (core system working and tested) — it depends on a proven send path.

### 14.1 New database tables

```sql
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    instruction TEXT NOT NULL,           -- the original free-text instruction
    template_markdown TEXT,              -- personalization template, e.g. "Hi {name}, ..."
    style_profile_id UUID REFERENCES style_profiles(id),
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','sending','paused','completed','failed')),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE campaign_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    personalization_vars JSONB NOT NULL,   -- e.g. {"name": "John", "company": "Microsoft", "role": "Eng Manager"}
    enrichment_confidence REAL,            -- flags incomplete/uncertain personalization data
    draft_id UUID REFERENCES drafts(id),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','enriched','drafted','sent','failed','skipped')),
    error_message TEXT,
    sent_at TIMESTAMPTZ
);
CREATE INDEX idx_campaign_recipients_campaign ON campaign_recipients(campaign_id, status);

CREATE TABLE campaign_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    sent_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    last_processed_recipient_id UUID,    -- checkpoint, so a crash mid-run can resume
    rate_limit_per_minute INT DEFAULT 10
);
```

### 14.2 State additions

```python
# app/agents/state.py — additions to MailAgentState from Section 3.1
from typing import Annotated
from operator import add

class MailAgentState(MessagesState):
    # ... existing fields from Section 3.1 ...

    campaign_id: str | None                                    # single-writer
    recipient_batches: Annotated[list[dict], add]               # written by parallel enrich/personalize tasks
    send_progress: dict | None                                  # single-writer (Campaign Manager owns it)
    failed_recipients: Annotated[list[dict], add]                # written by parallel Sender Queue workers
```

### 14.3 Campaign Manager agent

```python
# app/agents/campaign_manager.py
from app.agents.state import MailAgentState
from app.db.session import get_db

BATCH_SIZE = 20

async def load_recipients(campaign_id: str) -> list[dict]:
    db = get_db()
    rows = await db.fetch(
        "SELECT id, email, personalization_vars FROM campaign_recipients "
        "WHERE campaign_id = $1 AND status = 'pending'",
        campaign_id
    )
    return [dict(r) for r in rows]


async def campaign_manager_node(state: MailAgentState) -> dict:
    """Loads the recipient list and chunks it into parallel batches for
    the Context Enricher / Personalization / Drafter fan-out. Does not
    draft or send anything itself — pure orchestration, same separation
    of concerns as the Supervisor."""
    recipients = await load_recipients(state["campaign_id"])
    batches = [recipients[i:i + BATCH_SIZE] for i in range(0, len(recipients), BATCH_SIZE)]

    return {
        "recipient_batches": [{"batch": b, "campaign_id": state["campaign_id"]} for b in batches],
        "send_progress": {"total": len(recipients), "sent": 0, "failed": 0, "queued": len(recipients)},
    }


async def get_campaign_status(campaign_id: str) -> dict:
    db = get_db()
    row = await db.fetchrow(
        "SELECT status, "
        "count(*) FILTER (WHERE status = 'sent') as sent, "
        "count(*) FILTER (WHERE status = 'failed') as failed, "
        "count(*) FILTER (WHERE status = 'pending') as queued, "
        "count(*) as total "
        "FROM campaign_recipients WHERE campaign_id = $1 GROUP BY status",
        campaign_id
    )
    return dict(row) if row else {}
```

### 14.4 Context Enricher + Personalization agents

```python
# app/agents/context_enricher.py
from app.agents.state import MailAgentState

async def context_enricher_node(state: MailAgentState) -> dict:
    """Per-recipient: fills in any personalization fields not already
    present in campaign_recipients.personalization_vars (e.g. from a CRM
    or LinkedIn lookup). For the prototype, this can be a pass-through if
    the uploaded recipient list already has all fields populated."""
    enriched = []
    for batch_entry in state.get("recipient_batches", []):
        for recipient in batch_entry["batch"]:
            vars = recipient["personalization_vars"]
            confidence = 1.0 if all(vars.get(k) for k in ["name", "company"]) else 0.5
            enriched.append({**recipient, "enrichment_confidence": confidence})
    return {"recipient_batches": [{"enriched": enriched}]}
```

```python
# app/agents/personalization.py
from anthropic import Anthropic
from app.config import settings
from app.agents.state import MailAgentState

client = Anthropic(api_key=settings.anthropic_api_key)

def personalize_batch(template: str, recipients: list[dict]) -> list[dict]:
    """Batched personalization — fills the template's {variables} for
    each recipient. Uses simple template substitution where possible
    (cheap, deterministic) and falls back to an LLM call only for
    free-text personalization (e.g. 'reference something specific about
    their company') if the template requires it."""
    results = []
    for r in recipients:
        try:
            body = template.format(**r["personalization_vars"])
            results.append({"recipient_id": r["id"], "body_markdown": body, "status": "ok"})
        except KeyError as e:
            # Missing a required variable — flag for individual review,
            # don't silently send a broken template
            results.append({"recipient_id": r["id"], "body_markdown": None,
                           "status": "missing_field", "missing": str(e)})
    return results
```

### 14.5 Bulk approval

```python
# app/permissions/bulk_approval.py
from app.db.session import get_db
from app.permissions.tokens import issue_token

PREVIEW_SAMPLE_SIZE = 5

async def create_bulk_approval(campaign_id: str, user_id: str, drafts: list[dict]) -> dict:
    """Creates ONE approval covering all N drafts, with a stratified
    preview sample, instead of N individual approval_queue rows."""
    db = get_db()

    flagged = [d for d in drafts if d.get("status") == "missing_field"]
    ok_drafts = [d for d in drafts if d.get("status") == "ok"]

    # Stratified sample: spread across the batch, not just the first N
    step = max(1, len(ok_drafts) // PREVIEW_SAMPLE_SIZE)
    preview = ok_drafts[::step][:PREVIEW_SAMPLE_SIZE]

    row = await db.fetchrow(
        "INSERT INTO approval_queue (user_id, action_type, resource_id, payload, agent_reasoning, expires_at) "
        "VALUES ($1, 'send_campaign_batch', $2, $3, $4, now() + interval '30 minutes') RETURNING id",
        user_id, campaign_id,
        {
            "total_recipients": len(drafts),
            "ready_count": len(ok_drafts),
            "flagged_count": len(flagged),
            "preview_samples": preview,
            "flagged_samples": flagged[:PREVIEW_SAMPLE_SIZE],
        },
        f"Generated {len(ok_drafts)} personalized drafts for campaign {campaign_id}. "
        f"{len(flagged)} recipient(s) had missing personalization fields and need individual review."
    )
    token = issue_token(row["id"], "send_campaign_batch", campaign_id)
    await db.execute("UPDATE approval_queue SET confirmation_token = $1 WHERE id = $2", token, row["id"])
    return {"approval_id": str(row["id"]), "token": token, "flagged": flagged}
```

### 14.6 Rate-limited sender queue

```python
# app/agents/campaign_sender.py
"""Run as a Celery task (not inline in the request/response cycle) —
campaigns of hundreds of recipients take minutes, not seconds, and must
survive a backend restart via the campaign_runs checkpoint."""
import time
from app.db.session import get_db_sync
from app.providers.factory import get_mail_provider
from app.permissions.tokens import verify_token

def send_campaign_batch(campaign_id: str, confirmation_token: str, rate_per_minute: int = 10):
    verify_token(confirmation_token, action="send_campaign_batch", resource=campaign_id)

    db = get_db_sync()
    run = db.execute(
        "INSERT INTO campaign_runs (campaign_id, rate_limit_per_minute) VALUES (%s, %s) RETURNING id",
        (campaign_id, rate_per_minute)
    ).fetchone()
    run_id = run.id

    delay_seconds = 60.0 / rate_per_minute
    recipients = db.execute(
        "SELECT * FROM campaign_recipients WHERE campaign_id = %s AND status = 'drafted'",
        (campaign_id,)
    ).fetchall()

    provider = get_mail_provider(db.current_user_id)
    sent, failed = 0, 0

    for recipient in recipients:
        try:
            # Same transactional pattern as Section 13.1 — durable intent
            # before send, confirmed status only after provider success
            result = provider.send_draft(recipient.draft_provider_id)
            db.execute(
                "UPDATE campaign_recipients SET status = 'sent', sent_at = now() WHERE id = %s",
                (recipient.id,)
            )
            sent += 1
        except Exception as e:
            db.execute(
                "UPDATE campaign_recipients SET status = 'failed', error_message = %s WHERE id = %s",
                (str(e), recipient.id)
            )
            failed += 1
            # One failed send does not stop the batch — isolated per recipient,
            # same principle as Section 13.3

        db.execute(
            "UPDATE campaign_runs SET sent_count = %s, failed_count = %s, "
            "last_processed_recipient_id = %s WHERE id = %s",
            (sent, failed, recipient.id, run_id)
        )
        time.sleep(delay_seconds)  # pace sends — never fire in a tight loop

    db.execute(
        "UPDATE campaign_runs SET completed_at = now() WHERE id = %s", (run_id,)
    )
    db.execute(
        "UPDATE campaigns SET status = 'completed' WHERE id = %s", (campaign_id,)
    )
    return {"sent": sent, "failed": failed}
```

### 14.7 Resuming an interrupted campaign run

```python
# app/jobs/resume_campaigns.py
"""Run on startup / on a schedule. Finds campaign_runs that never
completed (e.g. backend crashed mid-send) and resumes from the
last checkpointed recipient rather than restarting or losing state."""
from app.db.session import get_db_sync

def resume_interrupted_campaigns():
    db = get_db_sync()
    stuck_runs = db.execute(
        "SELECT * FROM campaign_runs WHERE completed_at IS NULL "
        "AND started_at < now() - interval '5 minutes'"
    ).fetchall()

    for run in stuck_runs:
        # Recipients already marked 'sent' or 'failed' are skipped automatically
        # since send_campaign_batch only queries status = 'drafted'
        from app.agents.campaign_sender import send_campaign_batch
        send_campaign_batch(run.campaign_id, confirmation_token=None, rate_per_minute=run.rate_limit_per_minute)
        # Note: in production, store the original confirmation_token or use
        # an internal resume-only path that bypasses re-verification, since
        # the original token may have expired by the time of resume.
```

### 14.8 Supervisor routing for campaign instructions

```python
# app/agents/supervisor.py — addition to SUPERVISOR_SYSTEM_PROMPT from Section 3.3
CAMPAIGN_DETECTION_ADDENDUM = """
If the instruction describes sending to MULTIPLE recipients (a list, a
CSV, "these N people/companies/recruiters", etc.) with personalization,
route to "campaign_manager" instead of "drafter" + "sender". A single
"campaign_manager" task with the full instruction as its task text is
sufficient — Campaign Manager will handle the recipient loading and
sub-task fan-out itself.
"""
# Append this to SUPERVISOR_SYSTEM_PROMPT, and add "campaign_manager" to
# the enum list in the submit_plan tool schema and to WORKER_NODES in
# app/agents/graph.py (Section 3.2).
```

---

## Updated Summary: What to Build First

Sections 1–13 (core system) come first, unchanged from the original sequencing. Section 14 (Bulk Campaigns) is **Phase 1.5** — start it only after Milestones 1–4 from the build guide are done and the single-recipient send path is tested and trustworthy. Building campaigns against an unproven send path means debugging two new failure surfaces (campaign orchestration AND core sending) at once.
