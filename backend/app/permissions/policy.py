from langgraph.types import interrupt
from app.agents.state import MailAgentState
from app.db.session import get_db

DEFAULT_LEVELS = {
    "list_emails": "AUTO",
    "get_thread": "AUTO",
    "apply_label": "AUTO",
    "create_draft": "AUTO",
    "create_reminder": "AUTO",
    "send_email": "CONFIRM",
    "create_event": "CONFIRM",
    "update_event": "CONFIRM",
}

async def classify(user_id: str, action_type: str, resource: str) -> str:
    db = get_db()
    # User-specific override rules take precedence over the default table
    rule = await db.fetchrow(
        "SELECT level, condition FROM permission_rules WHERE user_id = $1 AND action_type = $2",
        user_id, action_type
    )
    if rule:
        # condition matching (e.g. recipient domain) would be evaluated here
        return rule["level"]
    return DEFAULT_LEVELS.get(action_type, "CONFIRM")  # unknown actions default to CONFIRM, never AUTO


async def permission_gate_node(state: MailAgentState) -> dict:
    from app.permissions.tokens import issue_token
    from app.notifications.websocket import notify_dashboard
    from app.db.session import get_db

    db = get_db()
    resolved_approvals = []

    for action in state.get("pending_approvals", []):
        level = await classify(state["user_id"], action["type"], action["resource"])

        if level == "AUTO":
            action["status"] = "approved"
            resolved_approvals.append(action)

        elif level == "CONFIRM":
            import json
            row = await db.fetchrow(
                "INSERT INTO approval_queue (user_id, action_type, resource_id, payload, agent_reasoning, expires_at) "
                "VALUES ($1, $2, $3, $4::jsonb, $5, now() + interval '15 minutes') RETURNING id",
                state["user_id"], action["type"], action["resource"],
                json.dumps(action.get("payload", {})), action.get("reasoning", "")
            )
            approval_id = row["id"]
            token = issue_token(approval_id, action["type"], action["resource"])
            await db.execute(
                "UPDATE approval_queue SET confirmation_token = $1 WHERE id = $2",
                token, approval_id
            )
            await notify_dashboard(state["user_id"], {"approval_id": str(approval_id), "action": action})
            # Pause graph execution here. The /approvals/{id}/approve route resumes
            # the graph from this exact checkpoint once the user acts.
            interrupt({"approval_id": str(approval_id), "action": action})

        elif level == "BLOCKED":
            action["status"] = "blocked"
            return {"errors": [{"action": action, "reason": "blocked_by_policy"}]}

    return {"pending_approvals": resolved_approvals}


def needs_human_approval(state: MailAgentState) -> str:
    pending = [a for a in state.get("pending_approvals", []) if a.get("status") != "approved"]
    return "approve_required" if pending else "auto_approved"
