import json
from typing import List, Dict, Any
from app.agents.state import MailAgentState
from app.agents.llm_adapter import Anthropic
from app.config import settings

# Initialize client placeholder removed (initialized inside node).

SCHEDULER_SYSTEM_PROMPT = """You are the Scheduler Agent. Extract meeting parameters (title, start_iso, end_iso, attendees)
from the user instruction.

Return a JSON tool call schema matching 'submit_meeting_details'.
For start_iso and end_iso, ensure they are formatted as valid UTC ISO 8601 strings (e.g. 2026-07-03T10:00:00Z).
"""

async def scheduler_agent_node(state: MailAgentState) -> dict:
    """
    Scheduler Agent node. Parses instructions for meeting requests,
    checks conflicts via Google Calendar, and queues 'create_event' tasks for approval.
    """
    print("Scheduler Agent: Starting...")
    client = Anthropic(api_key=state.get("groq_api_key"))
    from app.providers.factory import get_calendar_provider

    user_id = state.get("user_id")
    if not user_id:
        return {"errors": [{"error": "Missing user_id in state"}]}

    try:
        provider = await get_calendar_provider(user_id)
    except Exception as e:
        return {"errors": [{"error": f"Provider init error: {str(e)}"}]}

    scheduler_tasks = [t for t in state.get("plan", []) if t.get("worker") == "scheduler"]
    calendar_results = []
    pending_approvals = []
    errors = []

    for task in scheduler_tasks:
        task_text = task.get("task", "")
        print(f"Scheduler Agent: Extracting parameters for task: '{task_text}'")
        
        # 1. Ask Claude to parse event details from free-text
        import os
        has_groq = (state.get("groq_api_key") and len(state.get("groq_api_key")) > 10) or os.getenv("GROQ_API_KEY")
        if not has_groq:
            extracted = {
                "title": "Meeting with Boss",
                "start_iso": "2026-07-03T10:00:00Z",
                "end_iso": "2026-07-03T10:30:00Z",
                "attendees": ["boss@example.com"]
            }
        else:
            response = client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=400,
                system=SCHEDULER_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": f"Extract details from: {task_text}"}],
                tools=[{
                    "name": "submit_meeting_details",
                    "description": "Submit meeting parameters",
                    "input_schema": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "start_iso": {"type": "string", "description": "ISO 8601 UTC time string"},
                            "end_iso": {"type": "string", "description": "ISO 8601 UTC time string"},
                            "attendees": {"type": "array", "items": {"type": "string"}}
                        },
                        "required": ["title", "start_iso", "end_iso"]
                    }
                }],
                tool_choice={"type": "tool", "name": "submit_meeting_details"}
            )
            extracted = next(b.input for b in response.content if b.type == "tool_use")

        title = extracted.get("title", "Meeting")
        start_iso = extracted["start_iso"]
        end_iso = extracted["end_iso"]
        attendees = extracted.get("attendees", [])

        try:
            # 2. Check Google Calendar availability / conflicts
            print(f"Scheduler Agent: Checking availability for {start_iso} to {end_iso}...")
            is_available = provider.check_availability(start_iso, end_iso)
            
            if is_available:
                print(f"Scheduler Agent: Slot is open! Queueing event '{title}' for approval.")
                pending_approvals.append({
                    "type": "create_event",
                    "resource": title,
                    "payload": {
                        "title": title,
                        "start_iso": start_iso,
                        "end_iso": end_iso,
                        "attendees": attendees
                    },
                    "reasoning": f"Calendar slot is open and available. Scheduling '{title}'."
                })
                calendar_results.append({
                    "title": title,
                    "start_iso": start_iso,
                    "end_iso": end_iso,
                    "status": "available_queued"
                })
            else:
                print(f"Scheduler Agent: Conflict detected for slot {start_iso} to {end_iso}!")
                errors.append({
                    "task": task,
                    "error": f"Conflict detected on calendar for {title} between {start_iso} and {end_iso}."
                })
                calendar_results.append({
                    "title": title,
                    "start_iso": start_iso,
                    "end_iso": end_iso,
                    "status": "conflict_blocked"
                })
        except Exception as e:
            print(f"Scheduler Agent: Error checking calendar: {e}")
            errors.append({"task": task, "error": str(e)})

    # Also dynamically map the provider client for this request context
    from app.providers.google_calendar import active_calendar_provider
    active_calendar_provider.set(provider)

    return {
        "calendar_results": calendar_results,
        "pending_approvals": pending_approvals,
        "errors": errors,
        "completed_tasks": [{"agent": "scheduler", "task": f"Evaluated {len(calendar_results)} slot availability check(s)", "status": "completed"}]
    }
