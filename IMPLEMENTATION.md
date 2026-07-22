# Mail Agent Implementation Guide

This guide reflects the current repository state after the security hardening pass documented in `mailagent-security-guide.html`. It is no longer a scaffold or copy-paste build plan; the application is implemented as a FastAPI backend, LangGraph agent runtime, PostgreSQL/Redis data layer, and React/Vite/Electron frontend.

## 1. Current Architecture

Mail Agent is a human-in-the-loop email and calendar automation app.

```text
React / Vite / Electron frontend
  -> FastAPI REST API + authenticated WebSocket
  -> LangGraph multi-agent runtime
  -> Gmail, Google Calendar, SMTP, Groq/OpenAI-compatible LLM providers
  -> PostgreSQL for durable app state and LangGraph checkpoints
  -> Redis for OAuth state and atomic rate limits
```

Core runtime files:

| Area | Files |
| --- | --- |
| API app, CORS, security headers, WebSocket | `backend/app/main.py` |
| Settings and secrets | `backend/app/config.py` |
| JWT sessions | `backend/app/auth/jwt_auth.py` |
| Google OAuth | `backend/app/auth/google_oauth.py`, `backend/app/routers/auth.py` |
| Agent graph | `backend/app/agents/graph.py` |
| Human approval gate | `backend/app/permissions/policy.py`, `backend/app/routers/approvals.py` |
| Approval tokens | `backend/app/permissions/tokens.py` |
| Rate limits | `backend/app/permissions/rate_limit.py` |
| Database schema | `backend/app/db/schema.sql` |
| Database pool and sync bridge | `backend/app/db/session.py` |
| Mail/calendar providers | `backend/app/providers/*.py` |
| Single-draft transactional send | `backend/app/tools/transactional_send.py` |
| Bulk SMTP sender | `backend/app/routers/bulk_email.py`, `backend/app/tools/bulk_send_service.py` |
| Frontend API/auth state | `frontend/src/lib/api.ts`, `frontend/src/store/auth.ts`, `frontend/src/store/approvals.ts` |
| Electron shell | `frontend/electron/main.ts`, `frontend/electron/preload.ts` |

## 2. Security Hardening Summary

The major issues from the HTML security review have been addressed in the active code path:

| Previous issue | Current implementation |
| --- | --- |
| API trusted caller-supplied `user_id` | Protected endpoints use `Depends(get_current_user)` and derive `user_id` from a verified JWT. |
| Approval endpoints lacked auth and ownership checks | `approvals.py` requires JWT auth and checks `approval_queue.user_id` before approve/reject. |
| OAuth callback could bind tokens to arbitrary users | `google_oauth.py` derives identity from Google userinfo/Gmail profile, then upserts by email. |
| OAuth missing CSRF state | `/auth/login` generates a random state token and stores it in Redis with a 10-minute TTL; `/auth/callback` verifies and deletes it. |
| WebSocket accepted arbitrary user IDs | `/ws` requires a valid JWT query token and connects the socket under the decoded user ID. |
| Wildcard CORS | `main.py` reads `ALLOWED_ORIGINS` and passes explicit origins to FastAPI CORS middleware. |
| Shared crypto key purposes | Settings now separate `JWT_SECRET`, `OAUTH_ENCRYPTION_KEY`, and `TOKEN_SIGNING_KEY`. |
| Non-atomic send rate limit | `rate_limit.py` uses Redis sorted sets and pipeline operations for sliding-window limits. |
| Approval token parsing/signing weaknesses | Approval tokens are compact JSON payloads signed with HMAC-SHA256 and compared with `hmac.compare_digest`. |

Remaining production decisions:

- JWTs are stored in frontend `localStorage`. That matches the current SPA/Electron implementation, but a hardened web deployment should consider HttpOnly Secure cookies, refresh tokens, revocation, and shorter access-token lifetimes.
- The backend does not terminate HTTPS itself. TLS/HTTPS should be enforced by the deployment platform or reverse proxy.
- Bulk campaign jobs are tracked in memory in the FastAPI process. They are not durable across process restarts.

## 3. Configuration

Configuration is loaded by `backend/app/config.py` using `pydantic-settings`. Sensitive values are `SecretStr` where possible so accidental logging is less likely.

Required backend environment variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. `postgresql+asyncpg://...` is normalized to `postgresql://...` before use by `asyncpg`. |
| `REDIS_URL` | Redis URL for OAuth CSRF state and rate limiting. Defaults to `redis://localhost:6379/0`. |
| `ANTHROPIC_API_KEY` | Present for model/provider compatibility. |
| `GROQ_API_KEY` | Optional global LLM key fallback. Users can also store encrypted per-user Groq keys. |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID. |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret. |
| `GOOGLE_REDIRECT_URI` | Backend OAuth callback URL, normally `http://localhost:8000/auth/callback` in local dev. |
| `JWT_SECRET` | HS256 signing key for app session JWTs. |
| `OAUTH_ENCRYPTION_KEY` | Fernet key used to encrypt Google OAuth tokens, SMTP passwords, and stored Groq keys. |
| `TOKEN_SIGNING_KEY` | HMAC key used only for approval confirmation tokens. |
| `ALLOWED_ORIGINS` | Comma-separated CORS allow-list, default `http://localhost:5173`. |

Optional SMTP fallback variables:

| Variable | Purpose |
| --- | --- |
| `SMTP_HOST` | Global fallback SMTP host. |
| `SMTP_PORT` | Global fallback SMTP port, default `587`. |
| `SMTP_USERNAME` | Global fallback SMTP username. |
| `SMTP_PASSWORD` | Global fallback SMTP password. |
| `SMTP_USE_TLS` | Whether the single-draft transactional SMTP sender calls `starttls()`. Defaults to `true`. |

Generate independent keys:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

Use those outputs for `JWT_SECRET`, `OAUTH_ENCRYPTION_KEY`, and `TOKEN_SIGNING_KEY` respectively. Do not reuse one value for multiple purposes.

## 4. Local Services and Startup

`docker-compose.yml` starts PostgreSQL and Redis only:

```bash
docker-compose up -d
```

Backend:

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Electron desktop shell:

```bash
cd frontend
npm run electron:dev
```

The Vite dev server is fixed to port `5173` in `frontend/vite.config.ts`. The frontend reads `VITE_API_URL` and falls back to `http://localhost:8000`.

## 5. Database and Persistence

The canonical schema is `backend/app/db/schema.sql`. It uses `CREATE TABLE IF NOT EXISTS` and includes:

- identity and OAuth credentials: `users`, `oauth_credentials`
- conversation memory: `conversations`, `messages`
- style, email cache, and summaries: `style_profiles`, `email_cache`, `thread_summaries`
- categorization: `category_rules`
- drafts and approval flow: `drafts`, `approval_queue`, `permission_rules`
- reminders/calendar: `reminders`, `calendar_events`
- scheduled jobs: `cron_jobs`, `cron_runs`
- audit: `audit_log`, `audit_log_access`

