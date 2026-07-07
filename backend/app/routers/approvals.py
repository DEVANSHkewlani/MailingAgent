import json
from fastapi import APIRouter, Query
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
        "SELECT id::text as approval_id, action_type, payload, agent_reasoning "
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

    db = get_db()
    if edited_payload:
        await db.execute(
            "UPDATE approval_queue SET payload = $1::jsonb WHERE id = $2",
            json.dumps(edited_payload), approval_id
        )
    await db.execute("UPDATE approval_queue SET status = 'approved' WHERE id = $1", approval_id)

    # Resume the compiled graph from the exact thread_id (checkpoint)
    graph = await get_compiled_graph()
    config = {"configurable": {"thread_id": approval_id}}  # thread_id maps to approval_id for resumption
    result = await graph.ainvoke(Command(resume={"approved": True}), config=config)
    return {"status": "resumed", "result": str(result)}


@router.post("/{approval_id}/reject")
async def reject(approval_id: str):
    """Reject a pending action in the queue."""
    from app.db.session import get_db
    db = get_db()
    await db.execute("UPDATE approval_queue SET status = 'rejected', resolved_at = now() WHERE id = $1", approval_id)
    return {"status": "rejected"}
