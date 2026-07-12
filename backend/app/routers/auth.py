from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse
from app.auth.google_oauth import get_auth_url, handle_callback

router = APIRouter(prefix="/auth", tags=["auth"])

@router.get("/login")
def login(user_id: str, frontend_url: str = "http://localhost:5173"):
    """
    Redirect the user to Google's OAuth consent screen.
    Passes user_id and frontend_url as the state parameter.
    """
    try:
        from google_auth_oauthlib.flow import Flow
        from app.config import settings
        from app.auth.google_oauth import SCOPES
        
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
        state_payload = f"{user_id}|{frontend_url}"
        auth_url, _ = flow.authorization_url(access_type="offline", prompt="consent", state=state_payload)
        return RedirectResponse(auth_url)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OAuth url generation failed: {str(e)}")


@router.get("/callback")
async def callback(code: str, state: str):
    """
    Receive Google OAuth callback code. State parameter holds the original user_id and frontend_url.
    """
    try:
        if "|" in state:
            user_id, frontend_url = state.split("|", 1)
        else:
            user_id = state
            frontend_url = "http://localhost:5173"

        resolved_user_id = await handle_callback(code, user_id)
        redirect_target = frontend_url.rstrip("/") + "/#/app" if "/#/app" not in frontend_url else frontend_url
        connector = "?" if "?" not in redirect_target else "&"
        redirect_target = f"{redirect_target}{connector}user_id={resolved_user_id}"
        return RedirectResponse(url=redirect_target)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OAuth callback processing failed: {str(e)}")

@router.get("/status")
async def auth_status(user_id: str):
    """Check if the user has an active Google OAuth connection."""
    from app.db.session import get_db
    from uuid import UUID
    db = get_db()
    user_uuid = UUID(user_id)
    row = await db.fetchrow(
        "SELECT id FROM oauth_credentials WHERE user_id = $1 AND provider = 'google'",
        user_uuid
    )
    return {"connected": row is not None}


@router.get("/profile")
async def auth_profile(user_id: str):
    """Return the connected Google profile metadata shown in Settings."""
    from app.db.session import get_db
    from uuid import UUID

    db = get_db()
    user_uuid = UUID(user_id)
    row = await db.fetchrow(
        "SELECT u.email, u.display_name, oc.provider, oc.scopes, oc.expires_at, oc.created_at "
        "FROM users u LEFT JOIN oauth_credentials oc ON oc.user_id = u.id AND oc.provider = 'google' "
        "WHERE u.id = $1",
        user_uuid,
    )
    if not row:
        return {"connected": False, "user_id": user_id}
    return {
        "connected": row["provider"] is not None,
        "user_id": user_id,
        "email": row["email"],
        "display_name": row["display_name"],
        "provider": row["provider"],
        "scopes": row["scopes"] or [],
        "expires_at": row["expires_at"].isoformat() if row["expires_at"] else None,
        "connected_at": row["created_at"].isoformat() if row["created_at"] else None,
    }


from pydantic import BaseModel
from typing import Optional

class SMTPConfigPayload(BaseModel):
    user_id: str
    smtp_host: str
    smtp_port: int
    smtp_username: str
    smtp_password: Optional[str] = None
    smtp_use_tls: bool = True

@router.get("/smtp")
async def get_smtp_config(user_id: str):
    from app.db.session import get_db
    from uuid import UUID
    db = get_db()
    try:
        user_uuid = UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id format")
    row = await db.fetchrow(
        "SELECT smtp_host, smtp_port, smtp_username, smtp_password, smtp_use_tls FROM users WHERE id = $1",
        user_uuid
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
        "has_password": has_password
    }

@router.post("/smtp")
async def save_smtp_config(payload: SMTPConfigPayload):
    from app.db.session import get_db
    from uuid import UUID
    from cryptography.fernet import Fernet
    from app.config import settings

    db = get_db()
    try:
        user_uuid = UUID(payload.user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id format")
        
    fernet = Fernet(settings.token_encryption_key.encode())
    
    if payload.smtp_password:
        encrypted_password = fernet.encrypt(payload.smtp_password.encode()).decode()
        await db.execute(
            "UPDATE users SET smtp_host = $1, smtp_port = $2, smtp_username = $3, "
            "smtp_password = $4, smtp_use_tls = $5 WHERE id = $6",
            payload.smtp_host, payload.smtp_port, payload.smtp_username,
            encrypted_password, payload.smtp_use_tls, user_uuid
        )
    else:
        await db.execute(
            "UPDATE users SET smtp_host = $1, smtp_port = $2, smtp_username = $3, "
            "smtp_use_tls = $4 WHERE id = $5",
            payload.smtp_host, payload.smtp_port, payload.smtp_username,
            payload.smtp_use_tls, user_uuid
        )
    return {"status": "success", "message": "SMTP settings saved successfully"}

class GroqKeyPayload(BaseModel):
    user_id: str
    groq_api_key: str

@router.get("/groq")
async def get_groq_key(user_id: str):
    from app.db.session import get_db
    from uuid import UUID
    db = get_db()
    try:
        user_uuid = UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id format")
    row = await db.fetchrow(
        "SELECT groq_api_key FROM users WHERE id = $1",
        user_uuid
    )
    if not row or not row["groq_api_key"]:
        return {"configured": False, "groq_api_key": ""}
    
    from cryptography.fernet import Fernet
    from app.config import settings
    fernet = Fernet(settings.token_encryption_key.encode())
    try:
        decrypted_key = fernet.decrypt(row["groq_api_key"].encode()).decode()
    except Exception:
        decrypted_key = ""
        
    return {
        "configured": bool(decrypted_key),
        "groq_api_key": decrypted_key
    }

@router.post("/groq")
async def save_groq_key(payload: GroqKeyPayload):
    from app.db.session import get_db
    from uuid import UUID
    from cryptography.fernet import Fernet
    from app.config import settings

    db = get_db()
    try:
        user_uuid = UUID(payload.user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id format")
        
    fernet = Fernet(settings.token_encryption_key.encode())
    encrypted_key = fernet.encrypt(payload.groq_api_key.encode()).decode()
    
    await db.execute(
        "UPDATE users SET groq_api_key = $1 WHERE id = $2",
        encrypted_key, user_uuid
    )
    return {"status": "success", "message": "Groq API Key saved successfully"}