The runtime uses `asyncpg` through `backend/app/db/session.py`. `init_pool()` initializes the pool at startup. `get_db()` exposes async `fetch`, `fetchrow`, and `execute` helpers. `get_db_sync()` exposes a sync wrapper for LangChain tools and synchronous send paths, translating `%s` placeholders into asyncpg `$1` parameters.

At startup, `backend/app/main.py` currently ensures user-level SMTP and Groq columns exist:

- `users.smtp_host`
- `users.smtp_port`
- `users.smtp_username`
- `users.smtp_password`
- `users.smtp_use_tls`
- `users.groq_api_key`

These `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements make the current local schema resilient, but a production deployment should convert them into migrations.

## 6. Authentication and Authorization

### 6.1 JWT Session Model

`backend/app/auth/jwt_auth.py` issues HS256 JWTs with:

- `user_id`
- `email`
- `iat`
- `exp`

The current expiry is 24 hours (`ACCESS_TOKEN_EXPIRE_HOURS = 24`). API routes use `get_current_user()`, which accepts either:

- `Authorization: Bearer <jwt>`
- `?token=<jwt>` for browser APIs that cannot set headers, such as `EventSource`

`verify_ws_token()` performs equivalent validation for WebSocket connections.

### 6.2 Google OAuth Flow

The implemented flow is:

1. `GET /auth/login?frontend_url=...`
2. `auth.py` generates `secrets.token_urlsafe(32)` state.
3. State is stored in Redis as `oauth_state:{state}` with a 10-minute TTL and the frontend redirect target as the value.
4. `google_oauth.py` builds the Google authorization URL with `access_type=offline`, `prompt=consent`, and the state value.
5. Google redirects to `GET /auth/callback?code=...&state=...`.
6. The callback verifies the Redis state, deletes it immediately, and exchanges the code for Google tokens.
7. `google_oauth.py` derives the user identity from Google userinfo, with Gmail profile as fallback. It does not accept identity from the request.
8. The user is upserted by email.
9. Google access and refresh tokens are encrypted with Fernet using `OAUTH_ENCRYPTION_KEY`.
10. The backend issues an app JWT with `JWT_SECRET`.
11. The user is redirected back to `/#/app?token=...&user_id=...`.

Google scopes are defined in `backend/app/auth/google_oauth.py` and currently include Gmail read/compose/send/labels/modify, Calendar read/write, userinfo email/profile, and OpenID.

### 6.3 Frontend Auth State

`frontend/src/store/auth.ts` stores:

- `mailing_agent_auth_token`
- `mailing_agent_user_id`

`frontend/src/lib/api.ts` adds `Authorization: Bearer <token>` to normal REST calls. For bulk campaign SSE streams it appends `?token=<jwt>`, because `EventSource` cannot set custom headers. `frontend/src/store/approvals.ts` opens the WebSocket as `/ws?token=<jwt>`.

### 6.4 Resource Ownership Checks

The current protected routers derive the user from the JWT and then restrict database access:

- `chat.py`: conversations, email cache, email body, drafts, alerts, and message execution use the decoded `user_id`; message and delete operations verify conversation ownership.
- `approvals.py`: approval list is filtered by authenticated user; approve/reject checks row ownership before mutation.
- `cron.py`: all job-specific operations call `_verify_job_ownership()`.
- `auth.py`: profile, SMTP, and Groq settings use the authenticated user.
- `bulk_email.py`: all endpoints require auth, but job state is in-memory and not persisted by user in the current implementation.

## 7. API Security Controls

### 7.1 CORS

`backend/app/main.py` parses `settings.allowed_origins` and configures:

```python
allow_origins=allowed_origins
allow_credentials=True
allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
allow_headers=["Authorization", "Content-Type", "X-Groq-Api-Key"]
```

There is no wildcard origin in the current app config. In production, `ALLOWED_ORIGINS` should be only the deployed frontend origin(s).

### 7.2 Security Headers

`SecurityHeadersMiddleware` sets:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

These are defense-in-depth headers for the API responses. HTTPS/HSTS still belongs at the reverse proxy or hosting platform.

### 7.3 Input Validation

The backend uses Pydantic models and explicit parsing for risky inputs:

- `chat.py` limits `instruction` to 1-4000 characters and rejects null bytes.
- `cron.py` validates schedule type and bounds interval schedules to 1 minute through 7 days.
- `bulk_email.py` only accepts `.csv` uploads for the CSV parsing endpoint.
- `bulk_send_service.py` constrains `delay_seconds` between 0 and 60 seconds.
- SQL calls use asyncpg `$1` parameters or the sync wrapper's parameter binding rather than string interpolation.

## 8. Rate Limiting

`backend/app/permissions/rate_limit.py` implements atomic sliding-window rate limiting with Redis sorted sets. The function:

1. removes expired entries,
2. inserts the current request,
3. counts the set,
4. refreshes key TTL.

Current enforced limits:

- `chat.py`: 20 chat messages per authenticated user per hour.
- `check_send_rate_limit()`: 30 sends per user per hour for legacy send-policy compatibility.

The primitives are available for auth, approval, and bulk endpoints, but those endpoints are not all wired to `enforce_rate_limit()` yet.

## 9. Human-in-the-Loop Permission Gate

`backend/app/permissions/policy.py` controls action risk:

| Action | Default level |
| --- | --- |
| `list_emails` | `AUTO` |
| `get_thread` | `AUTO` |
| `apply_label` | `AUTO` |
| `create_draft` | `AUTO` |
| `create_reminder` | `AUTO` |
| `send_email` | `CONFIRM` |
| `create_event` | `CONFIRM` |
| `update_event` | `CONFIRM` |
| `create_cron_job` | `CONFIRM` |
| unknown action | `CONFIRM` |

User-specific overrides in `permission_rules` take precedence when present. Unknown actions default to `CONFIRM`, not `AUTO`.

For `CONFIRM` actions, the permission gate:

1. inserts a row into `approval_queue`,
2. issues a confirmation token with `issue_token()`,
3. stores the token on the approval row,
4. notifies the frontend via authenticated WebSocket,
5. interrupts LangGraph execution.

`approvals.py` can approve or reject the row. Approval resumes the LangGraph checkpoint for the original `conversation_id`. Chat messages can also be classified as approve/reject/edit/new while the graph is interrupted.

Cron mode is special: when `state["is_cron"]` is true, the permission gate inserts approval records and marks them approved automatically so unattended jobs do not block forever. This is current behavior and should be reviewed before allowing cron jobs to perform broad irreversible actions in production.

## 10. Approval Tokens

`backend/app/permissions/tokens.py` issues compact base64 tokens containing:

```json
{"id":"approval_uuid","a":"action","r":"resource","exp":1234567890}
```

The payload is signed with HMAC-SHA256 using `TOKEN_SIGNING_KEY`.

Verification checks:

- token structure,
- HMAC signature with timing-safe comparison,
- expiry,
- expected action,
- expected resource,
- approval row exists,
- approval row is not already `consumed`.

