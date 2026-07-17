"""
bulk_send_service.py — Core SMTP bulk-send engine for Mailing Agent.

Adapted from Mail Curator's mail_service.py. Provides:
  - $placeholder substitution in subject & body
  - MIME message builder (HTML + plain text fallback)
  - SMTP connection management with auto-reconnect
  - Reply threading via In-Reply-To / References headers
  - Synchronous generator yielding SendProgress per recipient
"""

from __future__ import annotations

import logging
import re
import smtplib
import socket
import time
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, make_msgid
from pathlib import Path
from typing import Dict, Generator, List, Optional
from pydantic import BaseModel, EmailStr, Field

logger = logging.getLogger("mailing_agent.bulk_send")

PLACEHOLDER_RE = re.compile(r"\$(\w+)")

_PORT_SECURITY: Dict[int, str] = {
    25: "starttls",
    465: "ssl",
    587: "starttls",
    2525: "starttls",
}


# ─── Pydantic Models ─────────────────────────────────────────────────────────

class SMTPConfig(BaseModel):
    host: str
    port: int
    email: str
    password: Optional[str] = ""
    user_id: Optional[str] = None


class SMTPTestResult(BaseModel):
    ok: bool
    message: str
    host: Optional[str] = None
    port: Optional[int] = None


class Contact(BaseModel):
    email: str
    name: str = ""
    extra: Dict = Field(default_factory=dict)


class ColumnMap(BaseModel):
    email: str = "email"
    name: str = "name"
    company: str = ""
    role: str = ""
    city: str = ""


class ComposePayload(BaseModel):
    from_name: str = ""
    reply_to: Optional[str] = None
    cc: Optional[str] = None
    subject: str
    body_html: str
    signature: Optional[str] = None
    signature_enabled: bool = True


class RecipientResult(BaseModel):
    email: str
    name: str
    subject: str
    ok: bool
    error: Optional[str] = None
    message_id: Optional[str] = None


class SendProgress(BaseModel):
    total: int
    sent: int
    failed: int
    current: int
    done: bool = False
    stopped: bool = False
    result: Optional[RecipientResult] = None


class SendSummary(BaseModel):
    total: int
    sent: int
    failed: int
    failures: List[RecipientResult] = Field(default_factory=list)
    stopped: bool = False


class BulkSendRequest(BaseModel):
    smtp: SMTPConfig
    compose: ComposePayload
    contacts: List[Contact]
    column_map: ColumnMap = Field(default_factory=ColumnMap)
    delay_seconds: float = Field(3.0, ge=0, le=60)
    campaign_name: Optional[str] = None


class TestEmailRequest(BaseModel):
    smtp: SMTPConfig
    compose: ComposePayload
    to: str


# ─── Placeholder Substitution ────────────────────────────────────────────────

def fill_placeholders(template: str, contact: Contact, column_map: ColumnMap) -> str:
    """Replace $name, $email, $company, $role, $city with contact values."""
    subs: Dict[str, str] = {
        "name": contact.name or "",
        "email": contact.email,
        "company": str(contact.extra.get(column_map.company or "company", contact.extra.get("company", ""))),
        "role": str(contact.extra.get(column_map.role or "role", contact.extra.get("role", ""))),
        "city": str(contact.extra.get(column_map.city or "city", contact.extra.get("city", ""))),
    }
    for k, v in contact.extra.items():
        subs.setdefault(k, str(v))

    def _replace(m: re.Match) -> str:
        return subs.get(m.group(1), m.group(0))

    return PLACEHOLDER_RE.sub(_replace, template)


# ─── MIME Message Builder ─────────────────────────────────────────────────────

