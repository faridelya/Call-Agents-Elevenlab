import asyncio
from typing import Any


class BridgeManager:
    """Registry of active Twilio↔ElevenLabs bridge instances keyed by call_record_id."""

    def __init__(self):
        self._bridges: dict[str, Any] = {}
        self._lock = asyncio.Lock()

    async def register(self, call_record_id: str, bridge: Any) -> None:
        async with self._lock:
            self._bridges[call_record_id] = bridge

    async def get(self, call_record_id: str) -> Any | None:
        return self._bridges.get(call_record_id)

    async def remove(self, call_record_id: str) -> None:
        async with self._lock:
            self._bridges.pop(call_record_id, None)

    def active_count(self) -> int:
        return len(self._bridges)


bridge_manager = BridgeManager()
