import base64
import contextvars
from email.mime.text import MIMEText
from typing import List, Dict, Any, Optional
from googleapiclient.discovery import build
from app.providers.base import MailProvider, Message, Thread, Draft, SendResult

# ContextVar to hold the active request-specific GmailProvider client
active_mail_provider = contextvars.ContextVar("active_mail_provider")

class MailProviderProxy:
    """Proxy object delegating all attribute lookups to active_mail_provider ContextVar."""
    def __getattr__(self, name):
        try:
            provider = active_mail_provider.get()
        except LookupError:
            raise RuntimeError("Mail provider context is not set. Are you calling this inside a graph execution context?")
        return getattr(provider, name)

# This matches the static import pattern: from app.providers.gmail import gmail_client
gmail_client = MailProviderProxy()


def clean_body_text(text: str) -> str:
    import html
    import re
    if not text:
        return ""
    # Unescape all HTML entities (handles things like &amp;, &#8199;, etc.)
    text = html.unescape(text)
    
    # Strip zero-width/invisible formatting characters
    # \u200b-\u200d: zero-width space/non-joiner/joiner
    # \ufeff: zero-width no-break space / BOM
    # \u034f: combining grapheme joiner
    # \u2060-\u206f: invisible formatting characters
    # \u2007: figure space
    # \u202f: narrow no-break space
    invisible_chars = re.compile(r'[\u200b-\u200d\ufeff\u034f\u2060-\u206f\u2007\u202f\u180e]')
    text = invisible_chars.sub('', text)
    
    # Collapse multiple consecutive blank lines or spaces to keep it clean
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n\s*\n\s*\n+', '\n\n', text)
    return text.strip()