On successful verification, the approval row is marked `consumed`. This is the idempotency guard for irreversible tool execution.

## 11. LangGraph Agent Runtime

`backend/app/agents/graph.py` builds the compiled graph once and reuses it across requests. The checkpointer is `AsyncPostgresSaver`, so conversation execution can suspend and resume.

Graph shape:

```text
START
  -> supervisor
  -> reader / categorizer / summarizer / drafter / scheduler / reminder / cron_manager
  -> permission_gate
  -> END if approval is required
  -> executor if approved or auto-approved
  -> aggregator
  -> END
```

The frontend calls `POST /chat/{conversation_id}/message`. The route:

1. verifies the JWT,
2. rate-limits the user,
3. saves the user message,
4. loads recent conversation memory,
5. chooses the encrypted per-user Groq key or the request header fallback,
6. invokes or resumes LangGraph,
7. saves the assistant response.

## 12. Mail, Calendar, and SMTP

### 12.1 Gmail and Calendar Providers

`backend/app/providers/factory.py` decrypts the stored Google OAuth tokens with `OAUTH_ENCRYPTION_KEY`, builds Google credentials, and returns Gmail or Calendar providers.

`backend/app/providers/gmail.py` supports:

- searching messages,
- fetching threads,
- creating/updating/deleting drafts,
- sending Gmail drafts,
- applying labels,
- fetching message body and attachments.

The active provider is scoped with a `ContextVar` so graph/tool execution uses the correct user's provider.

### 12.2 Single-Draft Transactional SMTP Send

`backend/app/tools/transactional_send.py` is the current irreversible single-draft send path. It requires the draft to already be `approved`.

Current behavior:

1. Load the draft by ID.
2. Refuse to send unless `draft.status == "approved"`.
3. Resolve user-specific SMTP settings first; fall back to global SMTP settings.
4. Decrypt saved user SMTP password with `OAUTH_ENCRYPTION_KEY`.
5. Create a MIME `multipart/alternative` email with plain text and HTML bodies.
6. Open SMTP and call `starttls()` when `smtp_use_tls` is true.
7. Send the message.
8. Delete the Gmail draft if one exists.
9. Only after success, update local draft status to `sent` and insert an audit log row inside a transaction.
10. On SMTP failure, mark the draft `send_failed`.

This prevents the local database from reporting `sent` before SMTP success.

### 12.3 Bulk SMTP Campaigns

Bulk campaign files:

- `backend/app/routers/bulk_email.py`
- `backend/app/tools/bulk_send_service.py`

Implemented features:

- authenticated SMTP credential test,
- CSV upload and parsing,
- campaign start,
- SSE progress stream,
- stop signal,
- in-memory history,
- single test email,
- placeholder replacement using `$name`, `$email`, `$company`, `$role`, `$city`, and additional CSV columns,
- plain text fallback generated from HTML,
- SMTP reconnect on dropped connections,
- optional per-recipient delay.

TLS behavior:

- port `465` uses `smtplib.SMTP_SSL`,
- ports `25`, `587`, and `2525` attempt STARTTLS,
- unknown ports default to STARTTLS attempt.

Current limitation: campaign jobs and history live in the `_jobs` in-memory dictionary. They are not tied to durable database rows and will disappear on process restart.

## 13. WebSocket and Realtime Approvals

The backend exposes `/ws` in `backend/app/main.py`.

Security behavior:

- requires `?token=<jwt>`,
- rejects missing/invalid/expired tokens with close code `4001`,
- decodes `user_id` from the JWT,
- registers the socket under that user ID.

The frontend connects in `frontend/src/store/approvals.ts` and merges incoming approval messages into the Nanostores approval list.

## 14. Frontend Implementation

The frontend is a React 19 + Vite + Tailwind CSS app, with Nanostores for state. It runs as:

- web app via `npm run dev`,
- Electron desktop app via `npm run electron:dev`.

Key files:

- `frontend/src/lib/api.ts`: typed REST helpers and auth headers.
- `frontend/src/store/auth.ts`: JWT/user ID state and logout.
- `frontend/src/store/approvals.ts`: approval queue state and authenticated WebSocket.
- `frontend/src/components/views/*.tsx`: inbox, calendar, approvals, cron, and bulk email views.
- `frontend/electron/main.ts`: Electron `BrowserWindow` with `contextIsolation: true` and `nodeIntegration: false`.
- `frontend/electron/preload.ts`: minimal isolated bridge.

The Electron shell currently loads `http://localhost:5173/#/app` in development. Production packaging should point at the built frontend or a deployed HTTPS origin.

## 15. SSL/TLS and Transport Security

There are three separate transport-security surfaces:

1. Browser/frontend to backend API.
2. Backend to Google OAuth/Gmail/Calendar APIs.
3. Backend to SMTP providers.

Current implementation:

- Google OAuth, Gmail, and Calendar calls use Google's HTTPS endpoints.
- Single-draft SMTP can use STARTTLS through `SMTP_USE_TLS`.
- Bulk SMTP chooses SSL for port `465` and STARTTLS for common SMTP ports.
- FastAPI runs locally over HTTP by default.
- The backend does not configure certificates, HTTPS redirects, or HSTS itself.

Production requirement:

- terminate HTTPS at a reverse proxy or hosting platform,
- set `GOOGLE_REDIRECT_URI` to an HTTPS callback,
- set frontend `VITE_API_URL` to an HTTPS API origin,
- set `ALLOWED_ORIGINS` to exact HTTPS frontend origins,
- add HSTS at the proxy once HTTPS is stable.

## 16. Operational Notes and Known Gaps

- Convert startup `ALTER TABLE` compatibility changes into migrations before production.
- Add rate limiting to OAuth login/callback, approval approve/reject, and bulk send endpoints.
- Consider moving JWT storage from `localStorage` to HttpOnly Secure cookies for browser deployments.
- Add JWT revocation or refresh-token rotation if instant logout is required.
- Persist bulk campaign jobs/history in PostgreSQL if campaigns must survive restarts.
- Review cron auto-approval policy before enabling high-risk unattended workflows.
- Do not log decrypted secrets, OAuth tokens, SMTP passwords, Groq keys, JWTs, or confirmation tokens.

## 17. Verification

Useful checks:

```bash
cd backend
python app/test_verification.py
```

```bash
cd frontend
npm run build
```

Manual security checks:

- request a protected endpoint without `Authorization` and confirm `401`,
- request another user's conversation/approval/job and confirm `403`,
- start OAuth login and confirm Redis state is single-use,
- connect `/ws` without a token and confirm it closes,
- confirm `Access-Control-Allow-Origin` is one of `ALLOWED_ORIGINS`, never `*`,
- approve the same irreversible action twice and confirm the second execution is rejected by the consumed token state.

## 18. Detailed End-to-End Flow

This section explains how the active implementation is connected across files. The goal is to document the actual working system, not stale generated snippets. Code excerpts below are intentionally representative; the source files remain the canonical implementation.

