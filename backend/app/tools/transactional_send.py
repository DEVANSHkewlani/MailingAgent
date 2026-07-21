from typing import Optional
from app.db.session import get_db_sync
from app.providers.factory import get_mail_provider

def send_draft_transactionally(draft_id: str, approval_id: Optional[str] = None) -> dict:
    import uuid
    import json
    from app.config import settings
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

    # Step 2: Resolve SMTP configuration (User-specific or Global settings fallback)
    smtp_host = None
    smtp_port = 587
    smtp_username = ""
    smtp_password = ""
    smtp_use_tls = True

    # 2.1 Load user SMTP details if exists
    user_row = db.execute(
        "SELECT smtp_host, smtp_port, smtp_username, smtp_password, smtp_use_tls FROM users WHERE id = %s",
        (draft.user_id,)
    ).fetchone()

    if user_row and user_row[0]: # user-specific SMTP host is set
        smtp_host = user_row[0]
        smtp_port = user_row[1] or 587
        smtp_username = user_row[2] or ""
        smtp_use_tls = user_row[4] if user_row[4] is not None else True
        smtp_password_enc = user_row[3]
        if smtp_password_enc:
            try:
                from cryptography.fernet import Fernet
                fernet = Fernet(settings.oauth_encryption_key.get_secret_value().encode())
                smtp_password = fernet.decrypt(smtp_password_enc.encode()).decode()
            except Exception as dec_err:
                print(f"SMTP: Failed to decrypt user SMTP password: {dec_err}")
                smtp_password = ""
    elif settings.smtp_host: # fallback to global SMTP settings
        smtp_host = settings.smtp_host
        smtp_port = settings.smtp_port
        smtp_username = settings.smtp_username
        smtp_password = settings.smtp_password
        smtp_use_tls = settings.smtp_use_tls

    if smtp_host:
        print(f"SMTP Configured: Sending draft {draft_id} via SMTP to {smtp_host}...")
        try:
            import smtplib
            from email.mime.multipart import MIMEMultipart
            from email.mime.text import MIMEText

            to_email = None
            subject = None

            # Resolve approval_id if not explicitly provided
            if not approval_id:
                app_row = db.execute(
                    "SELECT id FROM approval_queue WHERE resource_id = %s AND action_type = 'send_email' "
                    "ORDER BY created_at DESC LIMIT 1",
                    (draft_id,)
                ).fetchone()
                if app_row:
                    approval_id = str(app_row[0])

            if approval_id:
                app_details = db.execute(
                    "SELECT payload FROM approval_queue WHERE id = %s",
                    (uuid.UUID(approval_id),)
                ).fetchone()
                if app_details:
                    payload_data = app_details[0]
                    if isinstance(payload_data, str):
                        payload_data = json.loads(payload_data)
                    to_email = payload_data.get("to")
                    subject = payload_data.get("subject")

            # Fallbacks if details not found in approval_queue
            if not to_email:
                to_email = "recipient@example.com"
            if not subject:
                subject = "Mail Agent Draft"

            # Create SMTP MIME message with alternative parts to prevent spam filter flags
            msg = MIMEMultipart('alternative')
            msg['From'] = smtp_username or "agent@localhost"
            msg['To'] = to_email
            msg['Subject'] = subject
            
            # Attach plain text first
            plain_body = draft.body_markdown or ""
            msg.attach(MIMEText(plain_body, 'plain'))
            
            # Attach HTML second (alternative)
            if draft.body_html:
                msg.attach(MIMEText(draft.body_html, 'html'))

            # Send via smtplib
            with smtplib.SMTP(smtp_host, smtp_port) as server:
                if smtp_use_tls:
                    server.starttls()
                if smtp_username and smtp_password:
                    server.login(smtp_username, smtp_password)
                server.send_message(msg)

            # Discard the Gmail draft since it has been sent via SMTP
            if draft.provider_draft_id:
                try:
                    provider = get_mail_provider(str(draft.user_id))
                    provider.delete_draft(draft.provider_draft_id)
                except Exception as del_err:
                    print(f"SMTP Sender: Warning - failed to delete/discard draft {draft.provider_draft_id}: {del_err}")

            message_id = f"smtp-{uuid.uuid4()}"
            print(f"SMTP Success: Sent draft {draft_id} successfully to {to_email}.")
        except Exception as smtp_err:
            print(f"SMTP Error: Failed to send draft {draft_id} via SMTP: {smtp_err}")
            db.execute(
                "UPDATE drafts SET status = 'send_failed' WHERE id = %s", (draft_uuid,)
            )
            raise
    else:
        err_msg = "SMTP is not configured. Please fill in your SMTP details in Settings to send emails."
        print(f"SMTP Error: {err_msg}")
        db.execute(
            "UPDATE drafts SET status = 'send_failed' WHERE id = %s", (draft_uuid,)
        )
        raise ValueError(err_msg)

    # Step 3: only now, after confirmed success, update local state —
    # in the same transaction as the audit log write.
    import json
    with db.transaction():
        db.execute("UPDATE drafts SET status = 'sent' WHERE id = %s", (draft_uuid,))
        db.execute(
            "INSERT INTO audit_log (user_id, agent_name, tool_name, input_params, output) "
            "VALUES (%s, 'sender', 'send_email', %s, %s)",
            (draft.user_id, json.dumps({"draft_id": draft_id}), json.dumps({"message_id": message_id}))
        )

    return {"message_id": message_id, "status": "sent"}
