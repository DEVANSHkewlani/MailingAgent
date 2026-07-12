from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from app.agents.memory import load_recent_messages, save_message
from app.agents.graph import get_compiled_graph

router = APIRouter(prefix="/chat", tags=["chat"])

class MessageInput(BaseModel):
    user_id: str
    instruction: str

@router.get("/conversations")
async def list_conversations(user_id: str):
    """List recent conversation sessions for a user."""
    from app.db.session import get_db
    from uuid import UUID
    db = get_db()
    user_uuid = UUID(user_id)
    rows = await db.fetch(
        "SELECT id::text as conversation_id, title, updated_at "
        "FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC",
        user_uuid
    )
    return [dict(r) for r in rows]

@router.post("/conversations")
async def create_conversation(payload: Dict[str, Any]):
    """Create a new conversation record in the database."""
    from app.db.session import get_db
    db = get_db()
    conv_id = payload.get("conversation_id")
    user_id = payload.get("user_id")
    title = payload.get("title", "New Chat")
    await db.execute(
        "INSERT INTO conversations (id, user_id, title) VALUES ($1, $2, $3) "
        "ON CONFLICT (id) DO NOTHING",
        conv_id, user_id, title
    )
    return {"conversation_id": conv_id}

@router.get("/{conversation_id}/messages")
async def get_messages(conversation_id: str):
    """Retrieve message history for a conversation thread."""
    from app.db.session import get_db
    db = get_db()
    rows = await db.fetch(
        "SELECT role, content FROM messages "
        "WHERE conversation_id = $1 ORDER BY created_at ASC",
        conversation_id
    )
    return [dict(r) for r in rows]

@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: str):
    """Delete a conversation and its messages from database."""
    from app.db.session import get_db
    db = get_db()
    await db.execute("DELETE FROM messages WHERE conversation_id = $1", conversation_id)
    await db.execute("DELETE FROM conversations WHERE id = $1", conversation_id)
    return {"status": "deleted"}

@router.get("/emails")
async def list_emails(user_id: str, limit: int = 20):
    """Retrieve synced emails from the local cache database."""
    from app.db.session import get_db
    from uuid import UUID
    db = get_db()
    user_uuid = UUID(user_id)
    rows = await db.fetch(
        "SELECT id::text, sender, subject, snippet, category, received_at "
        "FROM email_cache WHERE user_id = $1 ORDER BY received_at DESC LIMIT $2",
        user_uuid, limit
    )
    return [
        {
            "id": r["id"],
            "from": r["sender"] or "unknown",
            "subject": r["subject"] or "(no subject)",
            "preview": r["snippet"] or "",
            "time": r["received_at"].isoformat() if r["received_at"] else "",
            "unread": r["category"] == "action_needed"
        }
        for r in rows
    ]

@router.get("/emails/{email_id}/body")
async def get_email_body(email_id: str, user_id: str):
    """Retrieve the full text body of an email dynamically from the provider client."""
    from app.db.session import get_db
    from uuid import UUID
    from app.providers.factory import get_mail_provider_async
    
    db = get_db()
    try:
        email_uuid = UUID(email_id)
        user_uuid = UUID(user_id)
    except ValueError:
        return {"body": "Invalid email ID or user ID format."}
        
    row = await db.fetchrow(
        "SELECT provider_message_id FROM email_cache WHERE id = $1 AND user_id = $2",
        email_uuid, user_uuid
    )
    if not row:
        return {"body": "Email not found in local cache database."}
        
    provider_msg_id = row["provider_message_id"]
    try:
        provider = await get_mail_provider_async(user_id)
        body = provider.get_message_body(provider_msg_id)
        return {"body": body or "No body content available."}
    except Exception as e:
        return {"body": f"Could not retrieve email body: {str(e)}"}

@router.get("/alerts")
async def list_alerts(user_id: str):
    """Retrieve calendar events and follow-up reminders from database."""
    from app.db.session import get_db
    from uuid import UUID
    db = get_db()
    user_uuid = UUID(user_id)
    
    calendar_rows = await db.fetch(
        "SELECT title, start_at FROM calendar_events WHERE user_id = $1 ORDER BY start_at DESC LIMIT 10",
        user_uuid
    )
    reminder_rows = await db.fetch(
        "SELECT title, due_at FROM reminders WHERE user_id = $1 ORDER BY due_at DESC LIMIT 10",
        user_uuid
    )
    
    alerts = []
    for r in calendar_rows:
        time_str = r["start_at"].strftime("%a, %I:%M %p") if r["start_at"] else "Upcoming"
        alerts.append({
            "id": f"cal-{r['title']}",
            "type": "calendar",
            "message": f"This event [{r['title']}] is scheduled for {time_str} in your Google Calendar.",
            "time": "Synced"
        })
        
    for r in reminder_rows:
        time_str = r["due_at"].strftime("%a, %I:%M %p") if r["due_at"] else "Open"
        alerts.append({
            "id": f"rem-{r['title']}",
            "type": "reminder",
            "message": f"Follow-up Nudge: {r['title']} (Due: {time_str})",
            "time": "Active"
        })
        
    return alerts


