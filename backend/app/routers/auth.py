from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse
from app.auth.google_oauth import get_auth_url, handle_callback

router = APIRouter(prefix="/auth", tags=["auth"])

@router.get("/login")
def login(user_id: str):
    """
    Redirect the user to Google's OAuth consent screen.
    Passes user_id as the state parameter.
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
        # Pass user_id as state
        auth_url, _ = flow.authorization_url(access_type="offline", prompt="consent", state=user_id)
        return RedirectResponse(auth_url)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OAuth url generation failed: {str(e)}")


@router.get("/callback")
async def callback(code: str, state: str):
    """
    Receive Google OAuth callback code. State parameter holds the original user_id.
    """
    try:
        user_id = state
        await handle_callback(code, user_id)
        return RedirectResponse(url="http://localhost:5173/#/app")
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