### 18.1 Application Boot

Startup begins in `backend/app/main.py`.

```python
app = FastAPI(
    title="Mail Agent API",
    description="Backend API and LangGraph Multi-Agent execution server for Mail Agent.",
    version="1.0.0",
)
```

The app immediately installs two global request controls:

```python
app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Groq-Api-Key"],
)
```

The important security connection is:

```text
backend/app/config.py
  -> settings.allowed_origins
  -> backend/app/main.py allowed_origins list
  -> CORSMiddleware
```

This replaced the insecure broad-origin pattern. The backend now accepts browser calls only from origins listed in `ALLOWED_ORIGINS`.

During startup:

```python
@app.on_event("startup")
async def startup_event():
    await init_pool()
    await get_compiled_graph()
    start_cron_scheduler()
```

That connects three subsystems:

```text
init_pool()
  -> backend/app/db/session.py
  -> opens the asyncpg pool used by routers, agents, and tools

get_compiled_graph()
  -> backend/app/agents/graph.py
  -> opens LangGraph Postgres checkpointer
  -> compiles and caches the graph

start_cron_scheduler()
  -> backend/app/jobs/cron_scheduler.py
  -> starts background scheduled job scanning
```

Shutdown reverses this:

```python
@app.on_event("shutdown")
async def shutdown_event():
    await stop_cron_scheduler()
    await close_compiled_graph()
```

### 18.2 Router Mounting

The API routes are mounted in `backend/app/main.py`:

```python
app.include_router(chat.router)
app.include_router(approvals.router)
app.include_router(auth.router)
app.include_router(cron.router)
app.include_router(bulk_email.router)
```

This produces the main API surface:

| Router | Prefix | Responsibility |
| --- | --- | --- |
| `chat.py` | `/chat` | conversations, inbox/cache views, agent execution |
| `approvals.py` | `/approvals` | approval queue, approve/reject, graph resume |
| `auth.py` | `/auth` | Google OAuth, profile, SMTP settings, Groq key settings |
| `cron.py` | `/cron` | scheduled agent jobs and run history |
| `bulk_email.py` | `/api/bulk-email` | CSV parsing, SMTP tests, bulk campaign send/stream |

## 19. Security Fixes in Working Code

### 19.1 One Key, One Purpose

The hardened config is in `backend/app/config.py`:

```python
class Settings(BaseSettings):
    database_url: SecretStr
    redis_url: str = "redis://localhost:6379/0"
    anthropic_api_key: SecretStr
    groq_api_key: SecretStr = SecretStr("")
    google_client_id: str
    google_client_secret: SecretStr
    google_redirect_uri: str

    jwt_secret: SecretStr
    oauth_encryption_key: SecretStr
    token_signing_key: SecretStr
```

The connection is:

| Key | Used by | Purpose |
| --- | --- | --- |
| `jwt_secret` | `backend/app/auth/jwt_auth.py` | signs app login JWTs |
| `oauth_encryption_key` | `google_oauth.py`, `providers/factory.py`, `auth.py`, send services | encrypts/decrypts OAuth tokens, SMTP passwords, stored Groq keys |
| `token_signing_key` | `backend/app/permissions/tokens.py` | signs approval confirmation tokens |

This matters because compromising or rotating one cryptographic purpose should not automatically compromise every other security primitive.

### 19.2 JWT Auth Replaces Caller-Supplied `user_id`

The old vulnerable pattern was:

```text
request body/query includes user_id
backend trusts it
attacker can send another user's UUID
```

The current pattern is:

```text
frontend sends Authorization: Bearer <jwt>
  -> backend/app/auth/jwt_auth.py validates signature and expiry
  -> protected router receives current_user
  -> router uses current_user["user_id"]
```

Core code:

```python
security = HTTPBearer(auto_error=False)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "user_id": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.jwt_secret.get_secret_value(), algorithm=ALGORITHM)
```

Validation:

```python
async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    token = request.query_params.get("token")
    if not token and credentials:
        token = credentials.credentials
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    return _decode_token(token)
```

The query-token fallback exists for transports like `EventSource` and WebSocket URLs, where custom `Authorization` headers are not practical.

### 19.3 Protected Routers

Examples:

```python
@router.get("/conversations")
async def list_conversations(current_user: dict = Depends(get_current_user)):
    user_uuid = UUID(current_user["user_id"])
    rows = await db.fetch(
        "SELECT id::text as conversation_id, title, updated_at "
        "FROM conversations WHERE user_id = $1 ...",
        user_uuid,
    )
```

```python
@router.get("")
async def list_approvals(
    status: str = "pending",
    current_user: dict = Depends(get_current_user),
):
    user_uuid = UUID(current_user["user_id"])
    rows = await db.fetch(
        "SELECT ... FROM approval_queue WHERE user_id = $1 AND status = $2",
        user_uuid, status,
    )
```

```python
@router.get("")
async def list_cron_jobs(current_user: dict = Depends(get_current_user)):
    rows = await db.fetch(
        "SELECT * FROM cron_jobs WHERE user_id = $1 ORDER BY created_at DESC",
        uuid.UUID(current_user["user_id"]),
    )
```

The security pattern is consistent:

```text
decode JWT
  -> get authenticated user_id
  -> filter DB rows by user_id
  -> for specific resource mutation, verify row ownership before write
```

### 19.4 Ownership Checks

Approval mutation uses an explicit ownership check:

```python
approval_row = await db.fetchrow(
    "SELECT user_id, conversation_id::text, action_type, resource_id, payload, confirmation_token, status "
    "FROM approval_queue WHERE id = $1",
    approval_uuid,
)

if str(approval_row["user_id"]) != current_user["user_id"]:
    raise HTTPException(status_code=403, detail="Not your approval")
```

Cron mutation uses a reusable helper:

```python
async def _verify_job_ownership(job_id: str, user_id: str, db):
    job = await db.fetchrow("SELECT user_id FROM cron_jobs WHERE id = $1", uuid.UUID(job_id))
    if not job:
        raise HTTPException(status_code=404, detail="Cron job not found")
    if str(job["user_id"]) != user_id:
        raise HTTPException(status_code=403, detail="Not your cron job")
```

Conversation message/delete routes also check that the conversation belongs to the current user before returning or deleting messages.

## 20. Google OAuth in Detail

### 20.1 Login Start

Frontend builds the login URL in `frontend/src/lib/api.ts`:

```ts
export function getGoogleLoginUrl(): string {
  const frontendUrl = window.location.origin
  return `${API_BASE_URL}/auth/login?frontend_url=${encodeURIComponent(frontendUrl)}`
}
```

Backend receives it in `backend/app/routers/auth.py`:

```python
@router.get("/login")
async def login(frontend_url: str = "http://localhost:5173"):
    state = secrets.token_urlsafe(32)
    r = await _get_redis()
    await r.set(f"oauth_state:{state}", frontend_url, ex=600)
    await r.aclose()

    auth_url = build_auth_url(state)
    return RedirectResponse(auth_url)
```

