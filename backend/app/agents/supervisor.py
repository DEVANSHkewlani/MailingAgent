from app.agents.llm_adapter import Anthropic
from app.config import settings
from app.agents.state import MailAgentState

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

Return a JSON plan: a list of {"worker": "<name>", "task": "<specific instruction>"}. 
Only include workers actually needed for this instruction.
For "sync my mails/emails/inbox" type requests, use reader with query "in:inbox newer_than:7d" and categorizer."""

def supervisor_node(state: MailAgentState) -> dict:
    client = Anthropic(api_key=state.get("groq_api_key"))
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
    
    if not has_groq:
        # Return a static plan for testing/stubbing when no Groq key is present
        print("Warning: Groq API Key is not set. Returning stub plan.")
        return {"plan": [
            {"worker": "reader", "task": "in:inbox newer_than:7d"},
            {"worker": "categorizer", "task": "Categorize these emails"}
        ]}

    try:
        response = client.messages.create(
            model="claude-3-5-sonnet-20241022",  # Model name is ignored by adapter; uses Groq
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
                                        "drafter", "scheduler", "reminder"
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
            return {"plan": plan}
        
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
                return {"plan": plan}
        
        # Ultimate fallback: return a safe default plan
        print("Supervisor: Could not parse LLM response, using default plan.")
        return {"plan": [
            {"worker": "reader", "task": "in:inbox newer_than:7d"},
            {"worker": "categorizer", "task": "Categorize these emails"}
        ]}
    except Exception as e:
        print(f"Supervisor: LLM call failed ({e}), using default plan.")
        return {"plan": [
            {"worker": "reader", "task": "in:inbox newer_than:7d"},
            {"worker": "categorizer", "task": "Categorize these emails"}
        ]}


def route_to_workers(state: MailAgentState) -> list[str]:
    """Conditional edge function: returns the list of worker node names
    to dispatch to in parallel, based on the supervisor's plan.
    If 'reader' is present, we serialize it first to resolve dependencies.
    """
    workers = {task["worker"] for task in state["plan"]}
    if "reader" in workers:
        return ["reader"]
    return list(workers) if workers else ["reader"]
