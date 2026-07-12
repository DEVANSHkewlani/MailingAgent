import uuid
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
    "create_cron_job": "CONFIRM",
}

async def classify(user_id: str, action_type: str, resource: str) -> str:
    db = get_db()
    # User-specific override rules take precedence over the default table
    # Cast to UUID to avoid asyncpg DataError on UUID-typed columns
    try:
        user_uuid = uuid.UUID(str(user_id))
    except (ValueError, AttributeError):
        return DEFAULT_LEVELS.get(action_type, "CONFIRM")
    rule = await db.fetchrow(
        "SELECT level, condition FROM permission_rules WHERE user_id = $1 AND action_type = $2",
        user_uuid, action_type
    )
    if rule:
        # condition matching (e.g. recipient domain) would be evaluated here
        return rule["level"]
    return DEFAULT_LEVELS.get(action_type, "CONFIRM")  # unknown actions default to CONFIRM, never AUTO


from langchain_core.runnables import RunnableConfig

async def permission_gate_node(state: MailAgentState, config: RunnableConfig) -> dict:
    from langchain_core.runnables.config import var_child_runnable_config
    var_child_runnable_config.set(config)
    
    from app.permissions.tokens import issue_token
    from app.notifications.websocket import notify_dashboard
    from app.db.session import get_db

    db = get_db()
    resolved_approvals = []
    needs_interrupt = False

    # -----------------------------------------------------------------------
    # CRON MODE: When running inside an unattended cron job, auto-approve ALL
    # actions regardless of their policy level. There is no human in the loop,
    # so we must not issue an interrupt — that would stall the cron run forever.
    # -----------------------------------------------------------------------
    if state.get("is_cron"):
        print("Permission Gate: Cron mode — auto-approving all pending actions.")
        import json
        for action in state.get("pending_approvals", []):
            if action.get("status") in ("approved", "blocked"):
                resolved_approvals.append(action)
                continue
            # Issue a token so the executor can call gated tools (send_email, create_event, etc.)
            try:
                row = await db.fetchrow(
                    "INSERT INTO approval_queue (user_id, conversation_id, action_type, resource_id, payload, agent_reasoning, expires_at) "
                    "VALUES ($1, $2, $3, $4, $5::jsonb, $6, now() + interval '1 hour') RETURNING id",
                    uuid.UUID(str(state["user_id"])),
                    state.get("conversation_id"),
                    action["type"],
                    action["resource"],
                    json.dumps(action.get("payload", {})),
                    action.get("reasoning", "cron auto-approved")
                )
                approval_id = row["id"]
                token = issue_token(approval_id, action["type"], action["resource"])
                await db.execute(
                    "UPDATE approval_queue SET confirmation_token = $1, status = 'approved' WHERE id = $2",
                    token, approval_id
                )
                action["approval_db_id"] = str(approval_id)
                action["confirmation_token"] = token
                action["status"] = "approved"
            except Exception as cron_gate_err:
                print(f"Permission Gate: Cron auto-approve failed for action {action.get('type')}: {cron_gate_err}")
                action["status"] = "approved"  # approve anyway to unblock execution
            resolved_approvals.append(action)

        from app.agents.state import ResetList
        return {"pending_approvals": ResetList(resolved_approvals)}

    # -----------------------------------------------------------------------
    # NORMAL (human-in-the-loop) MODE
    # -----------------------------------------------------------------------
    for action in state.get("pending_approvals", []):
        # Skip actions that have already been resolved (e.g. from a previous pass or resume)
        if action.get("status") in ("approved", "blocked"):
            resolved_approvals.append(action)
            continue

        # If it already has a database approval row ID, we don't need to insert it again.
        if action.get("approval_db_id"):
            resolved_approvals.append(action)
            needs_interrupt = True
            continue

        level = await classify(state["user_id"], action["type"], action["resource"])

        if level == "AUTO":
            action["status"] = "approved"
            resolved_approvals.append(action)

        elif level == "CONFIRM":
            import json
            row = await db.fetchrow(
                "INSERT INTO approval_queue (user_id, conversation_id, action_type, resource_id, payload, agent_reasoning, expires_at) "
                "VALUES ($1, $2, $3, $4, $5::jsonb, $6, now() + interval '15 minutes') RETURNING id",
                uuid.UUID(str(state["user_id"])),
                state.get("conversation_id"),
                action["type"],
                action["resource"],
                json.dumps(action.get("payload", {})),
                action.get("reasoning", "")
            )
            approval_id = row["id"]
            token = issue_token(approval_id, action["type"], action["resource"])
            await db.execute(
                "UPDATE approval_queue SET confirmation_token = $1 WHERE id = $2",
                token, approval_id
            )
            await notify_dashboard(state["user_id"], {"approval_id": str(approval_id), "action": action})
            
            # Store the approval_id and token on the action so it can be used on resume
            action["approval_db_id"] = str(approval_id)
            action["confirmation_token"] = token
            needs_interrupt = True

        elif level == "BLOCKED":
            action["status"] = "blocked"
            return {"errors": [{"action": action, "reason": "blocked_by_policy"}]}

    if needs_interrupt:
        # Pause graph execution here. The /approvals/{id}/approve route resumes
        # the graph from this exact checkpoint once the user acts.
        # When resumed, we'll re-enter this node. Check for resume signal.
        resume_data = interrupt({"pending_confirmation": True, "actions": state.get("pending_approvals", [])})
        
        # After resume: mark all CONFIRM actions as approved or rejected.
        is_approved = resume_data is None or (isinstance(resume_data, dict) and resume_data.get("approved"))
        
        # Rebuild resolved_approvals to avoid duplicate entry appending
        resolved_approvals = []
        for action in state.get("pending_approvals", []):
            if action.get("confirmation_token"):
                if is_approved:
                    action["status"] = "approved"
                    if isinstance(resume_data, dict) and "confirmation_token" in resume_data:
                        action["confirmation_token"] = resume_data["confirmation_token"]
                else:
                    action["status"] = "rejected"
            resolved_approvals.append(action)
        
    from app.agents.state import ResetList
    return {"pending_approvals": ResetList(resolved_approvals)}


def needs_human_approval(state: MailAgentState) -> str:
    """Check if any pending actions still need human confirmation."""
    pending = state.get("pending_approvals", [])
    # If there are no pending actions at all, auto-approve
    if not pending:
        return "auto_approved"
    # Check if ALL actions have been approved
    all_approved = all(a.get("status") == "approved" for a in pending)
    return "auto_approved" if all_approved else "approve_required"