def build_message(
    smtp_cfg: SMTPConfig,
    compose: ComposePayload,
    contact: Contact,
    column_map: ColumnMap,
) -> tuple:
    """Build MIME message. Returns (msg, message_id, subject)."""
    subject = fill_placeholders(compose.subject, contact, column_map)
    body = fill_placeholders(compose.body_html, contact, column_map)

    # Append signature if enabled
    if compose.signature_enabled and compose.signature:
        body += f"<br/><br/>{compose.signature}"

    # Plain-text fallback
    plain = re.sub(r"<[^>]+>", " ", body)
    plain = re.sub(r"\s+", " ", plain).strip()

    msg = MIMEMultipart("mixed")
    message_id = make_msgid(domain=smtp_cfg.host)

    # Reply threading support
    prev_msg_id = contact.extra.get("_prev_msg_id")
    prev_subject = str(contact.extra.get("_prev_subject") or "").strip()
    if prev_msg_id:
        thread_subject = prev_subject or subject
        if not thread_subject.lower().startswith("re:"):
            thread_subject = f"Re: {thread_subject}"
        subject = thread_subject

    msg["Message-ID"] = message_id
    msg["Subject"] = subject
    msg["From"] = formataddr((compose.from_name or smtp_cfg.email, smtp_cfg.email))
    msg["To"] = contact.email

    if compose.reply_to:
        msg["Reply-To"] = compose.reply_to
    if compose.cc:
        msg["Cc"] = compose.cc

    if prev_msg_id:
        msg["In-Reply-To"] = prev_msg_id
        msg["References"] = prev_msg_id

    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(plain, "plain", "utf-8"))
    alt.attach(MIMEText(body, "html", "utf-8"))
    msg.attach(alt)

    return msg, message_id, subject


# ─── SMTP Connection Helpers ─────────────────────────────────────────────────

def _open_smtp(cfg: SMTPConfig, timeout: float = 60.0) -> smtplib.SMTP:
    password = cfg.password
    if (not password or password == "__SAVED_PASSWORD__") and cfg.user_id:
        from app.db.session import get_db_sync
        from cryptography.fernet import Fernet
        from app.config import settings
        import uuid
        
        try:
            db = get_db_sync()
            row = db.execute(
                "SELECT smtp_password FROM users WHERE id = %s",
                (cfg.user_id,)
            ).fetchone()
            if row and row.smtp_password:
                fernet = Fernet(settings.token_encryption_key.encode())
                password = fernet.decrypt(row.smtp_password.encode()).decode()
                logger.info("Successfully decrypted saved SMTP password for user_id=%s", cfg.user_id)
            else:
                logger.warning("No saved SMTP password found for user_id=%s", cfg.user_id)
        except Exception as e:
            logger.error("Failed to decrypt saved SMTP password for user %s: %s", cfg.user_id, e)

    mode = _PORT_SECURITY.get(cfg.port, "starttls")
    if mode == "ssl":
        conn = smtplib.SMTP_SSL(cfg.host, cfg.port, timeout=timeout)
    else:
        conn = smtplib.SMTP(cfg.host, cfg.port, timeout=timeout)
        conn.ehlo()
        try:
            conn.starttls()
            conn.ehlo()
        except smtplib.SMTPNotSupportedError:
            logger.info("STARTTLS not supported on port %d", cfg.port)
    conn.login(cfg.email, password or "")
    return conn


def _close_smtp(conn: Optional[smtplib.SMTP]) -> None:
    if not conn:
        return
    try:
        conn.quit()
    except Exception:
        try:
            conn.close()
        except Exception:
            pass


def _smtp_error_text(exc: Exception) -> str:
    if isinstance(exc, smtplib.SMTPResponseException):
        detail = exc.smtp_error.decode(errors="replace") if isinstance(exc.smtp_error, bytes) else str(exc.smtp_error)
        return f"{exc.smtp_code} {detail}".strip()
    return str(exc) or exc.__class__.__name__


def _ensure_connected(conn: smtplib.SMTP, cfg: SMTPConfig) -> smtplib.SMTP:
    try:
        code, _ = conn.noop()
        if 200 <= code < 400:
            return conn
    except (smtplib.SMTPException, OSError):
        pass
    logger.info("SMTP reconnecting to %s:%s", cfg.host, cfg.port)
    _close_smtp(conn)
    return _open_smtp(cfg)


# ─── SMTP Test ────────────────────────────────────────────────────────────────

def test_smtp_connection(cfg: SMTPConfig) -> SMTPTestResult:
    try:
        conn = _open_smtp(cfg, timeout=8.0)
        conn.quit()
        return SMTPTestResult(ok=True, message=f"Connected to {cfg.host}:{cfg.port} successfully.", host=cfg.host, port=cfg.port)
    except smtplib.SMTPAuthenticationError as e:
        return SMTPTestResult(ok=False, message=f"Auth failed: {e.smtp_error.decode(errors='replace')}")
    except (smtplib.SMTPException, socket.gaierror, socket.timeout, OSError) as e:
        return SMTPTestResult(ok=False, message=f"Connection error: {e}")
    except Exception as e:
        return SMTPTestResult(ok=False, message=f"Unexpected error: {e}")


