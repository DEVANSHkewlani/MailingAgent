"""
Google OAuth — handles the OAuth 2.0 Authorization Code Flow.

Security hardening:
  - User identity is derived from Google's userinfo API, never from the request
  - OAuth tokens are encrypted at rest with a dedicated Fernet key (OAUTH_ENCRYPTION_KEY)
  - State parameter + Redis used for CSRF protection (handled in the router)
"""

import requests as http_requests
from google_auth_oauthlib.flow import Flow
from cryptography.fernet import Fernet
from app.config import settings

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

fernet = Fernet(settings.oauth_encryption_key.get_secret_value().encode())


def _build_flow() -> Flow:
    """Build a Google OAuth Flow instance from settings."""
    return Flow.from_client_config(
        {"web": {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret.get_secret_value(),
            "redirect_uris": [settings.google_redirect_uri],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }},
        scopes=SCOPES,
        redirect_uri=settings.google_redirect_uri,
    )


def build_auth_url(state: str) -> str:
    """Build the Google OAuth consent screen URL with CSRF state parameter."""
    flow = _build_flow()
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        state=state,
    )
    return auth_url


async def handle_callback(code: str) -> tuple[str, str]:
    """Exchange the OAuth code for tokens and derive user identity from Google.
    
    Returns (user_id, email) — user_id is from the database, NOT from the request.
    """
    from app.db.session import get_db
    from app.db.init_db import seed_default_rules

    flow = _build_flow()
    flow.fetch_token(code=code)
    creds = flow.credentials

    # ──────────────────────────────────────────────────────────────────────────
    # CRITICAL: Derive user identity from Google's userinfo, never from caller
    # ──────────────────────────────────────────────────────────────────────────
    email = "unknown@example.com"
    display_name = "New Mail Agent User"
    try:
        user_info = http_requests.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {creds.token}"},
            timeout=10,
        ).json()
        email = user_info.get("email", "unknown@example.com")
        display_name = user_info.get("name", email.split("@")[0].title())
    except Exception as e:
        # Fallback: try Gmail profile API
        try:
            from googleapiclient.discovery import build
            gmail_service = build("gmail", "v1", credentials=creds)
            profile = gmail_service.users().getProfile(userId="me").execute()
            email = profile.get("emailAddress", "unknown@example.com")
            display_name = email.split("@")[0].title()
        except Exception as e2:
            print(f"Google OAuth: Failed to fetch user identity: {e}, {e2}")

    db = get_db()

    # Upsert user by email — this is the single source of truth for user_id
    existing_user = await db.fetchrow("SELECT id FROM users WHERE email = $1", email)
    if existing_user:
        target_user_id = existing_user["id"]
        await db.execute(
            "UPDATE users SET display_name = $1 WHERE id = $2",
            display_name, target_user_id,
        )
        print(f"Google OAuth: Returning existing user {target_user_id} for email {email}")
    else:
        import uuid
        target_user_id = uuid.uuid4()
        await db.execute(
            "INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3)",
            target_user_id, email, display_name,
        )
        print(f"Google OAuth: Registered new user {email} (ID: {target_user_id})")
        await seed_default_rules(str(target_user_id), db)

    # ──────────────────────────────────────────────────────────────────────────
    # Store encrypted OAuth tokens
    # ──────────────────────────────────────────────────────────────────────────
    access_enc = fernet.encrypt(creds.token.encode())
    refresh_enc = fernet.encrypt(creds.refresh_token.encode()) if creds.refresh_token else b""

    existing_cred = await db.fetchrow(
        "SELECT id FROM oauth_credentials WHERE user_id = $1 AND provider = 'google'",
        target_user_id,
    )

    if existing_cred:
        if refresh_enc:
            await db.execute(
                "UPDATE oauth_credentials SET access_token_encrypted = $1, refresh_token_encrypted = $2, "
                "scopes = $3, expires_at = $4, created_at = now() WHERE id = $5",
                access_enc, refresh_enc, SCOPES, creds.expiry, existing_cred["id"],
            )
        else:
            await db.execute(
                "UPDATE oauth_credentials SET access_token_encrypted = $1, "
                "scopes = $2, expires_at = $3, created_at = now() WHERE id = $4",
                access_enc, SCOPES, creds.expiry, existing_cred["id"],
            )
        print(f"Updated Google OAuth credentials for user {target_user_id}")
    else:
        await db.execute(
            "INSERT INTO oauth_credentials (user_id, provider, access_token_encrypted, "
            "refresh_token_encrypted, scopes, expires_at) VALUES ($1, 'google', $2, $3, $4, $5)",
            target_user_id, access_enc, refresh_enc, SCOPES, creds.expiry,
        )
        print(f"Saved new Google OAuth credentials for user {target_user_id}")

    # ──────────────────────────────────────────────────────────────────────────
    # Trigger initial email sync in background
    # ──────────────────────────────────────────────────────────────────────────
    try:
        from app.agents.state import ResetList
        from app.agents.graph import get_compiled_graph
        import asyncio
        import uuid as py_uuid

        async def background_sync():
            try:
                print(f"Google OAuth Auto-Sync: Starting initial email sync for {email}...")
                graph = await get_compiled_graph()
                conv_id = py_uuid.uuid4()
                sync_db = get_db()
                await sync_db.execute(
                    "INSERT INTO conversations (id, user_id, title) VALUES ($1, $2, 'Initial Sync')",
                    conv_id, target_user_id,
                )
                await graph.ainvoke(
                    {
                        "user_id": str(target_user_id),
                        "conversation_id": str(conv_id),
                        "instruction": "Sync latest unread emails newer_than:7d",
                        "messages": [],
                        "plan": [],
                        "active_tasks": ResetList(),
                        "completed_tasks": ResetList(),
                        "pending_approvals": ResetList(),
                        "email_context": ResetList(),
                        "draft_results": ResetList(),
                        "calendar_results": ResetList(),
                        "summaries": ResetList(),
                        "errors": ResetList(),
                        "is_cron": True,
                    },
                    config={"configurable": {"thread_id": str(conv_id)}},
                )
                print(f"Google OAuth Auto-Sync: Completed for {email}.")
            except Exception as sync_err:
                print(f"Google OAuth Auto-Sync: Error: {sync_err}")

        asyncio.create_task(background_sync())
    except Exception as launch_err:
        print(f"Google OAuth Auto-Sync: Failed to trigger: {launch_err}")

    return str(target_user_id), email
