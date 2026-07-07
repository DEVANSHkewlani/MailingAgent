from app.db.session import get_db_sync
from app.providers.factory import get_mail_provider

def reconcile_stuck_sends():
    """
    Finds drafts stuck in 'approved' or 'send_failed' status for more than 10 minutes,
    checks the actual status on Gmail, and either marks them as 'sent' (if Gmail sent them)
    or retries sending them transactionally.
    """
    print("Reconciliation Job: Starting stuck sends check...")
    db = get_db_sync()
    stuck = db.execute(
        "SELECT * FROM drafts WHERE status IN ('approved', 'send_failed') "
        "AND created_at < now() - interval '10 minutes'"
    ).fetchall()

    if not stuck:
        print("Reconciliation Job: No stuck sends found.")
        return

    print(f"Reconciliation Job: Found {len(stuck)} stuck draft(s). Processing...")
    for draft in stuck:
        draft_id = str(draft.id)
        user_id = str(draft.user_id)
        provider_draft_id = draft.provider_draft_id
        
        try:
            provider = get_mail_provider(user_id)
            # Check Gmail status
            already_sent = provider.check_if_draft_was_sent(provider_draft_id)
            
            if already_sent:
                # Gmail already sent it; resolve local DB record without duplicating the send
                print(f"Reconciliation Job: Draft {draft_id} was already sent on provider. Updating local DB.")
                db.execute("UPDATE drafts SET status = 'sent' WHERE id = %s", (draft_id,))
            else:
                # Draft is still active on provider, safe to retry sending transactionally
                print(f"Reconciliation Job: Draft {draft_id} still pending on provider. Retrying send...")
                from app.tools.transactional_send import send_draft_transactionally
                try:
                    send_draft_transactionally(draft_id)
                    print(f"Reconciliation Job: Successfully sent draft {draft_id} on retry.")
                except Exception as retry_err:
                    print(f"Reconciliation Job: Retry send failed for draft {draft_id}: {retry_err}")
        except Exception as e:
            print(f"Reconciliation Job: Error processing stuck draft {draft_id}: {e}")
