import json
from typing import List, Dict, Any, Optional
from app.db.session import get_db

MAX_TURNS = 20

async def load_recent_messages(conversation_id: str) -> List[Dict[str, Any]]:
    """Load recent message history for a conversation to inject into the graph context."""
    db = get_db()
    rows = await db.fetch(
        "SELECT role, content FROM messages WHERE conversation_id = $1 "
        "ORDER BY created_at DESC LIMIT $2",
        conversation_id, MAX_TURNS
    )
    return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]


async def save_message(conversation_id: str, role: str, content: str, entities: Optional[List[Dict[str, Any]]] = None):
    """Save a single conversation turn to the database messages history."""
    db = get_db()
    # Serialize entities to JSON string and cast to jsonb in SQL
    entities_json = json.dumps(entities or [])
    
    await db.execute(
        "INSERT INTO messages (conversation_id, role, content, referenced_entities) "
        "VALUES ($1, $2, $3, $4::jsonb)",
        conversation_id, role, content, entities_json
    )
    await db.execute("UPDATE conversations SET updated_at = now() WHERE id = $1", conversation_id)
