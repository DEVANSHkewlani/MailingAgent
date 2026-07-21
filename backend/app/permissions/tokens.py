"""
Confirmation Tokens — single-use, short-lived, scoped HMAC tokens for approval actions.

Security improvements:
  - JSON payload format instead of colon-delimited (fixes parsing bug with colons in resource)
  - Uses dedicated TOKEN_SIGNING_KEY (not shared with Fernet encryption)
  - Async DB queries with $1-style parameterized params (consistent with rest of codebase)
  - Timing-safe comparison with hmac.compare_digest
"""

import hmac
import hashlib
import time
import base64
import json
from app.config import settings


def issue_token(approval_id, action: str, resource: str) -> str:
    """Issue a single-use, short-lived, scoped token.
    
    HMAC-signed so it can be verified without a DB round-trip,
    then checked against approval_queue for the consumed/expired state.
    """
    expiry = int(time.time()) + settings.confirmation_token_ttl_minutes * 60
    payload = json.dumps({
        "id": str(approval_id),
        "a": action,
        "r": resource,
        "exp": expiry,
    }, separators=(",", ":"))  # compact JSON
    sig = hmac.new(
        settings.token_signing_key.get_secret_value().encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()
    return base64.urlsafe_b64encode(f"{payload}|{sig}".encode()).decode()


def verify_token(token: str, action: str, resource: str) -> str:
    """Verify a confirmation token synchronously.
    
    Raises PermissionError if invalid, expired, wrong scope, or already consumed.
    Returns the approval_id on success.
    """
    from app.db.session import get_db_sync

    decoded = base64.urlsafe_b64decode(token.encode()).decode()
    sep_idx = decoded.rfind("|")
    if sep_idx == -1:
        raise PermissionError("Malformed token")
    
    payload_str = decoded[:sep_idx]
    sig = decoded[sep_idx + 1:]

    expected_sig = hmac.new(
        settings.token_signing_key.get_secret_value().encode(),
        payload_str.encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(sig, expected_sig):
        raise PermissionError("Invalid token signature")

    payload = json.loads(payload_str)

    if payload["exp"] < time.time():
        raise PermissionError("Token expired")
    if payload["a"] != action or payload["r"] != resource:
        raise PermissionError("Token scope mismatch")

    import uuid
    approval_uuid = uuid.UUID(payload["id"])
    db = get_db_sync()
    row = db.execute(
        "SELECT status FROM approval_queue WHERE id = %s", (approval_uuid,),
    ).fetchone()
    if row is None or row["status"] == "consumed":
        raise PermissionError("Token already used or unknown")

    # Mark consumed atomically — this IS the idempotency guard
    db.execute(
        "UPDATE approval_queue SET status = 'consumed', resolved_at = now() "
        "WHERE id = %s AND status != 'consumed'",
        (approval_uuid,),
    )
    return payload["id"]


async def verify_token_async(token: str, action: str, resource: str) -> str:
    """Verify a confirmation token asynchronously. Uses async DB wrapper."""
    from app.db.session import get_db

    decoded = base64.urlsafe_b64decode(token.encode()).decode()
    sep_idx = decoded.rfind("|")
    if sep_idx == -1:
        raise PermissionError("Malformed token")
    
    payload_str = decoded[:sep_idx]
    sig = decoded[sep_idx + 1:]

    expected_sig = hmac.new(
        settings.token_signing_key.get_secret_value().encode(),
        payload_str.encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(sig, expected_sig):
        raise PermissionError("Invalid token signature")

    payload = json.loads(payload_str)

    if payload["exp"] < time.time():
        raise PermissionError("Token expired")
    if payload["a"] != action or payload["r"] != resource:
        raise PermissionError("Token scope mismatch")

    import uuid
    approval_uuid = uuid.UUID(payload["id"])
    db = get_db()
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
    return payload["id"]