class GmailProvider(MailProvider):
    def __init__(self, credentials):
        self.service = build("gmail", "v1", credentials=credentials)

    def list_messages(self, query: str, max_results: int = 20) -> List[Message]:
        result = self.service.users().messages().list(
            userId="me", q=query, maxResults=max_results
        ).execute()
        return [Message(id=m["id"], thread_id=m["threadId"]) for m in result.get("messages", [])]

    def get_thread(self, thread_id: str) -> Thread:
        raw = self.service.users().threads().get(
            userId="me", id=thread_id, format="full"
        ).execute()
        # Parse thread messages into dict representation for state context
        parsed_messages = []
        for m in raw.get("messages", []):
            headers = m.get("payload", {}).get("headers", [])
            sender = next((h["value"] for h in headers if h["name"] == "From"), "unknown")
            subject = next((h["value"] for h in headers if h["name"] == "Subject"), "no subject")
            parsed_messages.append({
                "id": m["id"],
                "thread_id": thread_id,
                "sender": sender,
                "subject": subject,
                "snippet": clean_body_text(m.get("snippet", "")),
                "labels": m.get("labelIds", []),
                "received_at": m.get("internalDate") # timestamp milliseconds
            })
        return Thread(id=thread_id, messages=parsed_messages)

    def create_draft(self, thread_id: str, html_body: str, subject: Optional[str], to: Optional[str] = None) -> Draft:
        mime = MIMEText(html_body, "html")
        if subject:
            mime["subject"] = subject
        
        # If no explicit `to` was passed, look up the thread to find the original sender
        if to:
            mime["to"] = to
        else:
            try:
                thread_data = self.service.users().threads().get(
                    userId="me", id=thread_id, format="metadata",
                    metadataHeaders=["From", "Message-ID"]
                ).execute()
                msgs = thread_data.get("messages", [])
                if msgs:
                    last_msg = msgs[-1]
                    headers = last_msg.get("payload", {}).get("headers", [])
                    sender = next((h["value"] for h in headers if h["name"].lower() == "from"), None)
                    msg_id = next((h["value"] for h in headers if h["name"].lower() == "message-id"), None)
                    if sender:
                        mime["to"] = sender
                    if msg_id:
                        mime["In-Reply-To"] = msg_id
                        mime["References"] = msg_id
            except Exception as e:
                print(f"GmailProvider: Could not look up thread for To header: {e}")

        raw = base64.urlsafe_b64encode(mime.as_bytes()).decode()
        result = self.service.users().drafts().create(
            userId="me", body={"message": {"raw": raw, "threadId": thread_id}}
        ).execute()
        
        # Extract threadId from the created draft resource returned by Google
        res_thread_id = result.get("message", {}).get("threadId") or thread_id
        return Draft(id=result["id"], thread_id=res_thread_id)

    def update_draft(self, draft_id: str, html_body: str, subject: Optional[str] = None) -> Draft:
        mime = MIMEText(html_body, "html")
        if subject:
            mime["subject"] = subject
            
        raw = base64.urlsafe_b64encode(mime.as_bytes()).decode()
        result = self.service.users().drafts().update(
            userId="me", id=draft_id, body={"message": {"raw": raw}}
        ).execute()
        # Get thread_id of updated draft
        thread_id = result.get("message", {}).get("threadId", "")
        return Draft(id=result["id"], thread_id=thread_id)

    def send_draft(self, draft_id: str) -> SendResult:
        result = self.service.users().drafts().send(
            userId="me", body={"id": draft_id}
        ).execute()
        return SendResult(message_id=result["id"], status="sent")

    def apply_label(self, message_id: str, label: str) -> None:
        label_id = self._resolve_label_id(label)
        self.service.users().messages().modify(
            userId="me", id=message_id, body={"addLabelIds": [label_id]}
        ).execute()

    def get_attachment(self, message_id: str, attachment_id: str) -> Dict[str, Any]:
        return self.service.users().messages().attachments().get(
            userId="me", messageId=message_id, id=attachment_id
        ).execute()

    def check_if_draft_was_sent(self, draft_id: str) -> bool:
        try:
            self.service.users().drafts().get(userId="me", id=draft_id).execute()
            return False
        except Exception:
            return True

    def delete_draft(self, draft_id: str) -> None:
        try:
            self.service.users().drafts().delete(userId="me", id=draft_id).execute()
            print(f"GmailProvider: Discarded draft {draft_id} successfully.")
        except Exception as e:
            print(f"GmailProvider: Warning - failed to delete draft {draft_id}: {e}")

    def get_message_body(self, message_id: str) -> str:
        try:
            msg = self.service.users().messages().get(
                userId="me", id=message_id, format="full"
            ).execute()
            payload = msg.get("payload", {})
            
            def _extract_plain_text(part) -> str:
                mime_type = part.get("mimeType", "")
                body_data = part.get("body", {}).get("data", "")
                if mime_type == "text/plain" and body_data:
                    try:
                        return base64.urlsafe_b64decode(body_data).decode("utf-8", errors="ignore")
                    except Exception:
                        pass
                if "parts" in part:
                    for subpart in part["parts"]:
                        txt = _extract_plain_text(subpart)
                        if txt:
                            return txt
                return ""

            def _extract_html_text(part) -> str:
                mime_type = part.get("mimeType", "")
                body_data = part.get("body", {}).get("data", "")
                if mime_type == "text/html" and body_data:
                    try:
                        html_raw = base64.urlsafe_b64decode(body_data).decode("utf-8", errors="ignore")
                        import re
                        # Clean scripts/styles blocks
                        html_raw = re.sub(r'<(style|script|head)\b[^>]*>.*?</\1>', '', html_raw, flags=re.DOTALL | re.IGNORECASE)
                        # Replace headers, paragraphs, lists, table elements, div, br tags with clean newlines
                        html_raw = re.sub(r'</?(p|div|br|tr|h[1-6]|li)[^>]*>', '\n', html_raw, flags=re.IGNORECASE)
                        # Strip remaining html tags
                        clean = re.sub(r'<[^>]+>', '', html_raw)
                        # Unescape entities
                        clean = clean.replace('&nbsp;', ' ').replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&').replace('&quot;', '"').replace('&apos;', "'")
                        # Normalize multiple empty lines to maximum 2 empty lines
                        clean = re.sub(r'\n\s*\n\s*\n+', '\n\n', clean)
                        return clean.strip()
                    except Exception:
                        pass
                if "parts" in part:
                    for subpart in part["parts"]:
                        txt = _extract_html_text(subpart)
                        if txt:
                            return txt
                return ""

            raw_body = ""
            body = _extract_plain_text(payload)
            if body and body.strip():
                raw_body = body
            else:
                body = _extract_html_text(payload)
                if body and body.strip():
                    raw_body = body
                else:
                    raw_body = msg.get("snippet", "")
            return clean_body_text(raw_body)
        except Exception as e:
            print(f"GmailProvider: Failed to fetch message body: {e}")
            return ""

    def search(self, query: str, max_results: int = 20) -> List[Dict[str, Any]]:
        """Extended method utilized by list_emails tool. Pulls message metadata."""
        messages = self.list_messages(query, max_results)
        results = []
        for m in messages:
            try:
                msg_detail = self.service.users().messages().get(
                    userId="me", id=m.id, format="metadata",
                    metadataHeaders=["From", "Subject", "Date"]
                ).execute()
                headers = msg_detail.get("payload", {}).get("headers", [])
                sender = next((h["value"] for h in headers if h["name"].lower() == "from"), "unknown")
                subject = next((h["value"] for h in headers if h["name"].lower() == "subject"), "no subject")
                internal_date_ms = msg_detail.get("internalDate")
                import datetime
                received_at = None
                if internal_date_ms:
                    received_at = datetime.datetime.fromtimestamp(int(internal_date_ms) / 1000.0, datetime.timezone.utc)
                else:
                    received_at = datetime.datetime.now(datetime.timezone.utc)

                results.append({
                    "id": m.id,
                    "thread_id": m.thread_id,
                    "sender": sender,
                    "subject": subject,
                    "snippet": clean_body_text(msg_detail.get("snippet", "")),
                    "labels": msg_detail.get("labelIds", []),
                    "received_at": received_at
                })
            except Exception as e:
                print(f"Error fetching message details in search for {m.id}: {e}")
        return results

    def _resolve_label_id(self, label_name: str) -> str:
        labels = self.service.users().labels().list(userId="me").execute()["labels"]
        for l in labels:
            if l["name"] == label_name:
                return l["id"]
        created = self.service.users().labels().create(
            userId="me", body={"name": label_name}
        ).execute()
        return created["id"]
