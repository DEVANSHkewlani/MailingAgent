import asyncio
import os
import sys

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import init_pool, get_pool
from app.agents.graph import get_compiled_graph, close_compiled_graph

async def verify_database():
    print("\n=== STEP 1: Verifying PostgreSQL Schema ===")
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Query all table names in public schema
        rows = await conn.fetch(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
        )
        tables = [r["table_name"] for r in rows]
        print(f"Found {len(tables)} tables in the database:")
        for idx, table in enumerate(tables, 1):
            print(f"  {idx}. {table}")
            
        expected_tables = ["users", "oauth_credentials", "conversations", "messages", "style_profiles", 
                           "email_cache", "thread_summaries", "category_rules", "drafts", 
                           "approval_queue", "permission_rules", "reminders", "calendar_events", 
                           "audit_log", "audit_log_access"]
        
        missing = [t for t in expected_tables if t not in tables]
        if missing:
            print(f"WARNING: Missing tables: {missing}")
        else:
            print("SUCCESS: All expected tables exist!")

async def verify_langgraph():
    print("\n=== STEP 2: Verifying LangGraph Core ===")
    print("Compiling graph...")
    graph = await get_compiled_graph()
    print("Graph compiled successfully!")
    
    # We will invoke the graph. Since settings.anthropic_api_key is mock,
    # the supervisor node will return the fallback stub plan:
    # {"plan": [{"worker": "reader", "task": "Read recent emails"}]}
    
    print("\nInvoking graph with test instruction...")
    inputs = {
        "user_id": "a7c9d56f-e011-4d0f-b81e-d8d155bde397",  # test user ID from init_db
        "conversation_id": "test-conversation-uuid",
        "instruction": "Find recent urgent emails from my boss.",
        "messages": [{"role": "user", "content": "Find recent urgent emails from my boss."}],
        "plan": [],
        "active_tasks": [],
        "completed_tasks": [],
        "pending_approvals": [],
        "email_context": [],
        "draft_results": [],
        "calendar_results": [],
        "errors": []
    }
    
    config = {"configurable": {"thread_id": "test-thread"}}
    
    try:
        result = await graph.ainvoke(inputs, config=config)
        print("\nGraph invocation succeeded!")
        print("\nResult Keys:", list(result.keys()))
        print("\nWorker completed tasks:", result.get("completed_tasks", []))
        print("Final aggregated response:", result.get("messages", [])[-1])
        print("SUCCESS: Graph compiled and executed successfully!")
    except Exception as e:
        print(f"\nERROR running graph: {e}")
        import traceback
        traceback.print_exc()

async def main():
    await init_pool()
    await verify_database()
    await verify_langgraph()
    await close_compiled_graph()

if __name__ == "__main__":
    asyncio.run(main())
