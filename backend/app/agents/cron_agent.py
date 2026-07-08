import json
import os
from typing import List, Dict, Any
from app.agents.state import MailAgentState
from app.agents.llm_adapter import GroqClient

CRON_SYSTEM_PROMPT = """You are the Cron Manager Agent for Mail Agent. 
Your job is to extract periodic automated task (cron job) parameters from the user request.

We need to extract:
1. prompt: the instruction the cron job should run periodically (e.g. "Check if there are any new urgent mails and alert me", "Draft reply to boss").
2. schedule_type: how the interval is defined. MUST be either:
   - 'interval_minutes': if the schedule runs at a minute interval (e.g. "every 10 minutes", "every hour").
   - 'daily': if it runs at a specific time of day (e.g. "every day at 9 AM", "daily at 14:00").
3. schedule_value: 
   - For 'interval_minutes', the duration in minutes as a string (e.g. "10", "60", "1440").
   - For 'daily', the 24-hour time formatted as 'HH:MM' (e.g. '09:00', '14:30').
4. name (optional): a short, descriptive name for the cron job (e.g. "Urgent Mail Syncer").

Respond by using the 'submit_cron_details' tool.
If the user did NOT specify an interval (how often to run) or time of day, leave schedule_type and schedule_value empty or null in the tool call. This tells the system that we need to ask the user back.
"""

async def cron_agent_node(state: MailAgentState) -> dict:
    """
    Cron Agent Node. Parses instructions to create scheduled cron tasks.
    If schedule details are missing, reports a blocked status so the conversational aggregator asks the user.
    If details are complete, appends a gated 'create_cron_job' action to pending approvals.
    """
    print("Cron Agent: Starting...")
    client = GroqClient(api_key=state.get("groq_api_key"))
    
    cron_tasks = [t for t in state.get("plan", []) if t.get("worker") == "cron_manager"]
    pending_approvals = []
    errors = []
    completed_tasks = []

    has_groq = (state.get("groq_api_key") and len(state.get("groq_api_key")) > 10) or os.getenv("GROQ_API_KEY")
    if not has_groq:
        return {
            "errors": [{"error": "Groq API Key is not set. Cannot run Cron Agent."}],
            "completed_tasks": [{"agent": "cron_manager", "task": "Cron configuration failed (no key)", "status": "blocked"}]
        }

    for task in cron_tasks:
        task_text = task.get("task", "")
        print(f"Cron Agent: Processing task '{task_text}'")
        
        try:
            response = client.messages.create(
                model="llama-3.3-70b-versatile",
                max_tokens=400,
                system=CRON_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": f"Extract details from: {task_text}"}],
                tools=[{
                    "name": "submit_cron_details",
                    "description": "Submit extracted cron job parameters",
                    "input_schema": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "prompt": {"type": "string"},
                            "schedule_type": {"type": "string", "enum": ["interval_minutes", "daily"]},
                            "schedule_value": {"type": "string"}
                        },
                        "required": ["prompt"]
                    }
                }],
                tool_choice={"type": "tool", "name": "submit_cron_details"}
            )
            
            tool_use_block = next((b for b in response.content if b.type == "tool_use"), None)
            if not tool_use_block:
                raise ValueError("LLM did not submit cron details using the required tool")
                
            extracted = tool_use_block.input
            prompt = extracted.get("prompt")
            schedule_type = extracted.get("schedule_type")
            schedule_value = extracted.get("schedule_value")
            name = extracted.get("name")
            
            if not schedule_type or not schedule_value:
                print("Cron Agent: Schedule intervals/daily time missing. Asking user back.")
                completed_tasks.append({
                    "agent": "cron_manager",
                    "task": "Extract cron schedule details",
                    "status": "blocked",
                    "message": "Missing schedule details. Prompt user to provide interval (in minutes) or daily execution time."
                })
            else:
                # Add action to pending approvals (CONFIRM gated)
                pending_approvals.append({
                    "type": "create_cron_job",
                    "resource": name or prompt[:30],
                    "payload": {
                        "name": name,
                        "prompt": prompt,
                        "schedule_type": schedule_type,
                        "schedule_value": schedule_value
                    },
                    "reasoning": f"Setup periodic task to execute '{prompt}' on schedule: {schedule_type} = {schedule_value}."
                })
                completed_tasks.append({
                    "agent": "cron_manager",
                    "task": f"Queued creation of scheduled cron job: {prompt}",
                    "status": "completed"
                })
                
        except Exception as e:
            print(f"Cron Agent: Extraction failed: {e}")
            errors.append({"task": task, "error": str(e)})

    return {
        "pending_approvals": pending_approvals,
        "completed_tasks": completed_tasks,
        "errors": errors
    }
