from google_auth_oauthlib.flow import Flow
from cryptography.fernet import Fernet
from app.config import settings

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.labels",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.readonly",
]

fernet = Fernet(settings.token_encryption_key.encode())

def get_auth_url() -> str:
    flow = Flow.from_client_config(
        {"web": {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uris": [settings.google_redirect_uri],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }},
        scopes=SCOPES,
        redirect_uri=settings.google_redirect_uri,
    )
    auth_url, _ = flow.authorization_url(access_type="offline", prompt="consent")
    return auth_url


async def handle_callback(code: str, user_id: str):
    from app.db.session import get_db
    from googleapiclient.discovery import build
    from uuid import UUID
    from app.db.init_db import seed_default_rules

    flow = Flow.from_client_config(
        {"web": {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uris": [settings.google_redirect_uri],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }},
        scopes=SCOPES,
        redirect_uri=settings.google_redirect_uri,
    )
    flow.fetch_token(code=code)
    creds = flow.credentials

    db = get_db()
    user_uuid = UUID(user_id)

    # Fetch the user's Gmail profile using the obtained credentials
    email = "unknown@example.com"
    display_name = "New Mail Agent User"
    try:
        gmail_service = build("gmail", "v1", credentials=creds)
        profile = gmail_service.users().getProfile(userId="me").execute()
        email = profile.get("emailAddress", "unknown@example.com")
        display_name = email.split("@")[0].title()
    except Exception as e:
        print(f"Google OAuth: Failed to fetch Gmail profile: {e}")

    # Check if a user with this email ALREADY exists in the database
    existing_user = await db.fetchrow("SELECT id FROM users WHERE email = $1", email)
    
    target_user_uuid = user_uuid
    if existing_user:
        if existing_user["id"] != user_uuid:
            print(f"Google OAuth: Swapped current user {user_uuid} with existing user {existing_user['id']} for email {email}")
            target_user_uuid = existing_user["id"]
            
            # Deleting the temporary user record and its chats
            await db.execute("DELETE FROM conversations WHERE user_id = $1", user_uuid)
            await db.execute("DELETE FROM users WHERE id = $1", user_uuid)
            print(f"Google OAuth: Cleaned up temporary user ID {user_uuid}")
    else:
        # Ensure user exists in the database
        user_row = await db.fetchrow("SELECT email FROM users WHERE id = $1", user_uuid)
        if not user_row:
            await db.execute(
                "INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3)",
                user_uuid, email, display_name
            )
            print(f"Google OAuth: Registered new user {email} (ID: {user_uuid})")
            # Seed default category rules for the new user
            await seed_default_rules(str(user_uuid), db)
        else:
            # Check if this user already has an email associated, and if it's different.
            # If so, create a NEW user with a fresh UUID to keep profiles partitioned.
            if user_row["email"] and user_row["email"] != email:
                import uuid as py_uuid
                new_user_uuid = py_uuid.uuid4()
                await db.execute(
                    "INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3)",
                    new_user_uuid, email, display_name
                )
                print(f"Google OAuth: Created new user ID {new_user_uuid} for email {email} (previously session was {user_uuid})")
                await seed_default_rules(str(new_user_uuid), db)
                target_user_uuid = new_user_uuid
            else:
                # Update user's email and display_name with Google profile data
                await db.execute(
                    "UPDATE users SET email = $1, display_name = $2 WHERE id = $3",
                    email, display_name, user_uuid
                )
                print(f"Google OAuth: Updated user {user_uuid} profile with Gmail {email}")

    # 2. Check if oauth credentials already exist for this user & provider, and update or insert
    existing = await db.fetchrow(
        "SELECT id FROM oauth_credentials WHERE user_id = $1 AND provider = 'google'",
        target_user_uuid
    )
    
    access_enc = fernet.encrypt(creds.token.encode())
    refresh_enc = fernet.encrypt(creds.refresh_token.encode()) if creds.refresh_token else b""
    
    if existing:
        # Update
        if refresh_enc:
            await db.execute(
                "UPDATE oauth_credentials SET access_token_encrypted = $1, refresh_token_encrypted = $2, "
                "scopes = $3, expires_at = $4, created_at = now() WHERE id = $5",
                access_enc, refresh_enc, SCOPES, creds.expiry, existing["id"]
            )
        else:
            await db.execute(
                "UPDATE oauth_credentials SET access_token_encrypted = $1, "
                "scopes = $2, expires_at = $3, created_at = now() WHERE id = $4",
                access_enc, SCOPES, creds.expiry, existing["id"]
            )
        print(f"Updated Google OAuth credentials for user {target_user_uuid}")
    else:
        # Insert
        await db.execute(
            "INSERT INTO oauth_credentials (user_id, provider, access_token_encrypted, "
            "refresh_token_encrypted, scopes, expires_at) VALUES ($1, 'google', $2, $3, $4, $5)",
            target_user_uuid,
            access_enc,
            refresh_enc,
            SCOPES,
            creds.expiry
        )
        print(f"Saved new Google OAuth credentials for user {target_user_uuid}")

    # Also automatically trigger a sync when user logs in/connects Gmail!
    try:
        from app.providers.gmail import GmailProvider
        from app.agents.state import ResetList
        from app.agents.graph import get_compiled_graph
        import uuid as py_uuid
        
        # We start a quick background task to sync the emails right away!
        async def background_sync():
            try:
                # Sync using the reader agent
                print(f"Google OAuth Auto-Sync: Starting initial email sync for {email}...")
                graph = await get_compiled_graph()
                conv_id = py_uuid.uuid4()
                # Create a temporary sync conversation to hold checkpointer
                db = get_db()
                await db.execute(
                    "INSERT INTO conversations (id, user_id, title) VALUES ($1, $2, 'Initial Sync')",
                    conv_id, target_user_uuid
                )
                await graph.ainvoke(
                    {
                        "user_id": str(target_user_uuid),
                        "conversation_id": str(conv_id),
                        "instruction": "Sync latest unread emails newer_than:7d",
                        "messages": [],
                        "plan": [],
                        "active_tasks": ResetList(),
                        "completed_tasks": ResetList(),
                        "pending_approvals": ResetList(),
                        "email_context": ResetList(),
                        "draft_results": ResetList(),
                        "calendar_results": ResetList(),
                        "summaries": ResetList(),
                        "errors": ResetList(),
                        "is_cron": True # bypass human confirmations
                    },
                    config={"configurable": {"thread_id": str(conv_id)}}
                )
                print(f"Google OAuth Auto-Sync: Initial email sync completed successfully for {email}.")
            except Exception as sync_err:
                print(f"Google OAuth Auto-Sync: Error running initial sync: {sync_err}")
                
        import asyncio
        asyncio.create_task(background_sync())
    except Exception as launch_err:
        print(f"Google OAuth Auto-Sync: Failed to trigger initial sync: {launch_err}")

    return str(target_user_uuid)