The connection is:

```text
frontend current origin
  -> /auth/login?frontend_url=<origin>
  -> Redis oauth_state:<state> = frontend origin
  -> Google OAuth URL includes the same state
```

This closes the CSRF problem because the callback must present a state value that the backend generated and stored.

### 20.2 Google Authorization URL

`backend/app/auth/google_oauth.py` defines scopes and builds the OAuth flow:

```python
SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.labels",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "openid",
]
```

```python
def build_auth_url(state: str) -> str:
    flow = _build_flow()
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        state=state,
    )
    return auth_url
```

### 20.3 Callback and State Verification

```python
@router.get("/callback")
async def callback(code: str, state: str = ""):
    if not state:
        raise HTTPException(status_code=400, detail="Missing state parameter")

    r = await _get_redis()
    stored_frontend_url = await r.get(f"oauth_state:{state}")
    if stored_frontend_url is None:
        await r.aclose()
        raise HTTPException(status_code=400, detail="Invalid or expired state")

    await r.delete(f"oauth_state:{state}")
    await r.aclose()
```

State is single-use. If the same callback is replayed, Redis no longer has the key.

### 20.4 Identity Comes From Google, Not the Request

After token exchange:

```python
user_info = http_requests.get(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    headers={"Authorization": f"Bearer {creds.token}"},
    timeout=10,
).json()
email = user_info.get("email", "unknown@example.com")
display_name = user_info.get("name", email.split("@")[0].title())
```

Then:

```python
existing_user = await db.fetchrow("SELECT id FROM users WHERE email = $1", email)
if existing_user:
    target_user_id = existing_user["id"]
    await db.execute(
        "UPDATE users SET display_name = $1 WHERE id = $2",
        display_name, target_user_id,
    )
else:
    target_user_id = uuid.uuid4()
    await db.execute(
        "INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3)",
        target_user_id, email, display_name,
    )
```

The important fix:

```text
OAuth callback no longer accepts or trusts user_id from the caller.
Google account identity determines the local user.
```

### 20.5 OAuth Token Storage

Tokens are encrypted at rest:

```python
fernet = Fernet(settings.oauth_encryption_key.get_secret_value().encode())

access_enc = fernet.encrypt(creds.token.encode())
refresh_enc = fernet.encrypt(creds.refresh_token.encode()) if creds.refresh_token else b""
```

Stored in `oauth_credentials`:

```python
INSERT INTO oauth_credentials (
    user_id,
    provider,
    access_token_encrypted,
    refresh_token_encrypted,
    scopes,
    expires_at
) VALUES (...)
```

Later, provider factory decrypts them:

```python
decrypted_token = fernet.decrypt(row["access_token_encrypted"]).decode()
decrypted_refresh = fernet.decrypt(row["refresh_token_encrypted"]).decode()
```

Then builds Google credentials:

```python
creds = Credentials(
    token=decrypted_token,
    refresh_token=decrypted_refresh,
    client_id=settings.google_client_id,
    client_secret=settings.google_client_secret,
    token_uri="https://oauth2.googleapis.com/token",
)
```

## 21. Frontend Auth and API Connection

### 21.1 Token Storage

`frontend/src/store/auth.ts` stores the JWT and user ID:

```ts
export const $userId = atom<string>(getInitialUserId())
export const $authToken = atom<string>(localStorage.getItem('mailing_agent_auth_token') || '')
```

When the backend redirects after OAuth, frontend code reads the token from URL state and calls:

```ts
export function setAuthToken(token: string) {
  $authToken.set(token)
  localStorage.setItem('mailing_agent_auth_token', token)
  const payload = JSON.parse(atob(token.split('.')[1]))
  if (payload.user_id) {
    setUserId(payload.user_id)
  }
}
```

This is not encryption. JWT payloads are readable. The security property is signature validation on the backend, not secrecy on the client.

### 21.2 API Headers

`frontend/src/lib/api.ts` centralizes auth:

```ts
function authHeaders(extraHeaders: Record<string, string> = {}): HeadersInit {
  const token = getAuthToken()
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...extraHeaders,
  }
}
```

Every normal API call uses this:

```ts
export async function fetchConversations(): Promise<Conversation[]> {
  const response = await fetch(`${API_BASE_URL}/chat/conversations`, {
    headers: authHeaders()
  })
  ...
}
```

### 21.3 WebSocket Auth

`frontend/src/store/approvals.ts` builds:

```ts
const wsUrl = API_BASE_URL.replace(/^http/, 'ws') + `/ws?token=${encodeURIComponent(token)}`
ws = new WebSocket(wsUrl)
```

Backend validates in `main.py` before accepting:

```python
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query("")):
    if not token:
        await websocket.close(code=4001, reason="Missing authentication token")
        return

    try:
        user = verify_ws_token(token)
        user_id = user["user_id"]
    except ValueError as e:
        await websocket.close(code=4001, reason=str(e))
        return

    await manager.connect(websocket, user_id)
```

Connection:

```text
approval_queue insert
  -> notify_dashboard(user_id, payload)
  -> WebSocket manager sends only to sockets registered under that user_id
  -> frontend merges the incoming approval into $approvals
```

## 22. Chat and Agent Execution Flow

### 22.1 Frontend Sends a Message

`frontend/src/lib/api.ts`:

```ts
export async function sendMessage(conversationId: string, instruction: string) {
  const groqKey = localStorage.getItem('mailing_agent_groq_key') || ''

  const response = await fetch(`${API_BASE_URL}/chat/${conversationId}/message`, {
    method: 'POST',
    headers: authHeaders({ 'X-Groq-Api-Key': groqKey }),
    body: JSON.stringify({ instruction }),
  })
  return response.json()
}
```

### 22.2 Backend Validates and Rate Limits

`backend/app/routers/chat.py`:

```python
class MessageInput(BaseModel):
    instruction: str = Field(min_length=1, max_length=4000)

    @field_validator("instruction")
    @classmethod
    def no_null_bytes(cls, v: str) -> str:
        if "\x00" in v:
            raise ValueError("Invalid characters in instruction")
        return v.strip()
```

Route:

```python
@router.post("/{conversation_id}/message")
async def send_message(
    conversation_id: str,
    payload: MessageInput,
    current_user: dict = Depends(get_current_user),
    x_groq_api_key: Optional[str] = Header(None),
):
    user_id = current_user["user_id"]
    await enforce_rate_limit(f"rl:chat:{user_id}", limit=20, window_seconds=3600)
```

### 22.3 Conversation Memory

The route saves the user turn:

```python
await save_message(conversation_id, "user", instruction)
```

Then loads history:

```python
history = await load_recent_messages(conversation_id)
```

That means the graph receives enough memory to resolve references like "reply to that email" or "change the draft".

### 22.4 LLM Key Selection

The chat route checks for a stored per-user Groq key first:

