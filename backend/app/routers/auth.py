"""
Auth Router — handles Google OAuth login/callback and user settings endpoints.

Security:
  - /auth/login: Generates CSRF state token stored in Redis
  - /auth/callback: Verifies state, derives user from Google, issues JWT
  - All settings endpoints require Depends(get_current_user)
"""

import secrets
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from typing import Optional

from app.auth.jwt_auth import get_current_user, create_access_token
from app.auth.google_oauth import build_auth_url, handle_callback

router = APIRouter(prefix="/auth", tags=["auth"])


# ─── Redis helpers for OAuth state ────────────────────────────────────────────

async def _get_redis():
    import redis.asyncio as aioredis
    from app.config import settings
    return aioredis.from_url(settings.redis_url)


# ─── OAuth Login ──────────────────────────────────────────────────────────────

@router.get("/login")
async def login(frontend_url: str = "http://localhost:5173"):
    """
    Redirect the user to Google's OAuth consent screen.
    Generates a CSRF state token stored in Redis.
    """
    try:
        state = secrets.token_urlsafe(32)
        r = await _get_redis()
        # Store state → frontend_url mapping with 10-minute TTL
        await r.set(f"oauth_state:{state}", frontend_url, ex=600)
        await r.aclose()

        auth_url = build_auth_url(state)
        return RedirectResponse(auth_url)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OAuth URL generation failed: {str(e)}")


# ─── OAuth Callback ──────────────────────────────────────────────────────────

@router.get("/callback")
async def callback(code: str, state: str = ""):
    """
    Receive Google OAuth callback.
    Verifies CSRF state, exchanges code, derives user, issues JWT.
    """
    # 1. Verify CSRF state
    if not state:
        raise HTTPException(status_code=400, detail="Missing state parameter — CSRF check failed")

    r = await _get_redis()
    stored_frontend_url = await r.get(f"oauth_state:{state}")
    if stored_frontend_url is None:
        await r.aclose()
        raise HTTPException(status_code=400, detail="Invalid or expired state — CSRF check failed")
    
    # Delete state immediately — single-use
    await r.delete(f"oauth_state:{state}")
    await r.aclose()

    frontend_url = stored_frontend_url.decode() if isinstance(stored_frontend_url, bytes) else stored_frontend_url

    try:
        # 2. Exchange code and get user identity from Google (not from request!)
        user_id, email = await handle_callback(code)

        # 3. Issue JWT
        token = create_access_token(user_id, email)

        # 4. Redirect to frontend with token
        redirect_target = frontend_url.rstrip("/") + "/#/app" if "/#/app" not in frontend_url else frontend_url
        connector = "?" if "?" not in redirect_target else "&"
        redirect_target = f"{redirect_target}{connector}token={token}&user_id={user_id}"
        return RedirectResponse(url=redirect_target)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OAuth callback processing failed: {str(e)}")


# ─── Auth Status (public — needed before login) ──────────────────────────────

@router.get("/status")
async def auth_status(user_id: str):
    """Check if a user has an active Google OAuth connection. Public endpoint."""
    from app.db.session import get_db
    from uuid import UUID
    db = get_db()
    try:
        user_uuid = UUID(user_id)
    except ValueError:
        return {"connected": False}
    row = await db.fetchrow(
        "SELECT id FROM oauth_credentials WHERE user_id = $1 AND provider = 'google'",
        user_uuid,
    )
    return {"connected": row is not None}


# ─── Protected Settings Endpoints ─────────────────────────────────────────────

@router.get("/profile")
async def auth_profile(current_user: dict = Depends(get_current_user)):
    """Return the connected Google profile metadata shown in Settings."""
    from app.db.session import get_db
    from uuid import UUID

    db = get_db()
    user_uuid = UUID(current_user["user_id"])
    row = await db.fetchrow(
        "SELECT u.email, u.display_name, oc.provider, oc.scopes, oc.expires_at, oc.created_at "
        "FROM users u LEFT JOIN oauth_credentials oc ON oc.user_id = u.id AND oc.provider = 'google' "
        "WHERE u.id = $1",
        user_uuid,
    )
    if not row:
        return {"connected": False, "user_id": current_user["user_id"]}
    return {
        "connected": row["provider"] is not None,
        "user_id": current_user["user_id"],
        "email": row["email"],
        "display_name": row["display_name"],
        "provider": row["provider"],
        "scopes": row["scopes"] or [],
        "expires_at": row["expires_at"].isoformat() if row["expires_at"] else None,
        "connected_at": row["created_at"].isoformat() if row["created_at"] else None,
    }


# ─── SMTP Settings ───────────────────────────────────────────────────────────

class SMTPConfigPayload(BaseModel):
    smtp_host: str
    smtp_port: int
    smtp_username: str
    smtp_password: Optional[str] = None
    smtp_use_tls: bool = True


