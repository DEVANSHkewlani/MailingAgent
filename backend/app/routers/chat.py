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
            "time": r["received_at"].strftime("%I:%M %p") if r["received_at"] else "",
            "unread": r["category"] == "action_needed"
        }
        for r in rows
    ]

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
    
    # Store headers to thread-safe request context
    active_groq_key.set(x_groq_api_key or "")

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

    # 3. Get the compiled graph and invoke it
    from app.agents.state import ResetList
    graph = await get_compiled_graph()
    config = {"configurable": {"thread_id": conversation_id}}  # ties checkpointer to this conversation
    
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
                "groq_api_key": x_groq_api_key or ""
            },
            config=config
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent Graph Execution Failed: {str(e)}")

    # 4. Extract final aggregator text and save response to DB
    final_messages = result.get("messages", [])
    if not final_messages:
        final_text = "Done."
    else:
        # result["messages"][-1] can be a message object or dict
        last_m = final_messages[-1]
        final_text = last_m.content if hasattr(last_m, "content") else last_m.get("content", "Done.")

    await save_message(conversation_id, "assistant", final_text)
    return {"response": final_text}

