from app.agents.state import MailAgentState
from app.db.session import get_db
from app.style.spec import parse_style_instruction
from app.style.render import render_styled_html
from app.tools.mail_tools import get_style_profile_impl
from app.agents.llm_adapter import GroqClient
from app.config import settings

# Initialize client placeholder removed (initialized inside node).

DRAFTER_SYSTEM_PROMPT = """You are the Drafter Agent for Mail Agent. Your task is to write a reply
to the given email thread. 

Analyze the email context and the user's specific instructions to compose a contextual reply.

CRITICAL RULES:
1. The response MUST contain ONLY the actual email body text to be sent to the recipient.
2. Do NOT write any summaries, notes, reasoning, commentary, or preambles.
3. Do NOT include any markdown headings (e.g. '### Response', '### Summary', '### Reply').
4. Follow the user's request exactly (e.g. if they say write a single line, write only that single line).
5. Write the email body in Markdown format. Do not write raw HTML.
"""

async def drafter_agent_node(state: MailAgentState) -> dict:
    """
    Drafter Agent node. Creates a reply draft in Gmail and saves it to the local DB.
    If the user instruction includes sending, queues a gated 'send_email' task.
    """
    print("Drafter Agent: Starting...")
    client = GroqClient(api_key=state.get("groq_api_key"))
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
        errors.append({"error": "No emails found in context to draft replies for. Please fetch or sync emails first."})

    import os
    has_groq = (state.get("groq_api_key") and len(state.get("groq_api_key")) > 10) or os.getenv("GROQ_API_KEY")
    if not has_groq:
        return {
            "draft_results": [],
            "pending_approvals": [],
            "errors": [{
                "error": "Drafting requires a Groq API key. Add it in Settings > Email Connections, then ask me to draft again."
            }],
            "completed_tasks": [{"agent": "drafter", "task": "Draft skipped because no model key is configured", "status": "blocked"}]
        }

    # Filter the emails to only those targeted by the user's instruction
    instruction_lower = state["instruction"].lower()
    if any(w in instruction_lower for w in ["latest", "last mail", "last email", "most recent"]):
        if emails:
            emails = [emails[0]]
            print("Drafter Agent: Programmatically filtered to the single latest email.")
    elif has_groq and len(emails) > 1:
        print("Drafter Agent: Filtering target emails based on user instruction...")
        try:
            email_summaries = [
                f"- Thread ID: {e.get('thread_id')} | Sender: {e.get('sender')} | Subject: {e.get('subject')}"
                for e in emails
            ]
            filter_prompt = (
                f"User Instruction: {state['instruction']}\n\n"
                f"Available Emails:\n" + "\n".join(email_summaries) + "\n\n"
                f"Based on the user instruction, which Thread IDs need a reply? "
                f"Return ONLY a JSON list of strings representing the Thread IDs. "
                f"If the user says 'latest', pick the first matching one. "
                f"If all, return all. If none, return an empty list."
            )
            response = client.messages.create(
                model="llama-3.3-70b-versatile",
                max_tokens=150,
                messages=[{"role": "user", "content": filter_prompt}]
            )
            import re, json
            json_match = re.search(r'\[.*\]', response.content[0].text, re.DOTALL)
            if json_match:
                target_threads = json.loads(json_match.group())
                emails = [e for e in emails if e.get("thread_id") in target_threads]
                print(f"Drafter Agent: Filtered down to {len(emails)} target email(s).")
        except Exception as e:
            print(f"Drafter Agent: Failed to filter target emails, proceeding with all. Error: {e}")

    for email in emails:
        thread_id = email.get("thread_id")
        if not thread_id:
            continue
            
        print(f"Drafter Agent: Generating response for thread {thread_id}...")
        
        # Call Groq to draft the email body in Markdown
        # Include the user's original instruction for context-aware drafting
        user_instruction = state.get("instruction", "")
        original_sender = email.get("sender", "unknown")
        prompt = (
            f"User's request: {user_instruction}\n\n"
            f"Thread Subject: {email.get('subject')}\n"
            f"Original Sender: {original_sender}\n"
            f"Snippet: {email.get('snippet')}\n\n"
            f"Style Profile Tone: {style_spec.tone}\n\n"
            f"Draft a contextual reply in Markdown that addresses the user's request:"
        )
        
        response = client.messages.create(
            model="llama-3.3-70b-versatile",
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
                "subject": subject,
                "to": email.get("sender", "unknown"),
                "body_preview": body_markdown[:200]
            })

            # 3. If the user's instruction implies sending or replying, queue a 'send_email' gated task
            instruction_lower = state["instruction"].lower()
            if any(w in instruction_lower for w in ["send", "reply", "mail", "outreach", "draft"]):
                pending_approvals.append({
                    "type": "send_email",
                    "resource": local_draft_id,
                    "payload": {
                        "draft_id": local_draft_id,
                        "to": email.get("sender", "unknown"),
                        "subject": subject,
                        "body": body_markdown
                    },
                    "reasoning": f"Reply draft created for thread '{subject}'. Review and approve to send."
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
