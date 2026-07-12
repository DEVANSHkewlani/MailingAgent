import json
from fastapi import APIRouter, Query, HTTPException
from typing import Optional, Dict, Any, List
from langgraph.types import Command

router = APIRouter(prefix="/approvals", tags=["approvals"])

@router.get("")
async def list_approvals(user_id: str, status: str = "pending") -> List[Dict[str, Any]]:
    """List approvals from the queue filtered by user and status."""
    from app.db.session import get_db
    from uuid import UUID
    db = get_db()
    user_uuid = UUID(user_id)
    rows = await db.fetch(
        "SELECT id::text as approval_id, conversation_id::text, action_type, payload, agent_reasoning "
        "FROM approval_queue WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC",
        user_uuid, status
    )
    # asyncpg resolves jsonb columns directly into python dictionaries/lists, so we can convert rows to dict
    return [dict(r) for r in rows]


@router.post("/{approval_id}/approve")
async def approve(approval_id: str, edited_payload: Optional[Dict[str, Any]] = None):
    """Approve a pending action and resume the LangGraph multi-agent execution."""
    from app.db.session import get_db
    from app.agents.graph import get_compiled_graph
    from uuid import UUID

    db = get_db()
    approval_uuid = UUID(approval_id)
    approval_row = await db.fetchrow(
        "SELECT user_id, conversation_id::text, action_type, resource_id, payload, confirmation_token, status "
        "FROM approval_queue WHERE id = $1",
        approval_uuid
    )
    if not approval_row:
        raise HTTPException(status_code=404, detail="Approval not found")

    if approval_row["status"] != "pending":
        return {"status": approval_row["status"], "result": "Approval has already been resolved"}

    payload = edited_payload if edited_payload is not None else approval_row["payload"]
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except Exception:
            pass

    await db.execute(
        "UPDATE approval_queue SET payload = $1::jsonb, status = 'approved', resolved_at = now() WHERE id = $2",
        json.dumps(payload), approval_uuid
    )

    if approval_row["action_type"] == "send_email":
        draft_id = (payload.get("draft_id") if isinstance(payload, dict) else None) or approval_row["resource_id"]
        if not draft_id:
            raise HTTPException(status_code=400, detail="send_email approval is missing draft_id")

        draft_uuid = UUID(str(draft_id))
        if edited_payload and "body" in edited_payload:
            from app.style.render import render_styled_html
            from app.providers.factory import get_mail_provider

            draft_row = await db.fetchrow(
                "SELECT user_id::text, provider_draft_id, thread_id, style_profile_id::text FROM drafts WHERE id = $1",
                draft_uuid
            )
            if not draft_row:
                raise HTTPException(status_code=404, detail="Draft not found")

            style_row = None
            if draft_row["style_profile_id"]:
                style_row = await db.fetchrow(
                    "SELECT id::text, name, signature_html, font_family, font_size, accent_color, tone "
                    "FROM style_profiles WHERE id = $1::uuid",
                    draft_row["style_profile_id"]
                )
            style_details = {
                "id": style_row["id"] if style_row else None,
                "name": style_row["name"] if style_row else "Default",
                "signature_html": style_row["signature_html"] if style_row else "",
                "font_family": style_row["font_family"] if style_row else "Arial",
                "font_size": style_row["font_size"] if style_row else 11,
                "accent_color": style_row["accent_color"] if style_row else "#000000",
                "tone": style_row["tone"] if style_row else "neutral",
            }
            body_html = render_styled_html(edited_payload["body"], style_details)
            provider = await get_mail_provider(str(draft_row["user_id"]))
            subject = payload.get("subject") if isinstance(payload, dict) else None
            provider.update_draft(draft_row["provider_draft_id"], body_html, subject)
            await db.execute(
                "UPDATE drafts SET body_markdown = $1, body_html = $2 WHERE id = $3",
                edited_payload["body"], body_html, draft_uuid
            )

        await db.execute("UPDATE drafts SET status = 'approved' WHERE id = $1", draft_uuid)

    thread_id = approval_row["conversation_id"]
    if not thread_id:
        return {"status": "approved", "result": "Approval stored, but no source conversation was recorded to resume"}

    # Resume the compiled graph from the conversation's checkpoint.
    # Pass the groq_api_key from user settings so the resumed graph has LLM access for the aggregator.
    # Pass approved=True plus user context so the executor can reinitialise provider ContextVars.
    graph = await get_compiled_graph()
    config = {"configurable": {"thread_id": thread_id}}
    
    db_groq_key = ""
    try:
        user_row = await db.fetchrow("SELECT groq_api_key FROM users WHERE id = $1", approval_row["user_id"])
        if user_row and user_row["groq_api_key"]:
            from cryptography.fernet import Fernet
            from app.config import settings
            fernet = Fernet(settings.token_encryption_key.encode())
            db_groq_key = fernet.decrypt(user_row["groq_api_key"].encode()).decode()
    except Exception as e:
        print(f"Approvals Router: Failed to decrypt user Groq key: {e}")
        
    resume_payload = {
        "approved": True,
        "user_id": str(approval_row["user_id"]),
        "groq_api_key": db_groq_key,
    }

    try:
        result = await graph.ainvoke(Command(resume=resume_payload), config=config)
        # result may be an interrupt state if multiple approvals are pending; handle gracefully
        if isinstance(result, dict):
            msgs = result.get("messages", [])
            last_msg = msgs[-1] if msgs else None
            summary = last_msg.content if hasattr(last_msg, "content") else str(last_msg) if last_msg else "Done"
        else:
            summary = "Done"
        return {"status": "resumed", "result": summary}
    except Exception as e:
        print(f"Approval resume error: {e}")
        return {"status": "approved", "note": f"Action approved but graph resume encountered: {str(e)}"}


@router.post("/{approval_id}/reject")
async def reject(approval_id: str):
    """Reject a pending action in the queue."""
    from app.db.session import get_db
    from uuid import UUID
    db = get_db()
    await db.execute("UPDATE approval_queue SET status = 'rejected', resolved_at = now() WHERE id = $1", UUID(approval_id))
    return {"status": "rejected"}
