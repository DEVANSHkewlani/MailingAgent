from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from app.db.session import init_pool
from app.agents.graph import get_compiled_graph, close_compiled_graph
from app.notifications.websocket import manager
from app.jobs.cron_scheduler import start_cron_scheduler, stop_cron_scheduler
from app.routers import chat, approvals, auth, cron

app = FastAPI(
    title="Mail Agent API",
    description="Backend API and LangGraph Multi-Agent execution server for Mail Agent.",
    version="1.0.0"
)

# Configure CORS for local react client dashboard connections
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production to frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    print("Starting FastAPI Application...")
    # Setup database pools and compile LangGraph checkpoints savers
    await init_pool()
    await get_compiled_graph()
    start_cron_scheduler()
    print("Database pool and checkpointer savers initialized successfully.")

@app.on_event("shutdown")
async def shutdown_event():
    print("Stopping FastAPI Application...")
    await stop_cron_scheduler()
    await close_compiled_graph()
    print("Database pool and connection savers closed.")

# Mount routers
app.include_router(chat.router)
app.include_router(approvals.router)
app.include_router(auth.router)
app.include_router(cron.router)

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    """
    Active websocket channel for server-sent dashboard notification events.
    """
    await manager.connect(websocket, user_id)
    try:
        while True:
            # Loop keeps the connection alive. Client messages can be discarded/handled here.
            text = await websocket.receive_text()
            print(f"FastAPI WebSockets: Received input from client {user_id}: {text}")
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
    except Exception as e:
        print(f"FastAPI WebSockets: Exception on client connection {user_id}: {e}")
        manager.disconnect(websocket, user_id)
