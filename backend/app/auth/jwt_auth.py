"""
JWT Authentication — issue and verify JSON Web Tokens for user sessions.

Usage in endpoints:
    from app.auth.jwt_auth import get_current_user, create_access_token
    
    @router.get("/protected")
    async def protected(current_user: dict = Depends(get_current_user)):
        user_id = current_user["user_id"]
"""

import jwt
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import settings

security = HTTPBearer(auto_error=False)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24


def create_access_token(user_id: str, email: str) -> str:
    """Create a signed JWT containing the user's identity."""
    payload = {
        "user_id": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.jwt_secret.get_secret_value(), algorithm=ALGORITHM)


def _decode_token(token: str) -> dict:
    """Decode and verify a JWT. Returns the payload dict or raises."""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            algorithms=[ALGORITHM],
        )
        user_id = payload.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: missing user_id")
        return {"user_id": user_id, "email": payload.get("email", "")}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")




async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """FastAPI dependency — extracts and verifies the user from the Authorization header or query param.
    
    Returns dict with keys: user_id, email
    """
    token = request.query_params.get("token")
    if not token and credentials:
        token = credentials.credentials
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
        
    return _decode_token(token)


def verify_ws_token(token: str) -> dict:
    """Verify a JWT for WebSocket connections (no FastAPI Depends available).
    
    Returns dict with keys: user_id, email
    Raises ValueError on any failure.
    """
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            algorithms=[ALGORITHM],
        )
        user_id = payload.get("user_id")
        if not user_id:
            raise ValueError("Invalid token: missing user_id")
        return {"user_id": user_id, "email": payload.get("email", "")}
    except jwt.ExpiredSignatureError:
        raise ValueError("Token expired")
    except jwt.InvalidTokenError:
        raise ValueError("Invalid token")
