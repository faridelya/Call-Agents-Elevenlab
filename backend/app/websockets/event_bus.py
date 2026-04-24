"""Real-time event streaming to frontend via WebSocket."""
import asyncio
import json
import structlog
from fastapi import WebSocket, WebSocketDisconnect

log = structlog.get_logger(__name__)


class EventManager:
    """Fan-out real-time events to connected frontend clients per user."""

    def __init__(self):
        self._connections: dict[str, set[WebSocket]] = {}

    async def connect(self, user_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.setdefault(user_id, set()).add(ws)
        log.info("event_ws_connected", user_id=user_id)

    def disconnect(self, user_id: str, ws: WebSocket) -> None:
        conns = self._connections.get(user_id, set())
        conns.discard(ws)
        if not conns:
            self._connections.pop(user_id, None)
        log.info("event_ws_disconnected", user_id=user_id)

    async def broadcast(self, user_id: str, event: dict) -> None:
        """Send event to all frontend tabs for this user."""
        payload = json.dumps(event)
        dead: list[WebSocket] = []

        for ws in list(self._connections.get(user_id, set())):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)

        for ws in dead:
            self.disconnect(user_id, ws)

    async def broadcast_all(self, event: dict) -> None:
        for user_id in list(self._connections.keys()):
            await self.broadcast(user_id, event)


event_manager = EventManager()


async def run_event_ws(user_id: str, websocket: WebSocket) -> None:
    """WebSocket handler for /ws/events/{user_id}."""
    from app.core.security import decode_access_token

    token = websocket.query_params.get("token", "")
    token_user_id = decode_access_token(token) if token else None
    if not token_user_id or token_user_id != user_id:
        await websocket.close(code=1008)
        return

    await event_manager.connect(user_id, websocket)
    try:
        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                if msg == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                await websocket.send_text(json.dumps({"type": "keepalive"}))
    except WebSocketDisconnect:
        pass
    finally:
        event_manager.disconnect(user_id, websocket)
