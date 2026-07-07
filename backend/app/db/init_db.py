import asyncio
import os
import sys
import time

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.db.session import init_pool, get_pool, get_db

DEFAULT_CATEGORY_RULES = [
    {"match_type": "gmail_label", "match_value": "CATEGORY_PROMOTIONS", "category": "newsletter"},
    {"match_type": "gmail_label", "match_value": "CATEGORY_SOCIAL", "category": "fyi"},
    {"match_type": "subject_keyword", "match_value": "unsubscribe", "category": "newsletter"},
    {"match_type": "subject_keyword", "match_value": "invoice", "category": "action_needed"},
]

async def seed_default_rules(user_id: str, db):
    for rule in DEFAULT_CATEGORY_RULES:
        # Check if rule already exists for this user
        existing = await db.fetchrow(
            "SELECT id FROM category_rules WHERE user_id = $1 AND match_type = $2 AND match_value = $3",
            user_id, rule["match_type"], rule["match_value"]
        )
        if not existing:
            await db.execute(
                "INSERT INTO category_rules (user_id, match_type, match_value, category, is_system_default) "
                "VALUES ($1, $2, $3, $4, true)",
                user_id, rule["match_type"], rule["match_value"], rule["category"]
            )
            print(f"Seeded category rule: {rule['match_type']} -> {rule['match_value']}")

async def main():
    print("Waiting for database to become available...")
    max_retries = 30
    retry_interval = 2.0
    pool = None
    
    for attempt in range(max_retries):
        try:
            await init_pool()
            pool = await get_pool()
            # Try a quick test query
            async with pool.acquire() as conn:
                await conn.execute("SELECT 1")
            print("Database is up and accepting connections!")
            break
        except Exception as e:
            print(f"Database not ready yet (attempt {attempt + 1}/{max_retries}): {e}")
            await asyncio.sleep(retry_interval)
    else:
        print("Error: Could not connect to database after several attempts.")
        sys.exit(1)
    
    # Read schema.sql
    schema_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schema.sql")
    if not os.path.exists(schema_path):
        print(f"Error: schema.sql not found at {schema_path}")
        return
        
    with open(schema_path, "r") as f:
        schema_sql = f.read()
        
    print("Applying schema to database...")
    async with pool.acquire() as conn:
        # Execute schema queries
        await conn.execute(schema_sql)
        print("Schema applied successfully!")
        
        # Seed a test user for local verification
        test_email = "test@example.com"
        user = await conn.fetchrow("SELECT id FROM users WHERE email = $1", test_email)
        if not user:
            user = await conn.fetchrow(
                "INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id",
                test_email, "Test User"
            )
            print(f"Created default test user: {test_email} (ID: {user['id']})")
        else:
            print(f"Test user already exists: {test_email} (ID: {user['id']})")
            
        # Initialize database wrapper for seeding default rules
        db = get_db()
        await seed_default_rules(str(user["id"]), db)

    print("Database initialization complete.")

if __name__ == "__main__":
    asyncio.run(main())
