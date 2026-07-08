import os
from app.agents.state import MailAgentState
from app.agents.llm_adapter import GroqClient

AGGREGATOR_SYSTEM_PROMPT = """You are the conversational interface for Mail Agent.
Your job is to look at the actions performed by the worker agents and write a friendly, professional, and natural response to the user.

You should:
1. Converse like a helpful personal assistant.
2. If emails were synced, highlight what was fetched.
3. If thread summaries are present, present them clearly in bullet points with formatting.
4. If drafts were created, explain what the draft says and remind the user to check "Approvals & Drafts" to approve and send.
5. If calendar events or reminders were created, inform the user about them.
6. Address any errors gracefully.
7. Keep the tone helpful, clear, and concise. Format using Markdown.
8. If a cron job setup is in progress and details (like interval or time) are missing, ask the user to clarify or provide the missing details.
"""

def aggregator_node(state: MailAgentState) -> dict:
    """Merge all worker outputs into a final user-facing response using LLM when available."""
    # Build standard summary text for fallback or context
    parts = []
    if state.get("email_context"):
        parts.append(f"Found {len(state['email_context'])} matching emails.")
    if state.get("summaries"):
        parts.append("\n\n**Thread Summaries:**")
        for s in state["summaries"]:
            parts.append(f"- **{s.get('thread_id', 'Thread')}**: {s.get('summary', '')}")
    if state.get("draft_results"):
        parts.append(f"\nCreated {len(state['draft_results'])} draft(s) — review in Approvals & Drafts.")
        for d in state["draft_results"]:
            parts.append(f"- Draft for *{d.get('subject', 'unknown')}* (to: {d.get('to', 'recipient')})")
    if state.get("calendar_results"):
        parts.append(f"\nProposed {len(state['calendar_results'])} calendar event(s).")
        for c in state["calendar_results"]:
            parts.append(f"- **{c.get('title', 'Event')}** ({c.get('start_iso', '')} → {c.get('end_iso', '')}) — Status: {c.get('status', 'pending')}")
    
    cron_tasks = [t for t in state.get("completed_tasks", []) if t.get("agent") == "cron_manager"]
    if cron_tasks:
        parts.append(f"\nCron Job Configuration:")
        for ct in cron_tasks:
            parts.append(f"- {ct.get('task')} (Status: {ct.get('status')})")

    if state.get("errors"):
        parts.append(f"\n⚠️ {len(state['errors'])} item(s) encountered errors.")
    fallback_summary = "\n".join(parts) or "Done."

    # Check if Groq key is present
    groq_api_key = state.get("groq_api_key", "")
    has_groq = (groq_api_key and len(groq_api_key) > 10) or os.getenv("GROQ_API_KEY")

    if not has_groq:
        # Fallback to static summary if no LLM key is configured
        return {"messages": [{"role": "assistant", "content": fallback_summary}]}

    # Construct rich context for the LLM
    context = {
        "user_instruction": state.get("instruction", ""),
        "completed_tasks": state.get("completed_tasks", []),
        "emails_synced": [
            {
                "sender": e.get("sender"),
                "subject": e.get("subject"),
                "snippet": e.get("snippet")[:120] if e.get("snippet") else ""
            } for e in state.get("email_context", [])
        ],
        "drafts_created": state.get("draft_results", []),
        "calendar_events": state.get("calendar_results", []),
        "thread_summaries": [
            f"Thread {s.get('thread_id', '?')}: {s.get('summary', 'No summary')}"
            for s in state.get("summaries", [])
        ],
        "errors": state.get("errors", [])
    }

    try:
        client = GroqClient(api_key=groq_api_key)
        response = client.messages.create(
            model="llama-3.3-70b-versatile",
            max_tokens=1024,
            system=AGGREGATOR_SYSTEM_PROMPT,
            messages=[{
                "role": "user",
                "content": f"Here is the context of what just happened. Generate a natural reply to the user:\n\n{context}"
            }]
        )
        final_text = response.content[0].text
        return {"messages": [{"role": "assistant", "content": final_text}]}
    except Exception as e:
        print(f"Aggregator LLM call failed: {e}")
        return {"messages": [{"role": "assistant", "content": fallback_summary}]}
