from app.db.session import get_db

MAX_SENDS_PER_HOUR = 30

async def check_send_rate_limit(user_id: str) -> bool:
    """Check if the user has exceeded their hourly email sending quota."""
    db = get_db()
    row = await db.fetchrow(
        "SELECT count(*) as cnt FROM audit_log WHERE user_id = $1 AND tool_name = 'send_email' "
        "AND created_at > now() - interval '1 hour'",
        user_id
    )
    count = row["cnt"] if row else 0
    return count < MAX_SENDS_PER_HOUR
