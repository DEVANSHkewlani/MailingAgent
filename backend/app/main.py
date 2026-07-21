"""
Main — FastAPI application entry point.

Security:
  - CORS restricted to explicit allowed origins (from settings)
  - Security headers middleware (X-Frame-Options, X-Content-Type-Options, etc.)
  - WebSocket requires JWT authentication via query parameter
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.config import settings
from app.db.session import init_pool
from app.agents.graph import get_compiled_graph, close_compiled_graph
from app.notifications.websocket import manager
from app.jobs.cron_scheduler import start_cron_scheduler, stop_cron_scheduler
from app.routers import chat, approvals, auth, cron, bulk_email
from app.auth.jwt_auth import verify_ws_token

app = FastAPI(
    title="Mail Agent API",
    description="Backend API and LangGraph Multi-Agent execution server for Mail Agent.",
    version="1.0.0",
)


# ─── Security Headers Middleware ──────────────────────────────────────────────

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response


app.add_middleware(SecurityHeadersMiddleware)


# ─── CORS — explicit allowed origins, never wildcard ──────────────────────────

allowed_origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Groq-Api-Key"],
)


# ─── Lifecycle Events ────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup_event():
    print("Starting FastAPI Application...")
    await init_pool()

    # Ensure users table has user-specific SMTP settings columns
    from app.db.session import get_db
    db = get_db()
    try:
        await db.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS smtp_host TEXT")
        await db.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS smtp_port INT")
        await db.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS smtp_username TEXT")
        await db.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS smtp_password TEXT")
        await db.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS smtp_use_tls BOOLEAN DEFAULT true")
        await db.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS groq_api_key TEXT")
        print("FastAPI Startup: Ensured users table has SMTP and Groq settings columns.")
    except Exception as e:
        print(f"FastAPI Startup Warning: Failed to alter users table: {e}")

    await get_compiled_graph()
    start_cron_scheduler()
    print("Database pool and checkpointer savers initialized successfully.")


@app.on_event("shutdown")
async def shutdown_event():
    print("Stopping FastAPI Application...")
    await stop_cron_scheduler()
    await close_compiled_graph()
    print("Database pool and connection savers closed.")


# ─── Mount Routers ───────────────────────────────────────────────────────────

app.include_router(chat.router)
app.include_router(approvals.router)
app.include_router(auth.router)
app.include_router(cron.router)
app.include_router(bulk_email.router)


# ─── Authenticated WebSocket ─────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query("")):
    """
    Active websocket channel for server-sent dashboard notification events.
    Requires a valid JWT token as a query parameter.
    """
    # Verify JWT before accepting the connection
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
    try:
        while True:
            text = await websocket.receive_text()
            print(f"FastAPI WebSockets: Received input from client {user_id}: {text}")
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
    except Exception as e:
        print(f"FastAPI WebSockets: Exception on client connection {user_id}: {e}")
        manager.disconnect(websocket, user_id)
