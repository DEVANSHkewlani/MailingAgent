import requests
from typing import List, Dict, Any, Optional
from app.providers.base import MailProvider, Message, Thread, Draft, SendResult

GRAPH_BASE = "https://graph.microsoft.com/v1.0"

class OutlookProvider(MailProvider):
    def __init__(self, access_token: str):
        self.headers = {"Authorization": f"Bearer {access_token}"}

    def list_messages(self, query: str, max_results: int = 20) -> List[Message]:
        resp = requests.get(
            f"{GRAPH_BASE}/me/messages",
            headers=self.headers,
            params={"$search": f'"{query}"', "$top": max_results}
        ).json()
        return [Message(id=m["id"], thread_id=m["conversationId"]) for m in resp.get("value", [])]

    def get_thread(self, thread_id: str) -> Thread:
        resp = requests.get(
            f"{GRAPH_BASE}/me/messages",
            headers=self.headers,
            params={"$filter": f"conversationId eq '{thread_id}'"}
        ).json()
        # Map values to dictionary expected by context caches
        messages = []
        for m in resp.get("value", []):
            messages.append({
                "id": m["id"],
                "thread_id": thread_id,
                "sender": m.get("from", {}).get("emailAddress", {}).get("address", "unknown"),
                "subject": m.get("subject", "no subject"),
                "snippet": m.get("bodyPreview", ""),
                "labels": m.get("categories", []),
                "received_at": m.get("receivedDateTime")
            })
        return Thread(id=thread_id, messages=messages)

    def create_draft(self, thread_id: str, html_body: str, subject: Optional[str]) -> Draft:
        resp = requests.post(
            f"{GRAPH_BASE}/me/messages",
            headers=self.headers,
            json={"subject": subject or "", "body": {"contentType": "HTML", "content": html_body}}
        ).json()
        return Draft(id=resp["id"], thread_id=thread_id)

    def update_draft(self, draft_id: str, html_body: str, subject: Optional[str] = None) -> Draft:
        payload = {"body": {"contentType": "HTML", "content": html_body}}
        if subject:
            payload["subject"] = subject
            
        resp = requests.patch(
            f"{GRAPH_BASE}/me/messages/{draft_id}",
            headers=self.headers,
            json=payload
        ).json()
        return Draft(id=resp["id"], thread_id=resp.get("conversationId", ""))

    def send_draft(self, draft_id: str) -> SendResult:
        requests.post(f"{GRAPH_BASE}/me/messages/{draft_id}/send", headers=self.headers)
        return SendResult(message_id=draft_id, status="sent")

    def apply_label(self, message_id: str, label: str) -> None:
        # Outlook uses "categories" rather than labels
        requests.patch(
            f"{GRAPH_BASE}/me/messages/{message_id}",
            headers=self.headers,
            json={"categories": [label]}
        )

    def get_attachment(self, message_id: str, attachment_id: str) -> Dict[str, Any]:
        resp = requests.get(
            f"{GRAPH_BASE}/me/messages/{message_id}/attachments/{attachment_id}",
            headers=self.headers
        ).json()
        return resp

    def check_if_draft_was_sent(self, draft_id: str) -> bool:
        resp = requests.get(
            f"{GRAPH_BASE}/me/messages/{draft_id}",
            headers=self.headers
        )
        return resp.status_code == 404