```python
user_row = await db.fetchrow("SELECT groq_api_key FROM users WHERE id = $1", user_uuid)
if user_row and user_row["groq_api_key"]:
    fernet = Fernet(settings.oauth_encryption_key.get_secret_value().encode())
    db_groq_key = fernet.decrypt(user_row["groq_api_key"].encode()).decode()

api_key_to_use = db_groq_key or x_groq_api_key or ""
active_groq_key.set(api_key_to_use)
```

Precedence:

```text
encrypted user Groq key in database
  -> X-Groq-Api-Key request header fallback
  -> empty/global environment fallback inside adapter
```

### 22.5 Graph Invocation

For a normal new message:

```python
result = await graph.ainvoke(
    {
        "user_id": user_id,
        "conversation_id": conversation_id,
        "instruction": instruction,
        "messages": history,
        "plan": [],
        "active_tasks": ResetList(),
        "completed_tasks": ResetList(),
        "pending_approvals": ResetList(),
        "email_context": ResetList(),
        "draft_results": ResetList(),
        "calendar_results": ResetList(),
        "summaries": ResetList(),
        "errors": ResetList(),
        "groq_api_key": api_key_to_use,
    },
    config={"configurable": {"thread_id": conversation_id}},
)
```

The `thread_id` connects FastAPI conversations to LangGraph checkpoints. If the graph interrupts for approval, the same `conversation_id` lets it resume later.

## 23. LangGraph Internals

### 23.1 Graph Definition

`backend/app/agents/graph.py` builds:

```python
WORKER_NODES = ["reader", "categorizer", "summarizer", "drafter", "scheduler", "reminder", "cron_manager"]

graph.add_edge(START, "supervisor")
graph.add_conditional_edges("supervisor", route_to_workers, WORKER_NODES)
```

The supervisor decides which workers to run. Workers converge at the permission gate:

```python
for worker in non_reader_workers:
    graph.add_edge(worker, "permission_gate")
```

Then:

```python
graph.add_conditional_edges(
    "permission_gate",
    needs_human_approval,
    {"approve_required": END, "auto_approved": "executor"}
)

graph.add_edge("executor", "aggregator")
graph.add_edge("aggregator", END)
```

### 23.2 State and Reset Lists

The graph passes a `MailAgentState` across nodes. Several fields are list-like outputs from workers:

```text
active_tasks
completed_tasks
pending_approvals
email_context
draft_results
calendar_results
summaries
errors
```

The route initializes those fields with `ResetList()` so a new user turn starts with clean per-run collections instead of accidentally carrying prior graph state.

### 23.3 Worker Responsibilities

| Worker | File | Produces |
| --- | --- | --- |
| supervisor | `agents/supervisor.py` | plan of worker tasks |
| reader | `agents/reader.py` | email search/thread context |
| categorizer | `agents/categorizer.py` | categories and labels |
| summarizer | `agents/summarizer.py` | thread/email summaries |
| drafter | `agents/drafter.py` | Gmail drafts and `send_email` approval actions |
| scheduler | `agents/scheduler.py` | calendar event proposals and approval actions |
| reminder | `agents/reminder.py` | follow-up reminders |
| cron_manager | `agents/cron_agent.py` | scheduled job creation proposals |
| permission_gate | `permissions/policy.py` | approval rows/tokens or auto-approval |
| executor | `agents/executor.py` | actual tool calls |
| aggregator | `agents/aggregator.py` | final assistant response |

## 24. Permission and Approval Flow in Detail

### 24.1 Risk Classification

`backend/app/permissions/policy.py`:

```python
DEFAULT_LEVELS = {
    "list_emails": "AUTO",
    "get_thread": "AUTO",
    "apply_label": "AUTO",
    "create_draft": "AUTO",
    "create_reminder": "AUTO",
    "send_email": "CONFIRM",
    "create_event": "CONFIRM",
    "update_event": "CONFIRM",
    "create_cron_job": "CONFIRM",
}
```

User overrides:

```python
rule = await db.fetchrow(
    "SELECT level, condition FROM permission_rules WHERE user_id = $1 AND action_type = $2",
    user_uuid, action_type
)
if rule:
    return rule["level"]
return DEFAULT_LEVELS.get(action_type, "CONFIRM")
```

Unknown actions are not auto-approved. They default to `CONFIRM`.

### 24.2 Creating Approval Rows

For a normal human approval:

```python
row = await db.fetchrow(
    "INSERT INTO approval_queue (user_id, conversation_id, action_type, resource_id, payload, agent_reasoning, expires_at) "
    "VALUES ($1, $2, $3, $4, $5::jsonb, $6, now() + interval '15 minutes') RETURNING id",
    uuid.UUID(str(state["user_id"])),
    state.get("conversation_id"),
    action["type"],
    action["resource"],
    json.dumps(action.get("payload", {})),
    action.get("reasoning", "")
)
approval_id = row["id"]
token = issue_token(approval_id, action["type"], action["resource"])
await db.execute(
    "UPDATE approval_queue SET confirmation_token = $1 WHERE id = $2",
    token, approval_id
)
```

Then:

```python
await notify_dashboard(state["user_id"], {"approval_id": str(approval_id), "action": action})
resume_data = interrupt({"pending_confirmation": True, "actions": state.get("pending_approvals", [])})
```

This is the central human-in-the-loop connection:

```text
agent proposes risky action
  -> permission gate inserts approval_queue row
  -> HMAC confirmation token generated
  -> WebSocket notifies frontend
  -> LangGraph interrupts and saves checkpoint
  -> user approves/rejects later
  -> approvals router resumes checkpoint
```

### 24.3 Approval Token Format

`backend/app/permissions/tokens.py`:

```python
payload = json.dumps({
    "id": str(approval_id),
    "a": action,
    "r": resource,
    "exp": expiry,
}, separators=(",", ":"))
sig = hmac.new(
    settings.token_signing_key.get_secret_value().encode(),
    payload.encode(),
    hashlib.sha256,
).hexdigest()
return base64.urlsafe_b64encode(f"{payload}|{sig}".encode()).decode()
```

Verification:

```python
if not hmac.compare_digest(sig, expected_sig):
    raise PermissionError("Invalid token signature")

if payload["exp"] < time.time():
    raise PermissionError("Token expired")
if payload["a"] != action or payload["r"] != resource:
    raise PermissionError("Token scope mismatch")
```

Database idempotency:

```python
row = await db.fetchrow(
    "SELECT status FROM approval_queue WHERE id = $1", approval_uuid,
)
if row is None or row["status"] == "consumed":
    raise PermissionError("Token already used or unknown")

await db.execute(
    "UPDATE approval_queue SET status = 'consumed', resolved_at = now() "
    "WHERE id = $1 AND status != 'consumed'",
    approval_uuid,
)
```

This prevents replaying the same approval token to execute the same irreversible action twice.

### 24.4 Approval from the UI

Frontend:

```ts
export async function approveAction(approvalId: string, editedPayload?: any) {
  const response = await fetch(`${API_BASE_URL}/approvals/${approvalId}/approve`, {
    method: 'POST',
    headers: authHeaders(),
    body: editedPayload ? JSON.stringify(editedPayload) : undefined,
  })
  return response.json()
}
```