@router.get("/smtp")
async def get_smtp_config(current_user: dict = Depends(get_current_user)):
    from app.db.session import get_db
    from uuid import UUID
    db = get_db()
    user_uuid = UUID(current_user["user_id"])
    row = await db.fetchrow(
        "SELECT smtp_host, smtp_port, smtp_username, smtp_password, smtp_use_tls FROM users WHERE id = $1",
        user_uuid,
    )
    if not row:
        return {"configured": False}

    configured = bool(row["smtp_host"])
    has_password = bool(row["smtp_password"])

    return {
        "configured": configured,
        "smtp_host": row["smtp_host"] or "",
        "smtp_port": row["smtp_port"] or 587,
        "smtp_username": row["smtp_username"] or "",
        "smtp_use_tls": row["smtp_use_tls"] if row["smtp_use_tls"] is not None else True,
        "has_password": has_password,
    }


@router.post("/smtp")
async def save_smtp_config(
    payload: SMTPConfigPayload,
    current_user: dict = Depends(get_current_user),
):
    from app.db.session import get_db
    from uuid import UUID
    from cryptography.fernet import Fernet
    from app.config import settings

    db = get_db()
    user_uuid = UUID(current_user["user_id"])

    # Ensure user exists
    user = await db.fetchrow("SELECT id FROM users WHERE id = $1", user_uuid)
    if not user:
        placeholder_email = payload.smtp_username or f"user_{user_uuid}@example.com"
        existing_email_user = await db.fetchrow("SELECT id FROM users WHERE email = $1", placeholder_email)
        if existing_email_user:
            placeholder_email = f"placeholder_{user_uuid}@example.com"
        await db.execute(
            "INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING",
            user_uuid, placeholder_email, "User",
        )
        from app.db.init_db import seed_default_rules
        await seed_default_rules(str(user_uuid), db)

    enc_fernet = Fernet(settings.oauth_encryption_key.get_secret_value().encode())

    if payload.smtp_password:
        encrypted_password = enc_fernet.encrypt(payload.smtp_password.encode()).decode()
        await db.execute(
            "UPDATE users SET smtp_host = $1, smtp_port = $2, smtp_username = $3, "
            "smtp_password = $4, smtp_use_tls = $5 WHERE id = $6",
            payload.smtp_host, payload.smtp_port, payload.smtp_username,
            encrypted_password, payload.smtp_use_tls, user_uuid,
        )
    else:
        await db.execute(
            "UPDATE users SET smtp_host = $1, smtp_port = $2, smtp_username = $3, "
            "smtp_use_tls = $4 WHERE id = $5",
            payload.smtp_host, payload.smtp_port, payload.smtp_username,
            payload.smtp_use_tls, user_uuid,
        )
    return {"status": "success", "message": "SMTP settings saved successfully"}


# ─── Groq API Key ────────────────────────────────────────────────────────────

class GroqKeyPayload(BaseModel):
    groq_api_key: str


@router.get("/groq")
async def get_groq_key(current_user: dict = Depends(get_current_user)):
    from app.db.session import get_db
    from uuid import UUID
    db = get_db()
    user_uuid = UUID(current_user["user_id"])
    row = await db.fetchrow("SELECT groq_api_key FROM users WHERE id = $1", user_uuid)
    if not row or not row["groq_api_key"]:
        return {"configured": False, "groq_api_key": ""}

    from cryptography.fernet import Fernet
    from app.config import settings
    enc_fernet = Fernet(settings.oauth_encryption_key.get_secret_value().encode())
    try:
        decrypted_key = enc_fernet.decrypt(row["groq_api_key"].encode()).decode()
    except Exception:
        decrypted_key = ""

    return {
        "configured": bool(decrypted_key),
        "groq_api_key": decrypted_key,
    }


@router.post("/groq")
async def save_groq_key(
    payload: GroqKeyPayload,
    current_user: dict = Depends(get_current_user),
):
    from app.db.session import get_db
    from uuid import UUID
    from cryptography.fernet import Fernet
    from app.config import settings

    db = get_db()
    user_uuid = UUID(current_user["user_id"])

    # Ensure user exists
    user = await db.fetchrow("SELECT id FROM users WHERE id = $1", user_uuid)
    if not user:
        placeholder_email = f"user_{user_uuid}@example.com"
        await db.execute(
            "INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING",
            user_uuid, placeholder_email, "User",
        )
        from app.db.init_db import seed_default_rules
        await seed_default_rules(str(user_uuid), db)

    enc_fernet = Fernet(settings.oauth_encryption_key.get_secret_value().encode())
    encrypted_key = enc_fernet.encrypt(payload.groq_api_key.encode()).decode()

    await db.execute(
        "UPDATE users SET groq_api_key = $1 WHERE id = $2",
        encrypted_key, user_uuid,
    )
    return {"status": "success", "message": "Groq API Key saved successfully"}
