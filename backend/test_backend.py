import asyncio
import uuid
import json
from app.db.session import init_pool, get_db, get_db_sync
from app.style.spec import StyleSpec
from app.style.render import render_styled_html
from app.agents.memory import save_message, load_recent_messages
from app.permissions.policy import classify
from app.agents.graph import get_compiled_graph

async def test_db_operations(user_id: str):
    print("\n=== Testing DB Operations ===")
    db = get_db()
    
    # 1. Test inserting OAuth credentials
    access_token_encrypted = b"dummy_access_token_encrypted"
    refresh_token_encrypted = b"dummy_refresh_token_encrypted"
    scopes = ["https://www.googleapis.com/auth/gmail.readonly"]
    
    # Clean up existing
    await db.execute("DELETE FROM oauth_credentials WHERE user_id = $1", user_id)
    
    await db.execute(
        "INSERT INTO oauth_credentials (user_id, provider, access_token_encrypted, refresh_token_encrypted, scopes, expires_at) "
        "VALUES ($1, 'google', $2, $3, $4, now() + interval '1 hour')",
        user_id, access_token_encrypted, refresh_token_encrypted, scopes
    )
    print("✓ Successfully inserted OAuth Credentials")
    
    # 2. Test inserting Style Profile
    # Clean up existing
    await db.execute("DELETE FROM style_profiles WHERE user_id = $1", user_id)
    
    row = await db.fetchrow(
        "INSERT INTO style_profiles (user_id, name, signature_html, font_family, font_size, accent_color, tone, is_default) "
        "VALUES ($1, 'Corporate Blue', '<p>Thanks,<br>Team</p>', 'Calibri', 12, '#0000FF', 'formal', true) RETURNING id",
        user_id
    )
    profile_id = str(row["id"])
    print(f"✓ Successfully inserted Style Profile. ID: {profile_id}")
    return profile_id


def test_template_rendering(profile_id: str):
    print("\n=== Testing Template Rendering ===")
    style = StyleSpec(
        font_family="Calibri",
        font_size_pt=12,
        accent_color="#0000FF",
        tone="formal"
    )
    
    body_markdown = "Dear client,\n\nHere is the **update** you requested.\n\n*   Item 1\n*   Item 2"
    signature_html = "<p>Warm regards,<br>Development Team</p>"
    
    # 1. Base rendering
    base_html = render_styled_html(body_markdown, style, signature_html, outlook_safe=False)
    assert "<body" in base_html
    assert "Calibri" in base_html
    assert "Development Team" in base_html
    print("✓ Successfully rendered base Jinja2 template")

    # 2. Outlook safe rendering
    outlook_html = render_styled_html(body_markdown, style, signature_html, outlook_safe=True)
    assert "<table" in outlook_html
    assert "Development Team" in outlook_html
    print("✓ Successfully rendered Outlook-safe template")


async def test_memory_operations(conversation_id: str):
    print("\n=== Testing Memory Operations ===")
    db = get_db()
    
    # Clean up
    await db.execute("DELETE FROM messages WHERE conversation_id = $1", conversation_id)
    await db.execute("DELETE FROM conversations WHERE id = $1", conversation_id)
    
    # Create conversation row first
    # Create test user
    user_row = await db.fetchrow("SELECT id FROM users LIMIT 1")
    user_id = str(user_row["id"])
    await db.execute(
        "INSERT INTO conversations (id, user_id, title) VALUES ($1, $2, 'Test Chat')",
        conversation_id, user_id
    )

    await save_message(conversation_id, "user", "I need to schedule a meeting with boss@example.com tomorrow at 10 AM.")
    await save_message(conversation_id, "assistant", "Sure, checking availability for tomorrow at 10 AM.")
    
    history = await load_recent_messages(conversation_id)
    assert len(history) == 2
    assert history[0]["role"] == "user"
    assert "tomorrow at 10 AM" in history[0]["content"]
    print("✓ Successfully saved and loaded message memory history")


async def test_permissions_gating(user_id: str):
    print("\n=== Testing Permissions Gating ===")
    
    # Test auto action (list_emails)
    auto_level = await classify(user_id, "list_emails", "")
    print(f"list_emails classification level: {auto_level}")
    assert auto_level == "AUTO"
    
    # Test gated action (send_email)
    confirm_level = await classify(user_id, "send_email", "")
    print(f"send_email classification level: {confirm_level}")
    assert confirm_level == "CONFIRM"
    print("✓ Successfully classified permission gating rules")


async def test_end_to_end_graph(user_id: str, conversation_id: str):
    print("\n=== Testing Graph Multi-Agent E2E Loop ===")
    graph = await get_compiled_graph()
    
    # We pass mock input variables
    config = {"configurable": {"thread_id": conversation_id}}
    
    print("Running graph invocation...")
    result = await graph.ainvoke(
        {
            "user_id": user_id,
            "conversation_id": conversation_id,
            "instruction": "Summarize my unread emails and draft a reply to the boss",
            "messages": [
                {"role": "user", "content": "Summarize my unread emails and draft a reply to the boss"}
            ],
            "plan": [],
            "active_tasks": [],
            "completed_tasks": [],
            "pending_approvals": [],
            "email_context": [
                # Mock email context so reader/categorizer nodes have mock items to run
                {"id": "msg_123", "thread_id": "thread_abc", "sender": "boss@example.com", "subject": "Project Status Update", "snippet": "Can we meet tomorrow to discuss project milestones?"}
            ],
            "draft_results": [],
            "calendar_results": [],
            "errors": []
        },
        config=config
    )
    
    print(f"Graph execution complete. Keys in state: {list(result.keys())}")
    print(f"Plan tasks: {result.get('plan')}")
    print(f"Errors log: {result.get('errors')}")
    
    last_message = result["messages"][-1]
    last_text = last_message.content if hasattr(last_message, "content") else last_message.get("content", "")
    print(f"Aggregator Final Output:\n{last_text}")
    print("✓ End-to-End Graph completed successfully")


async def main():
    print("Initializing Database Connection Pool...")
    await init_pool()
    
    # Retrieve test user
    db = get_db()
    user_row = await db.fetchrow("SELECT id FROM users WHERE email = 'backend_test@example.com'")
    if not user_row:
        user_row = await db.fetchrow("INSERT INTO users (email, display_name) VALUES ('backend_test@example.com', 'Backend Test User') RETURNING id")
    
    user_id = str(user_row["id"])
    conversation_id = str(uuid.uuid4())
    
    profile_id = await test_db_operations(user_id)
    test_template_rendering(profile_id)
    await test_memory_operations(conversation_id)
    await test_permissions_gating(user_id)
    await test_end_to_end_graph(user_id, conversation_id)
    
    print("\n🎉 ALL BACKEND COMPONENT TESTS PASSED SUCCESSFULLY! 🎉")

if __name__ == "__main__":
    asyncio.run(main())
