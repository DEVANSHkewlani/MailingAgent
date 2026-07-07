from app.agents.state import MailAgentState

# Map common supervisor task descriptions to Gmail-compatible search queries
QUERY_MAPPINGS = {
    "read": "in:inbox newer_than:7d",
    "sync": "in:inbox newer_than:7d",
    "fetch": "in:inbox newer_than:7d",
    "recent": "in:inbox newer_than:7d",
    "inbox": "in:inbox newer_than:7d",
    "unread": "is:unread in:inbox",
    "starred": "is:starred",
    "important": "is:important newer_than:7d",
    "sent": "in:sent newer_than:7d",
}

def normalize_gmail_query(task_text: str) -> str:
    """Convert a supervisor task description into a proper Gmail search query.
    
    The supervisor LLM often returns verbose descriptions like 
    'fetch emails matching the user's mail sync criteria' which Gmail doesn't understand.
    We normalize these into proper Gmail search operators.
    """
    lower = task_text.lower().strip()
    
    # Check for direct Gmail query operators already present
    gmail_operators = ["in:", "is:", "from:", "to:", "subject:", "has:", "newer_than:", "older_than:", "after:", "before:"]
    if any(op in lower for op in gmail_operators):
        return task_text  # Already a valid Gmail query
    
    # Match against known patterns
    for keyword, gmail_query in QUERY_MAPPINGS.items():
        if keyword in lower:
            return gmail_query
    
    # Default: just fetch recent inbox emails
    return "in:inbox newer_than:7d"


async def reader_agent_node(state: MailAgentState) -> dict:
    """
    Reader Agent node. Loads Gmail credentials, searches emails matching 
    the supervisor tasks, and compiles the email metadata context list.
    """
    print("Reader Agent: Starting...")
    from app.providers.factory import get_mail_provider
    
    user_id = state.get("user_id")
    if not user_id:
        print("Reader Agent: No user_id provided in state. Returning empty.")
        return {"errors": [{"error": "Missing user_id in state"}]}

    try:
        provider = await get_mail_provider(user_id)
    except Exception as e:
        print(f"Reader Agent: Failed to initialize provider client: {e}")
        return {"errors": [{"error": f"Provider init error: {str(e)}"}]}

    results, errors = [], []
    # Find all tasks assigned to the reader in the supervisor plan
    reader_tasks = [t for t in state.get("plan", []) if t.get("worker") == "reader"]
    
    for task in reader_tasks:
        raw_task = task.get("task", "")
        query = normalize_gmail_query(raw_task)
        print(f"Reader Agent: Task '{raw_task}' → Gmail query: '{query}'")
        try:
            messages = provider.search(query=query, max_results=10)
            results.extend(messages)
            print(f"Reader Agent: Successfully retrieved {len(messages)} messages")
        except Exception as e:
            print(f"Reader Agent: Search query failed: {e}")
            errors.append({"task": task, "error": str(e)})

    # Also dynamically map the provider client for this async request thread context
    from app.providers.gmail import active_mail_provider
    active_mail_provider.set(provider)

    # Insert emails into the local database cache for frontend retrieval
    from app.db.session import get_db
    from uuid import UUID
    import datetime
    
    db = get_db()
    user_uuid = UUID(user_id)
    inserted_count = 0
    
    for msg in results:
        try:
            existing = await db.fetchrow(
                "SELECT id FROM email_cache WHERE user_id = $1 AND provider_message_id = $2",
                user_uuid, msg["id"]
            )
            if not existing:
                await db.execute(
                    "INSERT INTO email_cache (user_id, provider_message_id, thread_id, sender, subject, snippet, received_at) "
                    "VALUES ($1, $2, $3, $4, $5, $6, $7)",
                    user_uuid, msg["id"], msg["thread_id"], msg["sender"], msg["subject"], msg["snippet"],
                    msg.get("received_at") or datetime.datetime.now(datetime.timezone.utc)
                )
                inserted_count += 1
        except Exception as e:
            print(f"Reader Agent: DB insert error for message {msg.get('id')}: {e}")

    print(f"Reader Agent: Cached {inserted_count} new emails (total fetched: {len(results)})")

    return {
        "email_context": results,
        "errors": errors,
        "completed_tasks": [{"agent": "reader", "task": f"Read {len(results)} emails", "status": "completed"}]
    }