Backend:

```python
@router.post("/{approval_id}/approve")
async def approve(
    approval_id: str,
    edited_payload: Optional[Dict[str, Any]] = None,
    current_user: dict = Depends(get_current_user),
):
    ...
    if str(approval_row["user_id"]) != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Not your approval")
```

It updates the approval and resumes LangGraph:

```python
graph = await get_compiled_graph()
config = {"configurable": {"thread_id": thread_id}}
result = await graph.ainvoke(Command(resume=resume_payload), config=config)
```

The connection back to the original chat is `conversation_id`, stored on the approval row when it was created.

## 25. Tools and Irreversible Actions

### 25.1 Tool Risk Categories

`backend/app/tools/mail_tools.py` splits tools by side effect:

```python
class SideEffect(str, Enum):
    READ_ONLY = "read_only"
    REVERSIBLE = "reversible"
    IRREVERSIBLE = "irreversible"
```

Examples:

| Tool | Risk |
| --- | --- |
| `list_emails` | read-only |
| `get_thread` | read-only |
| `get_attachment` | read-only |
| `apply_label` | reversible |
| `create_draft` | reversible |
| `update_draft` | reversible |
| `create_reminder` | reversible |
| `send_email` | irreversible and token-gated |
| `create_event` | irreversible and token-gated |
| `update_event` | irreversible and token-gated |
| `cancel_event` | irreversible and token-gated |

### 25.2 Token-Gated Send

```python
@tool("send_email", args_schema=SendEmailInput)
def send_email(draft_id: str, confirmation_token: str) -> Dict[str, Any]:
    from app.permissions.tokens import verify_token
    from app.tools.transactional_send import send_draft_transactionally

    approval_id = verify_token(confirmation_token, action="send_email", resource=draft_id)
    return send_draft_transactionally(draft_id, approval_id=approval_id)
```

The executor cannot send unless it has a valid token scoped to the exact draft ID.

### 25.3 Transactional SMTP Send

`backend/app/tools/transactional_send.py` is used after approval.

It first verifies durable intent:

```python
draft = db.execute("SELECT * FROM drafts WHERE id = %s", (draft_uuid,)).fetchone()
if not draft:
    raise ValueError(f"Draft {draft_id} not found in database")
if draft.status != "approved":
    raise ValueError(f"Draft {draft_id} is not in an approved state")
```

It resolves SMTP settings:

```python
user_row = db.execute(
    "SELECT smtp_host, smtp_port, smtp_username, smtp_password, smtp_use_tls FROM users WHERE id = %s",
    (draft.user_id,)
).fetchone()
```

It decrypts saved SMTP password:

```python
fernet = Fernet(settings.oauth_encryption_key.get_secret_value().encode())
smtp_password = fernet.decrypt(smtp_password_enc.encode()).decode()
```

It sends with TLS if configured:

```python
with smtplib.SMTP(smtp_host, smtp_port) as server:
    if smtp_use_tls:
        server.starttls()
    if smtp_username and smtp_password:
        server.login(smtp_username, smtp_password)
    server.send_message(msg)
```

Only after the provider send succeeds:

```python
with db.transaction():
    db.execute("UPDATE drafts SET status = 'sent' WHERE id = %s", (draft_uuid,))
    db.execute(
        "INSERT INTO audit_log (user_id, agent_name, tool_name, input_params, output) "
        "VALUES (%s, 'sender', 'send_email', %s, %s)",
        (draft.user_id, json.dumps({"draft_id": draft_id}), json.dumps({"message_id": message_id}))
    )
```

Failure path:

```python
db.execute(
    "UPDATE drafts SET status = 'send_failed' WHERE id = %s", (draft_uuid,)
)
raise
```

This prevents false "sent" states.

## 26. Database Layer in Detail

### 26.1 Async Pool

`backend/app/db/session.py`:

```python
async def get_pool():
    global _pool, _main_loop
    if _pool is None:
        url = settings.database_url
        if url.startswith("postgresql+asyncpg://"):
            url = url.replace("postgresql+asyncpg://", "postgresql://")
        _pool = await asyncpg.create_pool(url)
```

`get_db()` returns a wrapper:

```python
class AsyncDbWrapper:
    async def fetch(self, query, *args):
        async with self.pool.acquire() as conn:
            return await conn.fetch(query, *args)

    async def fetchrow(self, query, *args):
        async with self.pool.acquire() as conn:
            return await conn.fetchrow(query, *args)

    async def execute(self, query, *args):
        async with self.pool.acquire() as conn:
            return await conn.execute(query, *args)
```

Routers and async agents use this wrapper.

### 26.2 Sync Bridge

Some LangChain tools and SMTP send paths are synchronous. They use:

```python
def get_db_sync():
    if _pool is None:
        raise RuntimeError("Database pool not initialized. Run init_db first.")
    return SyncDatabaseWrapper(_pool)
```

The sync wrapper converts `%s` placeholders to asyncpg placeholders:

```python
query_pg = query
count = 1
while "%s" in query_pg:
    query_pg = query_pg.replace("%s", f"${count}", 1)
    count += 1
```

This lets sync code call:

```python
db.execute("SELECT * FROM drafts WHERE id = %s", (draft_uuid,))
```

while asyncpg receives:

```sql
SELECT * FROM drafts WHERE id = $1
```

The sync wrapper also provides transaction support for the final draft status plus audit-log write.

## 27. Provider Layer in Detail

### 27.1 Provider Factory

Provider factory loads OAuth credentials for one user:

```python
row = await db.fetchrow(
    "SELECT access_token_encrypted, refresh_token_encrypted FROM oauth_credentials "
    "WHERE user_id = $1 AND provider = 'google'", user_id
)
```

Then returns:

```python
return GmailProvider(creds)
```

or:

```python
return GoogleCalendarProvider(creds)
```

### 27.2 Gmail Provider

Gmail provider wraps Google APIs:

```python
class GmailProvider(MailProvider):
    def __init__(self, credentials):
        self.service = build("gmail", "v1", credentials=credentials)
```

Search:

```python
def list_messages(self, query: str, max_results: int = 20) -> List[Message]:
    result = self.service.users().messages().list(
        userId="me", q=query, maxResults=max_results
    ).execute()
```

Draft creation:

```python
def create_draft(self, thread_id: str, html_body: str, subject: Optional[str], to: Optional[str] = None) -> Draft:
    mime = MIMEText(html_body, "html")
    ...
    result = self.service.users().drafts().create(
        userId="me", body={"message": {"raw": raw, "threadId": thread_id}}
    ).execute()
```

Message body extraction strips HTML scripts/styles and invisible characters before returning clean text to the UI and agent context.

### 27.3 ContextVar Provider Binding

`backend/app/providers/gmail.py` defines:

```python
active_mail_provider = contextvars.ContextVar("active_mail_provider")

class MailProviderProxy:
    def __getattr__(self, name):
        provider = active_mail_provider.get()
        return getattr(provider, name)

gmail_client = MailProviderProxy()
```

