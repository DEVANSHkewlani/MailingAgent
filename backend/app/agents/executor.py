from app.agents.state import MailAgentState
from app.tools.mail_tools import ALL_TOOLS
from app.db.session import get_db_sync

# Create a lookup dictionary for all available tools
TOOL_MAP = {t.name: t for t in ALL_TOOLS}

def tool_executor_node(state: MailAgentState) -> dict:
    """
    Executor Node. Resolves approved actions, sets database user contexts,
    runs the python tool functions, and updates results and errors in state.
    """
    print("Tool Executor: Starting...")
    db = get_db_sync()
    
    # Critical step: set current_user_id on the database session wrapper
    # so that tools like create_reminder and get_style_profile run under the correct user scope
    db.current_user_id = state.get("user_id")
    print(f"Tool Executor: DB user context set to {db.current_user_id}")

    completed_tasks = []
    draft_results = []
    calendar_results = []
    errors = []

    # Filter actions that have been approved by policy or approved/resumed by user
    approved_actions = [a for a in state.get("pending_approvals", []) if a.get("status") == "approved"]
    print(f"Tool Executor: Found {len(approved_actions)} approved action(s) to execute.")

    for action in approved_actions:
        action_type = action.get("type")
        payload = action.get("payload", {})
        
        # If the action has a confirmation token generated in the DB (for CONFIRM actions),
        # attach it to the payload so the tool can verify it
        token = action.get("confirmation_token")
        if token:
            payload["confirmation_token"] = token

        tool_item = TOOL_MAP.get(action_type)
        if not tool_item:
            err_msg = f"Unknown tool action: {action_type}"
            print(f"Tool Executor: {err_msg}")
            errors.append({"action": action, "error": err_msg})
            continue

        print(f"Tool Executor: Invoking tool '{action_type}' with payload keys: {list(payload.keys())}")
        try:
            # Execute the tool's python function directly to get the raw return dict
            result = tool_item.func(**payload)
            print(f"Tool Executor: Tool '{action_type}' executed successfully. Output: {result}")
            
            # Map tool output back into appropriate graph state lists
            if action_type in ["create_draft", "update_draft", "send_email"]:
                draft_results.append(result)
            elif action_type in ["create_event", "update_event", "cancel_event"]:
                calendar_results.append(result)
                
            completed_tasks.append({
                "agent": "executor",
                "task": f"Executed tool '{action_type}'",
                "status": "completed",
                "output": result
            })
        except Exception as e:
            err_msg = f"Tool '{action_type}' execution failed: {str(e)}"
            print(f"Tool Executor: {err_msg}")
            errors.append({"action": action, "error": str(e)})

    # Return updates to be merged into graph lists
    return {
        "completed_tasks": completed_tasks,
        "draft_results": draft_results,
        "calendar_results": calendar_results,
        "errors": errors
    }
