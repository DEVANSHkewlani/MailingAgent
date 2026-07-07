from app.agents.state import MailAgentState
from app.db.session import get_db
from app.style.spec import parse_style_instruction
from app.style.render import render_styled_html
from app.tools.mail_tools import get_style_profile_impl
from app.agents.llm_adapter import Anthropic
from app.config import settings

# Initialize client placeholder removed (initialized inside node).

DRAFTER_SYSTEM_PROMPT = """You are the Drafter Agent for Mail Agent. Your task is to write a reply
to the given email thread. 

Analyze the email context and the user's specific formatting/style instructions to compose
a helpful, polite, and contextual reply. 
Write the email body in Markdown format. Do not write raw HTML.
"""

async def drafter_agent_node(state: MailAgentState) -> dict:
    """
    Drafter Agent node. Creates a reply draft in Gmail and saves it to the local DB.
    If the user instruction includes sending, queues a gated 'send_email' task.
    """
    print("Drafter Agent: Starting...")
    client = Anthropic(api_key=state.get("groq_api_key"))
    from app.providers.factory import get_mail_provider
    from app.style.spec import StyleSpec
    import uuid
    db = get_db()

    user_id = state.get("user_id")
    if not user_id:
        return {"errors": [{"error": "Missing user_id in state"}]}

    try:
        provider = await get_mail_provider(user_id)
    except Exception as e:
        return {"errors": [{"error": f"Provider init error: {str(e)}"}]}

    # Process each email context that needs drafting
    draft_results = []
    pending_approvals = []
    errors = []

    # Get style preferences from state or parse instruction
    raw_style = state.get("style_profile")
    if isinstance(raw_style, dict) and raw_style:
        style_spec = StyleSpec(**raw_style)
    elif isinstance(raw_style, StyleSpec):
        style_spec = raw_style
    else:
        style_spec = parse_style_instruction(state["instruction"], state.get("groq_api_key", ""))

    # Load style details (database signature, font, etc.)
    import asyncio
    style_details = await asyncio.to_thread(get_style_profile_impl, style_spec.signature_profile_id)

    emails = state.get("email_context", [])
    if not emails:
        print("Drafter Agent: No emails found in context to draft replies for.")

    for email in emails:
        thread_id = email.get("thread_id")
        if not thread_id:
            continue
            
        print(f"Drafter Agent: Generating response for thread {thread_id}...")
        
        # Call Claude to draft the email body in Markdown
        prompt = f"Thread Subject: {email.get('subject')}\nSnippet: {email.get('snippet')}\n\nStyle Profile Tone: {style_spec.tone}\n\nDraft a contextual reply in Markdown:"
        
        import os
        has_groq = (state.get("groq_api_key") and len(state.get("groq_api_key")) > 10) or os.getenv("GROQ_API_KEY")
        if not has_groq:
            body_markdown = f"Hi,\n\nThanks for your email regarding '{email.get('subject')}'. We have received it and will look into it.\n\nBest regards,\nTest User"
        else:
            response = client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=800,
                system=DRAFTER_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}]
            )
            body_markdown = response.content[0].text

        # Render Markdown to HTML using style profile
        body_html = render_styled_html(body_markdown, style_details)
        subject = f"Re: {email.get('subject')}" if not email.get("subject", "").startswith("Re:") else email.get("subject")

        try:
            # 1. Create the draft directly in Gmail (reversible/AUTO action)
            gmail_draft = provider.create_draft(thread_id, body_html, subject)
            print(f"Drafter Agent: Created draft in Gmail (Draft ID: {gmail_draft.id})")
            
            # Determine style profile UUID to save
            style_profile_id = style_details.get("id")
            style_profile_uuid = None
            if style_profile_id:
                try:
                    style_profile_uuid = uuid.UUID(str(style_profile_id))
                except ValueError:
                    pass

            # 2. Record draft in local DB drafts table
            # Check if user_id is a valid UUID
            user_uuid = None
            try:
                user_uuid = uuid.UUID(str(user_id))
            except ValueError:
                pass

            row = await db.fetchrow(
                "INSERT INTO drafts (user_id, thread_id, provider_draft_id, body_markdown, body_html, style_profile_id, status, created_by_agent) "
                "VALUES ($1, $2, $3, $4, $5, $6, 'pending', 'drafter') RETURNING id",
                user_uuid, thread_id, gmail_draft.id, body_markdown, body_html, style_profile_uuid
            )
            local_draft_id = str(row["id"])
            print(f"Drafter Agent: Saved draft to local DB (Local ID: {local_draft_id})")

            draft_results.append({
                "local_draft_id": local_draft_id,
                "provider_draft_id": gmail_draft.id,
                "thread_id": thread_id,
                "subject": subject
            })

            # 3. If the user's instruction implies sending or replying, queue a 'send_email' gated task
            instruction_lower = state["instruction"].lower()
            if any(w in instruction_lower for w in ["send", "reply", "mail", "outreach"]):
                pending_approvals.append({
                    "type": "send_email",
                    "resource": local_draft_id,
                    "payload": {"draft_id": local_draft_id},
                    "reasoning": f"Reply draft created automatically for thread '{subject}'. Approved to send."
                })
                print("Drafter Agent: Queued 'send_email' task for approval gating.")
                
        except Exception as e:
            print(f"Drafter Agent: Error creating draft: {e}")
            errors.append({"thread_id": thread_id, "error": str(e)})

    return {
        "draft_results": draft_results,
        "pending_approvals": pending_approvals,
        "errors": errors,
        "completed_tasks": [{"agent": "drafter", "task": f"Generated {len(draft_results)} replies", "status": "completed"}]
    }