@router.get("/drafts")
async def list_drafts(user_id: str, limit: int = 20):
    """Retrieve drafts created by the agent from the local drafts table."""
    from app.db.session import get_db
    from uuid import UUID
    db = get_db()
    user_uuid = UUID(user_id)
    rows = await db.fetch(
        "SELECT id::text, thread_id, provider_draft_id, body_markdown, status, created_by_agent, created_at "
        "FROM drafts WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
        user_uuid, limit
    )
    return [
        {
            "id": r["id"],
            "thread_id": r["thread_id"],
            "provider_draft_id": r["provider_draft_id"],
            "body_preview": (r["body_markdown"] or "")[:200],
            "status": r["status"],
            "created_by": r["created_by_agent"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else ""
        }
        for r in rows
    ]


@router.post("/{conversation_id}/message")
async def send_message(
    conversation_id: str,
    payload: MessageInput,
    x_groq_api_key: Optional[str] = Header(None)
):
    """
    Receive message instructions from the frontend chat UI, run memory loops,
    invoke the LangGraph multi-agent core, and save the assistant response.
    """
    from app.agents.llm_adapter import active_groq_key
    from app.db.session import get_db
    from uuid import UUID
    db = get_db()
    
    db_groq_key = ""
    try:
        user_uuid = UUID(payload.user_id)
        user_row = await db.fetchrow("SELECT groq_api_key FROM users WHERE id = $1", user_uuid)
        if user_row and user_row["groq_api_key"]:
            from cryptography.fernet import Fernet
            from app.config import settings
            fernet = Fernet(settings.token_encryption_key.encode())
            db_groq_key = fernet.decrypt(user_row["groq_api_key"].encode()).decode()
    except Exception as e:
        print(f"Chat Router: Failed to decrypt user Groq key: {e}")

    api_key_to_use = db_groq_key or x_groq_api_key or ""
    active_groq_key.set(api_key_to_use)

    user_id = payload.user_id
    instruction = payload.instruction

    # 1. Save user query to db history
    await save_message(conversation_id, "user", instruction)
    
    # Auto-summarize conversation title if it is a default placeholder
    from app.db.session import get_db
    db = get_db()
    conv_row = await db.fetchrow("SELECT title FROM conversations WHERE id = $1", conversation_id)
    if conv_row and (conv_row["title"].startswith("Chat ") or conv_row["title"] == "New Chat" or conv_row["title"] == "Inbox Command"):
        words = instruction.split()[:4]
        summary_title = " ".join(words) + ("..." if len(instruction.split()) > 4 else "")
        await db.execute("UPDATE conversations SET title = $1 WHERE id = $2", summary_title, conversation_id)
    
    # 2. Load context message history
    history = await load_recent_messages(conversation_id)

    # 3. Get the compiled graph and invoke/resume it
    from app.agents.state import ResetList
    from uuid import UUID
    import json
    import os
    graph = await get_compiled_graph()
    config = {"configurable": {"thread_id": conversation_id}}  # ties checkpointer to this conversation
    
    # Check if the thread is currently interrupted at permission gate
    state = await graph.aget_state(config)
    resumed = False
    
    if state.next:
        pending_actions = [a for a in state.values.get("pending_approvals", []) if a.get("status") != "approved"]
        if pending_actions:
            from app.agents.llm_adapter import GroqClient
            client = GroqClient(api_key=x_groq_api_key or "")
            
            classify_prompt = (
                f"User Instruction: \"{instruction}\"\n\n"
                f"We have the following actions pending approval:\n"
                f"{json.dumps(pending_actions, indent=2)}\n\n"
                f"Classify the user's response into one of these categories:\n"
                f"- APPROVE: The user is explicitly or implicitly approving the pending actions (e.g., 'yes', 'do it', 'send', 'send it', 'book', 'go ahead', 'looks good', 'confirm').\n"
                f"- REJECT: The user is explicitly rejecting or cancelling the actions (e.g., 'no', 'stop', 'don't send', 'cancel', 'reject').\n"
                f"- EDIT: The user is trying to change the details of the email/event (e.g., 'change the email to say X', 'reschedule to 3pm').\n"
                f"- NEW: The user is asking a completely unrelated question or starting a new request.\n\n"
                f"Respond ONLY with a JSON object: {{\"classification\": \"APPROVE|REJECT|EDIT|NEW\"}}"
            )
            try:
                response = client.messages.create(
                    model="llama-3.3-70b-versatile",
                    max_tokens=50,
                    messages=[{"role": "user", "content": classify_prompt}]
                )
                import re
                match = re.search(r'\{.*\}', response.content[0].text, re.DOTALL)
                classification = "NEW"
                if match:
                    classification = json.loads(match.group()).get("classification", "NEW")
                
                print(f"Chat Router: Classified user instruction as: '{classification}'")
                
                if classification == "APPROVE":
                    for action in pending_actions:
                        approval_id = action.get("approval_db_id")
                        if approval_id:
                            await db.execute(
                                "UPDATE approval_queue SET status = 'approved', resolved_at = now() WHERE id = $1",
                                UUID(approval_id)
                            )
                            if action["type"] == "send_email":
                                draft_id = action["payload"].get("draft_id") or action.get("resource")
                                if draft_id:
                                    await db.execute("UPDATE drafts SET status = 'approved' WHERE id = $1", UUID(str(draft_id)))
                    
                    from langgraph.types import Command
                    result = await graph.ainvoke(Command(resume={"approved": True}), config=config)
                    resumed = True
                elif classification == "REJECT":
                    for action in pending_actions:
                        approval_id = action.get("approval_db_id")
                        if approval_id:
                            await db.execute(
                                "UPDATE approval_queue SET status = 'rejected', resolved_at = now() WHERE id = $1",
                                UUID(approval_id)
                            )
                    
                    from langgraph.types import Command
                    result = await graph.ainvoke(Command(resume={"approved": False}), config=config)
                    resumed = True
                else:
                    # EDIT or NEW: Mark previous actions as rejected in DB so they don't stay pending
                    for action in pending_actions:
                        approval_id = action.get("approval_db_id")
                        if approval_id:
                            await db.execute(
                                "UPDATE approval_queue SET status = 'rejected', resolved_at = now() WHERE id = $1",
                                UUID(approval_id)
                            )
            except Exception as e:
                print(f"Chat Router: Error processing conversational approval: {e}")

    if not resumed:
        try:
            result = await graph.ainvoke(
                {
                    "user_id": user_id,
                    "conversation_id": conversation_id,
                    "instruction": instruction,
                    "messages": history,
                    "plan": [],
                    "active_tasks": ResetList(),
                    "completed_tasks": ResetList(),
                    "pending_approvals": ResetList(),
                    "email_context": ResetList(),
                    "draft_results": ResetList(),
                    "calendar_results": ResetList(),
                    "summaries": ResetList(),
                    "errors": ResetList(),
                    "groq_api_key": api_key_to_use
                },
                config=config
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Agent Graph Execution Failed: {str(e)}")

    # 4. Extract final aggregator text and save response to DB
    pending = [a for a in result.get("pending_approvals", []) if a.get("status") != "approved"]
    if pending:
        from app.agents.llm_adapter import GroqClient
        groq_api_key = api_key_to_use
        has_groq = (groq_api_key and len(groq_api_key) > 10) or os.getenv("GROQ_API_KEY")
        
        if has_groq:
            try:
                client = GroqClient(api_key=groq_api_key)
                prompt = (
                    f"User Instruction: \"{instruction}\"\n\n"
                    f"We have prepared the following actions that require approval:\n"
                    f"{json.dumps(pending, indent=2)}\n\n"
                    f"Write a friendly, conversational, and helpful response to the user. "
                    f"Acknowledge what actions you have prepared (e.g. reply draft or calendar event), "
                    f"briefly summarize what they contain, and ask the user to review and approve them "
                    f"either by replying in chat or checking the 'Approvals & Drafts' tab. "
                    f"Keep the tone professional, concise, and natural. Use Markdown."
                )
                response = client.messages.create(
                    model="llama-3.3-70b-versatile",
                    max_tokens=512,
                    messages=[{"role": "user", "content": prompt}]
                )
                final_text = response.content[0].text
            except Exception as e:
                print(f"Chat Router: Conversational approval prompt failed: {e}")
                has_groq = False
                
        if not has_groq:
            lines = ["I prepared the action below and need your approval before I execute it:"]
            for action in pending:
                payload = action.get("payload", {})
                if action["type"] == "send_email":
                    lines.append(f"- Send the draft reply to {payload.get('to', 'the recipient')} about \"{payload.get('subject', 'the thread')}\".")
                elif action["type"] == "create_event":
                    lines.append(f"- Create \"{payload.get('title', 'Calendar event')}\" from {payload.get('start_iso', 'the requested start')} to {payload.get('end_iso', 'the requested end')}.")
                else:
                    lines.append(f"- {action['type'].replace('_', ' ')}")
            lines.append("Review it in **Approvals & Drafts**. I will only send or book it after you approve.")
            final_text = "\n".join(lines)
    else:
        final_messages = result.get("messages", [])
        if not final_messages:
            final_text = "Done."
        else:
            last_m = final_messages[-1]
            final_text = last_m.content if hasattr(last_m, "content") else last_m.get("content", "Done.")

    await save_message(conversation_id, "assistant", final_text)
    return {"response": final_text}
