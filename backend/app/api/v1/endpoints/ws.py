import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List

from backend.app.engine.event_bus import event_bus

logger = logging.getLogger(__name__)

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        event_bus.subscribe(self.broadcast_internal_event)

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast_internal_event(self, event: dict):
        """Callback for the internal event bus to broadcast to all WS clients."""
        for connection in list(self.active_connections):
            try:
                await connection.send_json(event)
            except Exception as e:
                logger.error(f"Failed to send to websocket, disconnecting: {e}")
                self.disconnect(connection)

manager = ConnectionManager()

@router.websocket("/")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # We don't expect messages from the client in this phase,
            # but we need to receive to detect disconnects.
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)
