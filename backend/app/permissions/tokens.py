import hmac
import hashlib
import time
import base64
from app.config import settings

def issue_token(approval_id: str, action: str, resource: str) -> str:
    """Single-use, short-lived, scoped token. HMAC-signed so it can be
    verified without a DB round-trip, then checked against approval_queue
    for the consumed/expired state."""
    expiry = int(time.time()) + settings.confirmation_token_ttl_minutes * 60
    payload = f"{approval_id}:{action}:{resource}:{expiry}"
    sig = hmac.new(settings.token_encryption_key.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(f"{payload}:{sig}".encode()).decode()


def verify_token(token: str, action: str, resource: str) -> str:
    """Raises if invalid, expired, wrong scope, or already consumed.
    Returns the approval_id on success."""
    from app.db.session import get_db_sync

    decoded = base64.urlsafe_b64decode(token.encode()).decode()
    approval_id, tok_action, tok_resource, expiry, sig = decoded.rsplit(":", 4)
    payload = f"{approval_id}:{tok_action}:{tok_resource}:{expiry}"
    expected_sig = hmac.new(settings.token_encryption_key.encode(), payload.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(sig, expected_sig):
        raise PermissionError("Invalid token signature")
    if int(expiry) < time.time():
        raise PermissionError("Token expired")
    if tok_action != action or tok_resource != resource:
        raise PermissionError("Token scope mismatch")

    import uuid
    approval_uuid = uuid.UUID(approval_id)
    db = get_db_sync()
    row = db.execute(
        "SELECT status FROM approval_queue WHERE id = %s", (approval_uuid,)
    ).fetchone()
    if row is None or row[0] == "consumed":
        raise PermissionError("Token already used or unknown")

    # Mark consumed atomically — this IS the idempotency guard (Section 13)
    db.execute(
        "UPDATE approval_queue SET status = 'consumed', resolved_at = now() "
        "WHERE id = %s AND status != 'consumed'", (approval_uuid,)
    )
    return approval_id