This lets tools import `gmail_client` statically, while the actual Gmail client is resolved per graph execution/user context.

## 28. Bulk Emailer Details

### 28.1 API Flow

Frontend bulk flow calls these endpoints:

```text
POST /api/bulk-email/smtp-test
POST /api/bulk-email/upload-csv
POST /api/bulk-email/send
GET  /api/bulk-email/stream/{job_id}?token=<jwt>
POST /api/bulk-email/stop/{job_id}
GET  /api/bulk-email/history
POST /api/bulk-email/test-email
```

Every endpoint requires:

```python
current_user: dict = Depends(get_current_user)
```

SSE stream uses `?token=<jwt>` because browser `EventSource` cannot attach the bearer header.

### 28.2 CSV Upload

```python
if not file.filename or not file.filename.lower().endswith(".csv"):
    raise HTTPException(status_code=400, detail="Only CSV files are accepted.")

raw = await file.read()
try:
    text = raw.decode("utf-8-sig")
except UnicodeDecodeError:
    text = raw.decode("latin-1")

reader = csv.DictReader(io.StringIO(text))
```

Rows are cleaned before returning to the frontend.

### 28.3 In-Memory Job Tracker

Current jobs live here:

```python
_jobs: Dict[str, Dict] = {}
```

When starting:

```python
job_id = str(uuid.uuid4())
stop_event = asyncio.Event()

_jobs[job_id] = {
    "stop_event": stop_event,
    "started_at": datetime.now(timezone.utc).isoformat(),
    "campaign_name": request.campaign_name,
    "total": len(request.contacts),
    "sent": 0,
    "failed": 0,
    "stopped": False,
    "done": False,
    "request": request,
}
```

That is why the guide calls this out as non-durable. A process restart loses this state.

### 28.4 Bulk SMTP TLS

`backend/app/tools/bulk_send_service.py` maps port to transport mode:

```python
_PORT_SECURITY: Dict[int, str] = {
    25: "starttls",
    465: "ssl",
    587: "starttls",
    2525: "starttls",
}
```

Connection:

```python
if mode == "ssl":
    conn = smtplib.SMTP_SSL(cfg.host, cfg.port, timeout=timeout)
else:
    conn = smtplib.SMTP(cfg.host, cfg.port, timeout=timeout)
    conn.ehlo()
    try:
        conn.starttls()
        conn.ehlo()
    except smtplib.SMTPNotSupportedError:
        logger.info("STARTTLS not supported on port %d", cfg.port)
conn.login(cfg.email, password or "")
```

The bulk sender builds multipart messages with both text and HTML parts and supports reply threading headers when prior message IDs are available.

## 29. SSL/TLS Deployment Detail

The backend code handles outbound provider TLS but does not terminate inbound HTTPS.

Current local dev:

```text
frontend: http://localhost:5173
backend:  http://127.0.0.1:8000
oauth callback: http://localhost:8000/auth/callback
```

Production target:

```text
frontend: https://app.your-domain.com
backend:  https://api.your-domain.com
oauth callback: https://api.your-domain.com/auth/callback
```

Required production wiring:

```text
reverse proxy / platform TLS
  -> HTTPS certificate
  -> redirects HTTP to HTTPS
  -> HSTS header
  -> forwards to FastAPI app
```

Environment:

```text
GOOGLE_REDIRECT_URI=https://api.your-domain.com/auth/callback
ALLOWED_ORIGINS=https://app.your-domain.com
VITE_API_URL=https://api.your-domain.com
```

Why this is documented this way:

- Google API calls already use HTTPS.
- SMTP uses STARTTLS/SSL depending on settings and port.
- FastAPI/uvicorn is normally deployed behind a TLS-terminating proxy, not with app-managed certificates.

## 30. How the Main User Workflows Connect

### 30.1 First Login and Initial Sync

```text
Landing page
  -> getGoogleLoginUrl()
  -> GET /auth/login
  -> Redis state created
  -> Google consent
  -> GET /auth/callback
  -> state verified and deleted
  -> Google identity fetched
  -> user upserted
  -> OAuth tokens encrypted
  -> app JWT issued
  -> frontend stores JWT
  -> background initial email sync starts
```

The initial sync is launched in `google_oauth.py`:

```python
asyncio.create_task(background_sync())
```

It creates an `Initial Sync` conversation and invokes the graph with:

```python
"instruction": "Sync latest unread emails newer_than:7d",
"is_cron": True,
```

### 30.2 User Asks to Draft and Send an Email

```text
chat-panel
  -> POST /chat/{conversation_id}/message
  -> JWT verified
  -> instruction stored in messages
  -> LangGraph supervisor plans drafter
  -> drafter creates Gmail draft + local draft row
  -> drafter queues send_email approval action
  -> permission gate inserts approval_queue row and token
  -> WebSocket notifies Approvals tab
  -> graph interrupts
  -> user approves
  -> POST /approvals/{id}/approve
  -> ownership checked
  -> graph resumes
  -> executor calls send_email tool
  -> token verified and consumed
  -> transactional SMTP send
  -> draft marked sent and audit row inserted
```

### 30.3 User Creates a Cron Job

```text
chat prompt or Cron view
  -> schedule validated in cron.py
  -> cron_jobs row inserted with next_run_at
  -> scheduler scans due jobs
  -> run_cron_job invokes LangGraph with is_cron=True
  -> permission gate auto-approves inside cron mode
  -> cron_runs records output/failure
```

The security nuance is that cron mode intentionally avoids human interrupts. This keeps scheduled jobs from hanging, but high-risk cron capabilities should be governed carefully.

### 30.4 User Runs a Bulk Campaign

```text
Bulk Emailer view
  -> upload CSV
  -> parse contacts
  -> test SMTP
  -> POST /api/bulk-email/send
  -> in-memory job created
  -> EventSource /stream/{job_id}?token=<jwt>
  -> backend sends one recipient at a time in executor thread
  -> progress events update UI
  -> optional stop endpoint sets stop_event
```

This workflow is separate from the LangGraph approval gate. It is authenticated, but the current implementation does not persist campaign state or require human approval per campaign.

## 31. What Was Removed and Why

The previous `IMPLEMENTATION.md` contained long code blocks from an earlier generated build plan. Some of them were useful as design notes, but several were now wrong after the security changes:

- It said nothing was built yet.
- It showed old config names like `token_encryption_key` instead of the current separated keys.
- It described auth flows that trusted request-provided `user_id`.
- It referenced files that do not exist in the current repo, such as `sender.py` and `alembic/` migration structure.
- It described future bulk-campaign database tables that are not implemented; the current bulk sender is in-memory.

The correct guide should not duplicate every source file line-for-line, because duplicated code in docs goes stale quickly. The right balance is:

- keep actual implementation in source files,
- document the real file-to-file connections,
- include representative snippets for security-critical and architecture-critical flows,
- explicitly call out current limitations.

That is what this updated version now does.