# ─── Send One Email ───────────────────────────────────────────────────────────

def send_one(
    conn: smtplib.SMTP,
    cfg: SMTPConfig,
    compose: ComposePayload,
    contact: Contact,
    column_map: ColumnMap,
) -> RecipientResult:
    subject = fill_placeholders(compose.subject, contact, column_map)
    try:
        msg, message_id, subject = build_message(cfg, compose, contact, column_map)
        recipients = [contact.email]
        if compose.cc:
            recipients.extend([c.strip() for c in compose.cc.split(",") if c.strip()])
        conn.sendmail(cfg.email, recipients, msg.as_string())
        return RecipientResult(email=contact.email, name=contact.name, subject=subject, ok=True, message_id=message_id)
    except (smtplib.SMTPException, OSError) as e:
        return RecipientResult(email=contact.email, name=contact.name, subject=subject, ok=False, error=_smtp_error_text(e))


# ─── Campaign Batch Sender ────────────────────────────────────────────────────

def run_campaign_sync(
    request: BulkSendRequest,
    stop_event=None,
) -> Generator[SendProgress, None, SendSummary]:
    """Synchronous generator that sends emails one-by-one, yielding progress."""
    contacts = request.contacts
    total = len(contacts)
    sent = failed = 0
    failures: List[RecipientResult] = []
    stopped = False

    logger.info("Bulk campaign starting — %d recipients, %.1fs delay", total, request.delay_seconds)

    try:
        conn = _open_smtp(request.smtp)
    except Exception as e:
        error = f"Cannot open SMTP: {_smtp_error_text(e)}"
        logger.error(error)
        for idx, c in enumerate(contacts, 1):
            r = RecipientResult(email=c.email, name=c.name, subject=request.compose.subject, ok=False, error=error)
            yield SendProgress(total=total, sent=0, failed=idx, current=idx, done=(idx == total), result=r)
        return SendSummary(total=total, sent=0, failed=total, failures=[], stopped=False)

    try:
        for idx, contact in enumerate(contacts, 1):
            if stop_event and stop_event.is_set():
                stopped = True
                break

            try:
                conn = _ensure_connected(conn, request.smtp)
                result = send_one(conn, request.smtp, request.compose, contact, request.column_map)
            except Exception as e:
                result = RecipientResult(
                    email=contact.email, name=contact.name,
                    subject=request.compose.subject, ok=False,
                    error=f"SMTP failed: {_smtp_error_text(e)}",
                )

            # Retry on disconnect
            if not result.ok and "not connected" in (result.error or "").lower():
                try:
                    _close_smtp(conn)
                    conn = _open_smtp(request.smtp)
                    result = send_one(conn, request.smtp, request.compose, contact, request.column_map)
                except Exception as e:
                    result = RecipientResult(
                        email=contact.email, name=contact.name,
                        subject=request.compose.subject, ok=False,
                        error=f"Reconnect failed: {_smtp_error_text(e)}",
                    )

            if result.ok:
                sent += 1
            else:
                failed += 1
                failures.append(result)

            yield SendProgress(total=total, sent=sent, failed=failed, current=idx, done=(idx == total), result=result)

            if idx < total and request.delay_seconds > 0:
                time.sleep(request.delay_seconds)
    finally:
        _close_smtp(conn)

    if stopped:
        yield SendProgress(total=total, sent=sent, failed=failed, current=len(contacts), done=True, stopped=True)

    logger.info("Bulk campaign finished — sent=%d failed=%d stopped=%s", sent, failed, stopped)
    return SendSummary(total=total, sent=sent, failed=failed, failures=failures, stopped=stopped)


# ─── Test Email ───────────────────────────────────────────────────────────────

def send_test_email(cfg: SMTPConfig, compose: ComposePayload, to: str) -> RecipientResult:
    dummy = Contact(email=to, name="Test Recipient")
    dummy_map = ColumnMap()
    try:
        conn = _open_smtp(cfg, timeout=60.0)
        result = send_one(conn, cfg, compose, dummy, dummy_map)
        _close_smtp(conn)
        return result
    except Exception as e:
        return RecipientResult(email=to, name="Test Recipient", subject=compose.subject, ok=False, error=str(e))
