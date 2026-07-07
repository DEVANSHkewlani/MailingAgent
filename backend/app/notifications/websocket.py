import json
from typing import Dict, List
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        # Map user_id to a list of active websocket connections
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        print(f"WebSocket Manager: Connected user {user_id}. Active tabs: {len(self.active_connections[user_id])}")

    def disconnect(self, websocket: WebSocket, user_id: str):
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        print(f"WebSocket Manager: Disconnected user {user_id}")

    async def notify_dashboard(self, user_id: str, data: dict):
        """Send message updates to all active client tabs connected for user_id."""
        if user_id in self.active_connections:
            message = json.dumps(data)
            dead_connections = []
            
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_text(message)
                except Exception as e:
                    print(f"WebSocket Manager: Error broadcasting, marking client dead: {e}")
                    dead_connections.append(connection)
            
            # Clean up disconnected tabs
            for conn in dead_connections:
                self.disconnect(conn, user_id)

# Global connection manager instance
manager = ConnectionManager()

async def notify_dashboard(user_id: str, data: dict):
    """Module-level function utilized by permission nodes."""
    await manager.notify_dashboard(user_id, data)
