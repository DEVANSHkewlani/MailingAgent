from typing import Optional
from app.agents.llm_adapter import Anthropic
from app.config import settings
from app.db.session import get_db
from app.agents.state import MailAgentState

# Initialize client placeholder removed (initialized inside function).
CONFIDENCE_THRESHOLD = 0.6

async def match_rule(user_id: str, email: dict) -> Optional[str]:
    db = get_db()
    rules = await db.fetch("SELECT * FROM category_rules WHERE user_id = $1", user_id)
    for rule in rules:
        if rule["match_type"] == "sender_domain" and email.get("sender", "").endswith(rule["match_value"]):
            return rule["category"]
        if rule["match_type"] == "sender_exact" and email.get("sender", "") == rule["match_value"]:
            return rule["category"]
        if rule["match_type"] == "subject_keyword" and rule["match_value"].lower() in email.get("subject", "").lower():
            return rule["category"]
        if rule["match_type"] == "gmail_label" and rule["match_value"] in email.get("labels", []):
            return rule["category"]
    return None


def classify_with_llm_batch(emails: list[dict], groq_api_key: str) -> list[dict]:
    """Batched classification — one call for N emails, not N calls.
    Uses a cheap/fast model since this runs at high volume."""
    items = "\n".join(
        f"{i}. From: {e.get('sender', 'unknown')} | Subject: {e.get('subject', 'no subject')} | Snippet: {e.get('snippet', '')[:150]}"
        for i, e in enumerate(emails)
    )
    
    # Handle mock fallback
    import os
    has_groq = (groq_api_key and len(groq_api_key) > 10) or os.getenv("GROQ_API_KEY")
    if not has_groq:
        return [{"index": i, "category": "action_needed", "confidence": 0.9} for i in range(len(emails))]

    try:
        client = Anthropic(api_key=groq_api_key)
        response = client.messages.create(
            model="claude-3-5-haiku-20241022",
            max_tokens=1024,
            messages=[{
                "role": "user",
                "content": f"Classify each email into one category: urgent, action_needed, "
                           f"meeting_request, fyi, newsletter, personal.\n\n{items}"
            }],
            tools=[{
                "name": "submit_classifications",
                "description": "Submit category + confidence for each email",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "results": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "index": {"type": "integer"},
                                    "category": {"type": "string"},
                                    "confidence": {"type": "number"}
                                 },
                                "required": ["index", "category", "confidence"]
                            }
                        }
                    },
                    "required": ["results"]
                }
            }],
            tool_choice={"type": "tool", "name": "submit_classifications"}
        )
        
        tool_blocks = [b for b in response.content if b.type == "tool_use"]
        if tool_blocks:
            return tool_blocks[0].input["results"]
        
        # Fallback: try to parse JSON from text
        import json, re
        text_blocks = [b for b in response.content if b.type == "text"]
        if text_blocks:
            json_match = re.search(r'\[.*\]', text_blocks[0].text, re.DOTALL)
            if json_match:
                return json.loads(json_match.group())
        
        print("Categorizer: Could not parse LLM response, using default categories.")
        return [{"index": i, "category": "uncategorized", "confidence": 0.5} for i in range(len(emails))]
    except Exception as e:
        print(f"Categorizer: LLM classification failed ({e}), using defaults.")
        return [{"index": i, "category": "uncategorized", "confidence": 0.5} for i in range(len(emails))]


async def categorizer_agent_node(state: MailAgentState) -> dict:
    db = get_db()
    emails = state.get("email_context", [])
    needs_llm = []
    resolved = []

    # Step 1: rules first — zero cost, deterministic, always wins on conflict
    for email in emails:
        rule_match = await match_rule(state["user_id"], email)
        if rule_match:
            resolved.append({"email_id": email["id"], "category": rule_match, "source": "rule"})
        else:
            needs_llm.append(email)

    # Step 2: LLM fallback, batched
    if needs_llm:
        llm_results = classify_with_llm_batch(needs_llm, state.get("groq_api_key", ""))
        for r in llm_results:
            email = needs_llm[r["index"]]
            if r["confidence"] < CONFIDENCE_THRESHOLD:
                category = "uncategorized"  # surfaced for user labeling, not guessed
            else:
                category = r["category"]
            resolved.append({"email_id": email["id"], "category": category, "source": "llm", "confidence": r["confidence"]})

    # Update database cache using provider_message_id
    from uuid import UUID
    user_uuid = UUID(state["user_id"])
    for r in resolved:
        await db.execute(
            "UPDATE email_cache SET category = $1, category_confidence = $2 "
            "WHERE provider_message_id = $3 AND user_id = $4",
            r["category"], r.get("confidence"), str(r["email_id"]), user_uuid
        )

    return {"completed_tasks": [{"agent": "categorizer", "count": len(resolved)}]}
