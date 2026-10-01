import json
import logging
from typing import List

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from jose import JWTError as InvalidTokenError
from sqlalchemy import select

from backend.app.core.audit import audit
from backend.app.core.config import settings
from backend.app.core.security import decode_access_token
from backend.app.db.session import SessionLocal
from backend.app.engine.event_bus import event_bus
from backend.app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter()


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        event_bus.subscribe(self.broadcast_internal_event)

    async def connect(self, websocket: WebSocket) -> bool:
        if len(self.active_connections) >= settings.WS_MAX_CONNECTIONS:
            await websocket.close(code=status.WS_1013_TRY_AGAIN_LATER)
            return False
        await websocket.accept()
        self.active_connections.append(websocket)
        return True

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast_internal_event(self, event: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(event)
            except Exception as exc:
                logger.error("Failed to send to websocket, disconnecting: %s", exc)
                self.disconnect(connection)


manager = ConnectionManager()


async def _authenticate_ws(websocket: WebSocket) -> User | None:
    token = websocket.query_params.get("token") or ""
    if not token:
        auth = websocket.headers.get("authorization") or ""
        if auth.lower().startswith("bearer "):
            token = auth.split(" ", 1)[1].strip()
    if not token:
        audit("websocket_auth_failure", outcome="denied", reason="missing_token")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return None
    try:
        payload = decode_access_token(token)
        user_id = int(payload.get("sub"))
    except (InvalidTokenError, TypeError, ValueError):
        audit("websocket_auth_failure", outcome="denied", reason="invalid_token")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return None

    async with SessionLocal() as db:
        user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None or (user.status or "").upper() != "ACTIVE":
        audit("websocket_auth_failure", outcome="denied", reason="unknown_or_inactive")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return None
    return user


@router.websocket("/")
async def websocket_endpoint(websocket: WebSocket):
    user = await _authenticate_ws(websocket)
    if user is None:
        return
    connected = await manager.connect(websocket)
    if not connected:
        audit("websocket_rejected", actor=user.username, outcome="denied", reason="connection_limit")
        return
    try:
        while True:
            data = await websocket.receive_text()
            if data and len(data.encode("utf-8")) > settings.WS_MAX_MESSAGE_BYTES:
                await websocket.close(code=status.WS_1009_MESSAGE_TOO_BIG)
                break
            if data:
                try:
                    message = json.loads(data)
                except json.JSONDecodeError:
                    await websocket.send_json({"type": "error", "detail": "Malformed message"})
                    continue
                if not isinstance(message, dict):
                    await websocket.send_json({"type": "error", "detail": "Malformed message"})
                    continue
                msg_type = message.get("type")
                if msg_type not in {None, "ping", "subscribe"}:
                    await websocket.send_json({"type": "error", "detail": "Unsupported message"})
                    continue
                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as exc:
        logger.error("WebSocket error: %s", exc)
        manager.disconnect(websocket)
    finally:
        manager.disconnect(websocket)
