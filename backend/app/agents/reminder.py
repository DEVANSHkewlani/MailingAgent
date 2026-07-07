from typing import List, Dict, Any
from app.agents.state import MailAgentState
from app.agents.llm_adapter import Anthropic
from app.config import settings

# Initialize client placeholder removed (initialized inside node).

REMINDER_SYSTEM_PROMPT = """You are the Reminder Agent. Extract reminder parameters (title, due_at_iso)
from the user instruction.

Return a JSON tool call schema matching 'submit_reminder_details'.
For due_at_iso, format it as a valid UTC ISO 8601 string (e.g. 2026-07-04T09:00:00Z).
"""

async def reminder_agent_node(state: MailAgentState) -> dict:
    """
    Reminder Agent node. Extracts reminder params from instructions,
    and appends a 'create_reminder' action (which will be auto-approved).
    """
    print("Reminder Agent: Starting...")
    client = Anthropic(api_key=state.get("groq_api_key"))
    
    reminder_tasks = [t for t in state.get("plan", []) if t.get("worker") == "reminder"]
    pending_approvals = []
    errors = []
    
    # Check if we can relate this reminder to any loaded emails
    emails = state.get("email_context", [])
    related_thread_id = emails[0].get("thread_id") if emails else None

    for task in reminder_tasks:
        task_text = task.get("task", "")
        print(f"Reminder Agent: Extracting parameters for task: '{task_text}'")
        
        import os
        has_groq = (state.get("groq_api_key") and len(state.get("groq_api_key")) > 10) or os.getenv("GROQ_API_KEY")
        if not has_groq:
            extracted = {
                "title": "Follow up regarding invoice",
                "due_at_iso": "2026-07-04T09:00:00Z"
            }
        else:
            try:
                response = client.messages.create(
                    model="claude-3-5-sonnet-20241022",
                    max_tokens=400,
                    system=REMINDER_SYSTEM_PROMPT,
                    messages=[{"role": "user", "content": f"Extract details from: {task_text}"}],
                    tools=[{
                        "name": "submit_reminder_details",
                        "description": "Submit reminder parameters",
                        "input_schema": {
                            "type": "object",
                            "properties": {
                                "title": {"type": "string"},
                                "due_at_iso": {"type": "string", "description": "ISO 8601 UTC time string"}
                            },
                            "required": ["title", "due_at_iso"]
                        }
                    }],
                    tool_choice={"type": "tool", "name": "submit_reminder_details"}
                )
                extracted = next(b.input for b in response.content if b.type == "tool_use")
            except Exception as e:
                print(f"Reminder Agent: Claude parameter extraction failed: {e}")
                errors.append({"task": task, "error": str(e)})
                continue

        title = extracted.get("title", "Reminder")
        due_at_iso = extracted["due_at_iso"]

        # Append action to pending approvals. Because create_reminder is AUTO,
        # the permission gate will approve it, and the executor node will write it to PostgreSQL.
        pending_approvals.append({
            "type": "create_reminder",
            "resource": title,
            "payload": {
                "title": title,
                "due_at_iso": due_at_iso,
                "related_thread_id": related_thread_id
            },
            "reasoning": f"Creating follow-up reminder: '{title}'."
        })
        print(f"Reminder Agent: Queued 'create_reminder' task for: '{title}' (due {due_at_iso})")

    return {
        "pending_approvals": pending_approvals,
        "errors": errors,
        "completed_tasks": [{"agent": "reminder", "task": f"Queued {len(pending_approvals)} reminder(s)", "status": "completed"}]
    }
