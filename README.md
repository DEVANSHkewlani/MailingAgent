# Mail Agent ☤ — LangGraph Multi-Agent Assistant

Mail Agent is an advanced, highly efficient, and human-in-the-loop multi-agent email and calendar automation suite. Powered by [LangGraph](https://github.com/langchain-ai/langgraph), [FastAPI](https://fastapi.tiangolo.com/), and [React + Vite + Electron](https://vite.dev/), the system allows users to interactively search, draft, categorize, schedule, and execute mail and calendar instructions via conversational interfaces.

---

## 1. Key Capabilities

1. **Intelligent Query & Plan Decomposition**:
   * Conversational instructions are parsed by a `supervisor` agent which decomposes tasks into worker execution jobs.
   * Leverages high-throughput model endpoints (e.g., Llama-3-based models via Groq client adapters).

2. **Parallel Multi-Agent Worker Execution**:
   * Uses [LangGraph StateGraph](file:///Users/devanshkewlani/iCloud%20Drive%20%28Archive%29/Desktop/PROJECTS/Mailing%20agent/backend/app/agents/graph.py) flow to coordinate workers executing simultaneously.
   * Parallel execution outcomes are dynamically merged into the graph state using type-safe custom reducers to prevent race conditions or state overwriting.

3. **Email Categorization & Rule Engine**:
   * Automatically classifies email threads using custom rules (sender domains, keywords, label match types) and fallback LLM evaluations.
   * Synchronizes data dynamically to the local cache database.

4. **Meeting Detection & Scheduling**:
   * Auto-extracts calendar requests and scheduling intent.
   * Books and schedules events directly on Google Calendar with conflict avoidance checks.

5. **Human-in-the-Loop Governance & Permission Gateway**:
   * All mutations (e.g., sending replies or editing calendar events) route through a dedicated approval gateway.
   * Generates secure confirmation tokens and pushes approval events to the client dashboard in real-time over WebSockets.

6. **Transactional Send & Style Customization**:
   * Utilizes responsive Jinja2 templates (standard HTML and outlook-safe options) with custom signature headers, font specs, and brand guidelines.

---

## 2. Multi-Agent System Architecture

The core of the assistant is built on a directed acyclic execution graph implemented in [backend/app/agents/graph.py](file:///Users/devanshkewlani/iCloud%20Drive%20%28Archive%29/Desktop/PROJECTS/Mailing%20agent/backend/app/agents/graph.py).

```mermaid
graph TD
    START([START]) --> SupervisorNode[Supervisor Node]
    
    %% Parallel Workers Fan Out
    SupervisorNode -->|Fan-Out Plan| ReaderNode[Reader Agent]
    SupervisorNode -->|Fan-Out Plan| CategorizerNode[Categorizer Agent]
    SupervisorNode -->|Fan-Out Plan| SummarizerNode[Summarizer Agent]
    SupervisorNode -->|Fan-Out Plan| DrafterNode[Drafter Agent]
    SupervisorNode -->|Fan-Out Plan| SchedulerNode[Scheduler Agent]
    SupervisorNode -->|Fan-Out Plan| ReminderNode[Reminder Agent]
    
    %% Reader Conditional Routing
    ReaderNode -->|Condition: Unexecuted Worker Tasks| CategorizerNode
    ReaderNode -->|Condition: Unexecuted Worker Tasks| SummarizerNode
    ReaderNode -->|Condition: Unexecuted Worker Tasks| DrafterNode
    ReaderNode -->|Condition: Unexecuted Worker Tasks| SchedulerNode
    ReaderNode -->|Condition: Unexecuted Worker Tasks| ReminderNode
    ReaderNode -->|Condition: Plan Done| PermGate[Permission Gate Node]
    
    %% Workers Convergence
    CategorizerNode --> PermGate
    SummarizerNode --> PermGate
    DrafterNode --> PermGate
    SchedulerNode --> PermGate
    ReminderNode --> PermGate
    
    %% Permission Gate Routing
    PermGate -->|Needs Human Approval| END([END / Suspend State])
    PermGate -->|Auto-Approved Action| ExecutorNode[Tool Executor Node]
    
    %% Execution Wrap Up
    ExecutorNode --> AggregatorNode[Aggregator Node]
    AggregatorNode --> END
```

### 2.1. Node Specifications & Flow Tracing
1. **Supervisor Node ([supervisor.py](file:///Users/devanshkewlani/iCloud%20Drive%20%28Archive%29/Desktop/PROJECTS/Mailing%20agent/backend/app/agents/supervisor.py))**: Decides what worker sub-tasks are necessary to fulfill the user's intent. Outputs a structured task queue plan.
2. **Reader Node ([reader.py](file:///Users/devanshkewlani/iCloud%20Drive%20%28Archive%29/Desktop/PROJECTS/Mailing%20agent/backend/app/agents/reader.py))**: Evaluates user mail filters and pulls raw email threads from mail server providers.
3. **Categorizer Node ([categorizer.py](file:///Users/devanshkewlani/iCloud%20Drive%20%28Archive%29/Desktop/PROJECTS/Mailing%20agent/backend/app/agents/categorizer.py))**: Applies classification rules and assigns categories (`action_needed`, `fyi`, `newsletter`, etc.).
4. **Summarizer Node ([summarizer.py](file:///Users/devanshkewlani/iCloud%20Drive%20%28Archive%29/Desktop/PROJECTS/Mailing%20agent/backend/app/agents/summarizer.py))**: Processes text-heavy message content to extract brief key updates.
5. **Drafter Node ([drafter.py](file:///Users/devanshkewlani/iCloud%20Drive%20%28Archive%29/Desktop/PROJECTS/Mailing%20agent/backend/app/agents/drafter.py))**: Formulates responsive email drafts utilizing custom templates.
6. **Scheduler Node ([scheduler.py](file:///Users/devanshkewlani/iCloud%20Drive%20%28Archive%29/Desktop/PROJECTS/Mailing%20agent/backend/app/agents/scheduler.py))**: Evaluates scheduling contexts, calendar entries, and parses slots.
7. **Reminder Node ([reminder.py](file:///Users/devanshkewlani/iCloud%20Drive%20%28Archive%29/Desktop/PROJECTS/Mailing%20agent/backend/app/agents/reminder.py))**: Automatically tags dates to schedule reminders for items requiring follow-ups.
8. **Permission Gate ([policy.py](file:///Users/devanshkewlani/iCloud%20Drive%20%28Archive%29/Desktop/PROJECTS/Mailing%20agent/backend/app/permissions/policy.py))**: Checks against security policies. If an action requires human review, details are inserted into the `approval_queue` and the graph execution suspends (`interrupt`).
9. **Tool Executor ([executor.py](file:///Users/devanshkewlani/iCloud%20Drive%20%28Archive%29/Desktop/PROJECTS/Mailing%20agent/backend/app/agents/executor.py))**: Dispatches actual tools (sending a drafted message or writing a calendar event to Google APIs).
10. **Aggregator Node ([aggregator.py](file:///Users/devanshkewlani/iCloud%20Drive%20%28Archive%29/Desktop/PROJECTS/Mailing%20agent/backend/app/agents/aggregator.py))**: Consolidates parallel worker state logs to format the final UI conversational text response.

---

## 3. Database Schema

The database schema is organized across 15 relational tables. Schema migrations are managed via [Alembic](https://alembic.ot rebellion.org/en/latest/).

### 3.1. Database Tables Reference
1. **`users`**: Master user authentication profile storage.
2. **`oauth_credentials`**: Encrypted access/refresh tokens for Google / Microsoft OAuth providers.
3. **`conversations`**: Tracks active LangGraph thread context sessions.
4. **`messages`**: Stores individual conversation turn logs, storing referenced entities for resolving pronouns (e.g., "reply to *that* email").
5. **`style_profiles`**: Style spec settings, signatures, and HTML email templates.
6. **`email_cache`**: Local metadata indexing of fetched inbox messages.
7. **`thread_summaries`**: Versioned summaries of cached email threads, mapped to latest message watermarks.
8. **`category_rules`**: Matching patterns (sender domains, keywords, labels) used by categorizers.
9. **`drafts`**: Draft states generated by the agent awaiting transmission.
10. **`approval_queue`**: Logs actions needing human verification before execution.
11. **`permission_rules`**: Custom user-defined permissions matching actions (`SEND_EMAIL`, `CREATE_EVENT`) to execution types (`AUTO`, `CONFIRM`, `BLOCKED`).
12. **`reminders`**: Pending follow-up alerts flagged by the agent.
13. **`calendar_events`**: Cached local copy of calendar items.
14. **`audit_log`**: Write-only ledger of actions taken by the agents.
15. **`audit_log_access`**: Compliance log storing records of who viewed which audit trails.

---

## 4. Repository Structure

```text
mail-agent/
├── backend/
│   ├── app/
│   │   ├── main.py                     # FastAPI ASGI app and startup events
│   │   ├── config.py                   # Pydantic BaseSettings class
│   │   ├── test_verification.py        # Automated test verification pipeline
│   │   ├── db/
│   │   │   ├── session.py              # asyncpg database connection pooling
│   │   │   └── models.py               # SQLAlchemy metadata models
│   │   ├── agents/                     # LangGraph Agent nodes & state definition
│   │   │   ├── state.py                # MailAgentState with custom reducers
│   │   │   ├── graph.py                # DAG constructor and Postgres Checkpointer
│   │   │   ├── supervisor.py           # Task planning supervisor
│   │   │   └── reader.py, categorizer.py, summarizer.py, drafter.py, scheduler.py, reminder.py, executor.py, aggregator.py
│   │   ├── tools/                      # API tools wrappers called by nodes
│   │   │   ├── mail_tools.py           # Search, fetch, draft, and send functions
│   │   │   └── transactional_send.py   # Bulk transaction send operations
│   │   ├── permissions/                # Human-in-the-loop policies
│   │   │   ├── policy.py               # Gate evaluation criteria logic
│   │   │   ├── tokens.py               # Cryptographic secure token engines
│   │   │   └── rate_limit.py           # Cost and rate limiter rules
│   │   ├── providers/                  # External integrations
│   │   │   ├── base.py                 # Abstract base class adapters
│   │   │   ├── gmail.py                # Gmail REST API clients
│   │   │   └── google_calendar.py      # Google Calendar REST API clients
│   │   ├── style/                      # Format & Style Engine
│   │   │   ├── spec.py                 # Signature, tone rules & profiles
│   │   │   └── render.py               # Jinja2 rendering pipeline
│   │   └── routers/                    # FastAPI API routers
│   │       ├── chat.py                 # REST endpoint for thread invocation
│   │       ├── approvals.py            # Approval queues endpoint
│   │       └── auth.py                 # Google/Microsoft OAuth handshakes
│   ├── alembic/                        # DB Migration Scripts
│   └── requirements.txt                # Python backend dependencies
├── frontend/
│   ├── src/
│   │   ├── App.tsx                     # React Router configurations
│   │   ├── components/
│   │   │   ├── app-shell.tsx           # Multi-pane dashboard layout
│   │   │   ├── chat-panel.tsx          # Real-time message streaming feed
│   │   │   └── chat-sidebar.tsx        # Conversation navigation rail
│   │   └── store/
│   │       ├── chat.ts                 # Chat stores (nanostores)
│   │       └── approvals.ts            # Approval feeds
│   ├── package.json                    # Frontend Vite configuration file
│   └── tsconfig.json                   # TypeScript config compile targets
├── docker-compose.yml                  # Service configurations (PostgreSQL, Redis)
└── IMPLEMENTATION.md                   # Raw codebase snippets Companion Guide
```

---

## 5. Prerequisites & Local Installation

Follow these numbered steps to configure and build the application locally:

### 5.1. Initialize Supporting Infrastructure
1. Make sure Docker is running on your machine.
2. Launch the PostgreSQL and Redis containers using Docker Compose from the root directory:
   ```bash
   docker-compose up -d
   ```
   *Note: This spins up PostgreSQL on port `5432` and Redis on port `6379`.*

### 5.2. Backend Environment Setup
1. Navigate into the backend workspace and initialize a Python 3.11 virtual environment:
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate
   ```
2. Upgrade `pip` and install all required framework packages:
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```
3. Run Alembic migrations to construct the database schema:
   ```bash
   alembic upgrade head
   ```

### 5.3. Frontend Environment Setup
1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Install npm dependencies:
   ```bash
   npm install
   ```

---

## 6. Configuration Settings

Create a `.env` file under the `backend` folder. Match the key-value specifications below:

| Key Name | Sample / Reference Value | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql+asyncpg://postgres:postgrespassword@localhost:5432/mail_agent_db` | Connection string for Postgres using asyncpg |
| `REDIS_URL` | `redis://localhost:6379/0` | URL for caching and celery job distributions |
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` | API credential for advanced layout planning |
| `GROQ_API_KEY` | `gsk_...` | Groq key for hosting local worker LLM pipelines |
| `GOOGLE_CLIENT_ID` | `10577435...apps.googleusercontent.com` | Google APIs OAuth credential client identifier |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-...` | Secret string validation corresponding to Client ID |
| `GOOGLE_REDIRECT_URI` | `http://localhost:8000/auth/callback` | OAuth redirect endpoint matching the backend routing |
| `JWT_SECRET` | Run: `python3 -c "import secrets; print(secrets.token_urlsafe(48))"` | HS256 signing key for user session JWTs |
| `OAUTH_ENCRYPTION_KEY` | Run: `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` | Fernet key for encrypting OAuth tokens at rest |
| `TOKEN_SIGNING_KEY` | Run: `python3 -c "import secrets,base64; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"` | HMAC key for approval confirmation tokens |
| `ALLOWED_ORIGINS` | `http://localhost:5173,app://.` | Comma-separated list of allowed CORS origins |

---

## 7. Running the Application

For a fully interactive verification loop, spin up the modules sequentially:

### 7.1. Start the Backend API Server
Navigate to `backend` with the active virtual environment and run the ASGI dev server:
```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 7.2. Launch Background Task Runners
To execute asynchronous email reconciliation tasks, run Celery in a new terminal:
```bash
celery -A app.jobs worker --loglevel=info
```

### 7.3. Launch Frontend Client Dashboard
Run Vite in the frontend directory to serve the client dashboard:
```bash
npm run dev
```
Alternatively, to run the native Electron desktop shell:
```bash
npm run electron:dev
```

---

## 8. Verification & Testing

Verify that your local system, postgres tables, and multi-agent loops compile and execute correctly:

### 8.1. Database & LangGraph Pipeline Check
Run the verification check script directly from the backend folder:
```bash
python app/test_verification.py
```
This script runs a two-step validation:
1. **PostgreSQL Validation**: Connects to the database and ensures all 15 expected tables exist and match the configuration.
2. **LangGraph Pipeline Compilation**: Compiles the `StateGraph` object and runs a test execution using stub nodes to check connection savertips and execution boundaries.

---

## 9. Design Patterns & Implementation Choices

1. **State Reducers for Concurrency (`reduce_list`)**:
   In [state.py](file:///Users/devanshkewlani/iCloud%20Drive%20%28Archive%29/Desktop/PROJECTS/Mailing%20agent/backend/app/agents/state.py), variables like `active_tasks` and `completed_tasks` are concurrently populated by parallel nodes. The custom reducer `reduce_list` prevents state collision and supports clear overrides via the `ResetList` subclass wrapper.

2. **Sync-Async Bridge (`SyncDatabaseWrapper`)**:
   In [session.py](file:///Users/devanshkewlani/iCloud%20Drive%20%28Archive%29/Desktop/PROJECTS/Mailing%20agent/backend/app/db/session.py), synchronous library components (such as legacy tool pipelines and Celery tasks) must execute PG operations without spawning separate async tasks. `SyncDatabaseWrapper` bridges loops safely, running tasks synchronously inside separate threads if a loop is already active.

3. **Fernet Token Encryption**:
   Provider tokens are highly sensitive. Credentials are encrypted symmetrically in the database table `oauth_credentials` using the Fernet cipher wrapper in [tokens.py](file:///Users/devanshkewlani/iCloud%20Drive%20%28Archive%29/Desktop/PROJECTS/Mailing%20agent/backend/app/permissions/tokens.py), safeguarding access tokens from leak risks.
