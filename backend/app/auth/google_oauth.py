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
    # Check if oauth credentials already exist for this user & provider, and update or insert
    existing = await db.fetchrow(
        "SELECT id FROM oauth_credentials WHERE user_id = $1 AND provider = 'google'",
        user_id
    )
    
    access_enc = fernet.encrypt(creds.token.encode())
    refresh_enc = fernet.encrypt(creds.refresh_token.encode()) if creds.refresh_token else b""
    
    if existing:
        # Update
        if refresh_enc:
            await db.execute(
                "UPDATE oauth_credentials SET access_token_encrypted = $1, refresh_token_encrypted = $2, "
                "scopes = $3, expires_at = $4, created_at = now() WHERE id = $5",
                access_enc, refresh_enc, SCOPES, creds.expiry, existing["id"]
            )
        else:
            await db.execute(
                "UPDATE oauth_credentials SET access_token_encrypted = $1, "
                "scopes = $2, expires_at = $3, created_at = now() WHERE id = $4",
                access_enc, SCOPES, creds.expiry, existing["id"]
            )
        print(f"Updated Google OAuth credentials for user {user_id}")
    else:
        # Insert
        await db.execute(
            "INSERT INTO oauth_credentials (user_id, provider, access_token_encrypted, "
            "refresh_token_encrypted, scopes, expires_at) VALUES ($1, 'google', $2, $3, $4, $5)",
            user_id,
            access_enc,
            refresh_enc,
            SCOPES,
            creds.expiry
        )
        print(f"Saved new Google OAuth credentials for user {user_id}")
