from app.db.session import get_db_sync
from app.providers.factory import get_mail_provider

def send_draft_transactionally(draft_id: str) -> dict:
    import uuid
    draft_uuid = uuid.UUID(draft_id)
    db = get_db_sync()

    # Step 1: confirm durable intent already exists (status='approved' was
    # set when the approval was granted — Section 5.3). We do NOT set
    # status='sent' yet.
    draft = db.execute("SELECT * FROM drafts WHERE id = %s", (draft_uuid,)).fetchone()
    if not draft:
        raise ValueError(f"Draft {draft_id} not found in database")
    if draft.status != "approved":
        raise ValueError(f"Draft {draft_id} is not in an approved state (current status: {draft.status})")

    # Step 2: the irreversible call
    try:
        provider = get_mail_provider(str(draft.user_id))
        result = provider.send_draft(draft.provider_draft_id)
    except Exception as e:
        # Provider call failed outright — safe, nothing was sent. Leave
        # status as 'send_failed' so it can be retried.
        db.execute(
            "UPDATE drafts SET status = 'send_failed' WHERE id = %s", (draft_uuid,)
        )
        raise

    # Step 3: only now, after confirmed success, update local state —
    # in the same transaction as the audit log write.
    with db.transaction():
        db.execute("UPDATE drafts SET status = 'sent' WHERE id = %s", (draft_uuid,))
        db.execute(
            "INSERT INTO audit_log (user_id, agent_name, tool_name, input_params, output) "
            "VALUES (%s, 'sender', 'send_email', %s, %s)",
            (draft.user_id, {"draft_id": draft_id}, {"message_id": result.message_id})
        )

    return {"message_id": result.message_id, "status": "sent"}
