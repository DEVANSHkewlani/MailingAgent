from app.agents.llm_adapter import GroqClient
from app.config import settings
from app.agents.state import MailAgentState, ResetList

# Instantiate client placeholder removed (initialized inside node).

SUPERVISOR_SYSTEM_PROMPT = """You are the Supervisor for Mail Agent, a multi-agent email
assistant. Given the user's instruction and recent conversation history, decide which
worker agents need to run and what each should do.

Available workers:
- reader: fetch emails/threads. IMPORTANT: The "task" for reader MUST be a valid Gmail search query (e.g. "in:inbox newer_than:7d", "is:unread", "from:boss@company.com", "subject:invoice"). Do NOT write natural language descriptions.
- categorizer: assign category labels to emails (task can be natural language)
- summarizer: summarize emails or threads (task can be natural language)
- drafter: write a reply draft (task can be natural language with tone/style)
- scheduler: detect meeting intent, create calendar events (task can be natural language)
- reminder: create follow-up reminders (task can be natural language)
- cron_manager: create or register periodic automated tasks or cron jobs (task can be natural language, e.g. 'Sync emails and alert me every 10 minutes')

Return a JSON plan: a list of {"worker": "<name>", "task": "<specific instruction>"}. 
Only include workers actually needed for this instruction.
For "sync my mails/emails/inbox" type requests, use reader with query "in:inbox newer_than:7d" and categorizer.
CRITICAL: If the user's instruction asks to reply, draft, summarize, categorise, or check specific existing emails/threads, you MUST ALWAYS include the `reader` worker in the plan first to fetch the target emails (e.g. using 'from:github' or 'subject:alert' as the reader task query). Do not assume emails are already loaded in state context.
CRITICAL: If the user is asking to draft/write a NEW standalone email to a specific person or email address (e.g., 'Draft a mail to test@gmail.com...', 'Write an email to...'), do NOT include the `reader` worker. Instead, include ONLY the `drafter` worker. Do not try to read or fetch emails when writing a brand new message."""


def fallback_plan(instruction: str) -> list[dict]:
    import re
    lower = instruction.lower()
    plan: list[dict] = []
    
    # Check for cron jobs first
    if any(word in lower for word in ["cron", "periodically", "every", "hourly", "daily", "weekly"]):
        plan.append({"worker": "cron_manager", "task": instruction})
        return plan

    has_email_address = bool(re.search(r'[\w\.-]+@[\w\.-]+\.\w+', instruction))
    is_new_email = has_email_address and any(word in lower for word in ["draft", "write", "send", "compose", "mail", "email"])

    needs_mail = any(word in lower for word in ["email", "mail", "inbox", "reply", "draft", "summarize", "summarise", "categorize", "categorise"])
    if needs_mail and not is_new_email:
        query = "in:inbox newer_than:7d"
        if "unread" in lower:
            query = "is:unread in:inbox"
        plan.append({"worker": "reader", "task": query})
    if any(word in lower for word in ["reply", "draft", "send", "mail", "email", "compose", "write"]):
        plan.append({"worker": "drafter", "task": instruction})
    if any(word in lower for word in ["summarize", "summarise", "summary"]):
        plan.append({"worker": "summarizer", "task": instruction})
    if any(word in lower for word in ["categorize", "categorise", "label", "classify"]) and not is_new_email:
        plan.append({"worker": "categorizer", "task": instruction})
    if any(word in lower for word in ["calendar", "meeting", "schedule", "event", "invite"]):
        plan.append({"worker": "scheduler", "task": instruction})
    if any(word in lower for word in ["remind", "follow up", "follow-up"]):
        plan.append({"worker": "reminder", "task": instruction})
    return plan or [{"worker": "reader", "task": "in:inbox newer_than:7d"}]

def supervisor_node(state: MailAgentState) -> dict:
    client = GroqClient(api_key=state.get("groq_api_key"))
    history_text_list = []
    for m in state.get("messages", [])[-20:]:
        if hasattr(m, "type") and hasattr(m, "content"):
            role = m.type
            content = m.content
        elif isinstance(m, dict):
            role = m.get("role")
            content = m.get("content")
        else:
            role = "unknown"
            content = str(m)
        history_text_list.append(f"{role}: {content}")
    history_text = "\n".join(history_text_list)
    
    # Check if a Groq key is configured (either in the request payload or as an environment fallback)
    import os
    has_groq = (state.get("groq_api_key") and len(state.get("groq_api_key")) > 10) or os.getenv("GROQ_API_KEY")
    
    def make_response(plan):
        return {
            "plan": plan,
            "active_tasks": ResetList(),
            "completed_tasks": ResetList(),
            "pending_approvals": ResetList(),
            "email_context": ResetList(),
            "draft_results": ResetList(),
            "calendar_results": ResetList(),
            "summaries": ResetList(),
            "errors": ResetList(),
        }

    if not has_groq:
        print("Warning: Groq API Key is not set. Returning deterministic fallback plan.")
        return make_response(fallback_plan(state["instruction"]))

    try:
        response = client.messages.create(
            model="llama-3.3-70b-versatile",
            max_tokens=1024,
            system=SUPERVISOR_SYSTEM_PROMPT,
            messages=[{
                "role": "user",
                "content": f"Recent conversation:\n{history_text}\n\nNew instruction: {state['instruction']}"
            }],
            tools=[{
                "name": "submit_plan",
                "description": "Submit the decomposed task plan",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "plan": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "worker": {"type": "string", "enum": [
                                        "reader", "categorizer", "summarizer",
                                        "drafter", "scheduler", "reminder",
                                        "cron_manager"
                                    ]},
                                    "task": {"type": "string"}
                                },
                                "required": ["worker", "task"]
                            }
                        }
                    },
                    "required": ["plan"]
                }
            }],
            tool_choice={"type": "tool", "name": "submit_plan"}
        )
        
        # Try to extract plan from tool_use content blocks
        tool_blocks = [b for b in response.content if b.type == "tool_use"]
        if tool_blocks:
            plan = tool_blocks[0].input["plan"]
            return make_response(plan)
        
        # Fallback: try to parse JSON from text response
        import json
        text_blocks = [b for b in response.content if b.type == "text"]
        if text_blocks:
            text = text_blocks[0].text
            # Try to extract JSON array from the text
            import re
            json_match = re.search(r'\[.*\]', text, re.DOTALL)
            if json_match:
                plan = json.loads(json_match.group())
                return make_response(plan)
        
        # Ultimate fallback: return a safe default plan
        print("Supervisor: Could not parse LLM response, using fallback plan.")
        return make_response(fallback_plan(state["instruction"]))
    except Exception as e:
        print(f"Supervisor: LLM call failed ({e}), using fallback plan.")
        return make_response(fallback_plan(state["instruction"]))


def route_to_workers(state: MailAgentState) -> list[str]:
    """Conditional edge function: returns the list of worker node names
    to dispatch to in parallel, based on the supervisor's plan.
    If 'reader' is present, we serialize it first to resolve dependencies.
    """
    workers = {task["worker"] for task in state["plan"]}
    if "reader" in workers:
        return ["reader"]
    return list(workers) if workers else ["reader"]
