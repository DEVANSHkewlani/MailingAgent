from typing import List, Dict, Any
from app.db.session import get_db
from app.agents.llm_adapter import GroqClient
from app.config import settings
from app.agents.state import MailAgentState

# Initialize client placeholder removed (initialized inside function).

async def get_or_create_summary(user_id: str, thread_id: str, thread_messages: List[Dict[str, Any]], groq_api_key: str) -> str:
    """
    Check if a cached summary exists matching the latest message ID (watermark).
    Generates a new summary using Groq if the cache is stale or missing.
    """
    db = get_db()
    if not thread_messages:
        return "No messages in thread."
        
    latest_message_id = thread_messages[-1]["id"]

    cached = await db.fetchrow(
        "SELECT summary, last_message_id FROM thread_summaries WHERE user_id = $1 AND thread_id = $2",
        user_id, thread_id
    )
    if cached and cached["last_message_id"] == latest_message_id:
        print(f"Summarizer: Found cached summary for thread {thread_id} (watermark matched).")
        return cached["summary"]  # thread hasn't advanced — skip the LLM call entirely

    print(f"Summarizer: Cache miss/stale for thread {thread_id}. Calling Groq...")
    full_text = "\n---\n".join(f"From: {m.get('sender')} | {m.get('snippet', '')}" for m in thread_messages)
    
    # Handle mock API key
    import os
    has_groq = (groq_api_key and len(groq_api_key) > 10) or os.getenv("GROQ_API_KEY")
    if not has_groq:
        summary = f"Mock summary of thread {thread_id} regarding: '{thread_messages[-1].get('snippet', '')[:50]}'"
    else:
        client = GroqClient(api_key=groq_api_key)
        response = client.messages.create(
            model="llama-3.3-70b-versatile",
            max_tokens=300,
            messages=[{"role": "user", "content": f"Summarize this email thread concisely:\n\n{full_text}"}]
        )
        summary = response.content[0].text

    await db.execute(
        "INSERT INTO thread_summaries (user_id, thread_id, summary, last_message_id) "
        "VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, thread_id) "
        "DO UPDATE SET summary = $3, last_message_id = $4, updated_at = now()",
        user_id, thread_id, summary, latest_message_id
    )
    return summary


async def summarizer_agent_node(state: MailAgentState) -> dict:
    """
    Summarizer agent node. Gathers the threads of target emails, 
    fetches thread messages from Gmail, and queries summaries.
    """
    print("Summarizer Agent: Starting...")
    from app.providers.factory import get_mail_provider

    user_id = state.get("user_id")
    if not user_id:
        return {"errors": [{"error": "Missing user_id in state"}]}

    try:
        provider = await get_mail_provider(user_id)
    except Exception as e:
        return {"errors": [{"error": f"Provider init error: {str(e)}"}]}

    # Get unique thread IDs from emails loaded in the context
    thread_ids = list({e["thread_id"] for e in state.get("email_context", []) if "thread_id" in e})
    
    summaries = []
    errors = []
    
    # Fallback to tasks if context is empty
    if not thread_ids:
        # Check plan tasks for explicit thread_ids
        for task in [t for t in state.get("plan", []) if t.get("worker") == "summarizer"]:
            # Task text might look like: "Summarize thread thread_abc"
            # Try to extract the id or look it up.
            pass

    for thread_id in thread_ids:
        try:
            print(f"Summarizer Agent: Retrieving thread {thread_id} messages...")
            thread = provider.get_thread(thread_id)
            summary = await get_or_create_summary(user_id, thread_id, thread.messages, state.get("groq_api_key", ""))
            summaries.append({"thread_id": thread_id, "summary": summary})
        except Exception as e:
            print(f"Summarizer Agent: Error summarizing thread {thread_id}: {e}")
            errors.append({"thread_id": thread_id, "error": str(e)})

    return {
        "summaries": summaries,
        "errors": errors,
        "completed_tasks": [{"agent": "summarizer", "task": f"Summarized {len(summaries)} threads", "status": "completed"}]
    }
