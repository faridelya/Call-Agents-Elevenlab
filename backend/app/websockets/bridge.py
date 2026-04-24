"""
Twilio ↔ ElevenLabs WebSocket bridge.

Flow per call:
  Twilio opens WS to /ws/bridge/{call_record_id}
  Bridge opens WS to ElevenLabs conversational endpoint
  Audio relay: Twilio μ-law 8kHz base64 ↔ ElevenLabs (same format, no transcoding)
  Client tool calls: EL sends client_tool_call event → bridge dispatches → result back
"""
import asyncio
import json
import structlog
import websockets
from datetime import datetime, timezone
from fastapi import WebSocket, WebSocketDisconnect

from app.config import settings
from app.db.redis import get_redis_pool
from app.db.session import AsyncSessionLocal
from app.tools.executor import execute as execute_tool
from app.tools.schemas import CallContext, ToolCall
from app.websockets.bridge_manager import bridge_manager

log = structlog.get_logger(__name__)

EL_WS_URL = "wss://api.elevenlabs.io/v1/convai/conversation"


class Bridge:
    def __init__(self, call_record_id: str, twilio_ws: WebSocket):
        self.call_record_id = call_record_id
        self.twilio_ws = twilio_ws
        self.el_ws = None
        self.call_sid: str | None = None
        self.stream_sid: str | None = None
        self.ctx: CallContext | None = None
        self._running = False

    def _redis_call_key(self) -> str:
        return f"call:{self.call_sid or self.call_record_id}"

    def _redis_transcript_key(self) -> str:
        return f"{self._redis_call_key()}:transcript"

    def _redis_stages_key(self) -> str:
        return f"{self._redis_call_key()}:stages"

    async def run(self):
        self._running = True
        redis = await get_redis_pool()

        try:
            await self.twilio_ws.accept()
            await bridge_manager.register(self.call_record_id, self)

            # Wait for Twilio "start" event to get call_sid
            connected_msg = await self.twilio_ws.receive_text()
            data = json.loads(connected_msg)

            if data.get("event") == "connected":
                start_msg = await self.twilio_ws.receive_text()
                data = json.loads(start_msg)

            if data.get("event") != "start":
                log.warning("bridge_missing_start", call_record_id=self.call_record_id, first_event=data.get("event"))
                return

            start = data.get("start", {})
            self.stream_sid = start.get("streamSid")
            self.call_sid = start.get("callSid") or self.stream_sid
            if not self.stream_sid or not self.call_sid:
                log.warning("bridge_invalid_start", call_record_id=self.call_record_id, payload=start)
                return

            log.info("bridge_start", call_record_id=self.call_record_id, call_sid=self.call_sid)

            # Load call context from Redis
            self.ctx = await self._load_context(redis)
            if not self.ctx:
                log.error("bridge_no_context", call_record_id=self.call_record_id)
                return

            # Get ElevenLabs agent ID from context
            agent_config = self.ctx.agent_config
            el_agent_id = agent_config.get("elevenlabs_agent_id")
            if not el_agent_id:
                log.error("bridge_no_el_agent", call_record_id=self.call_record_id)
                return

            el_url = f"{EL_WS_URL}?agent_id={el_agent_id}"
            el_headers = {"xi-api-key": settings.elevenlabs_api_key}

            async with websockets.connect(el_url, additional_headers=el_headers) as el_ws:
                self.el_ws = el_ws
                log.info("bridge_el_connected", agent_id=el_agent_id)

                # Send dynamic variables for personalization
                await self._send_initiation_data(el_ws, redis)

                await self._emit_event("call_started", {
                    "call_record_id": self.call_record_id,
                    "agent_id": self.ctx.agent_id if self.ctx else "",
                    "direction": self.ctx.direction if self.ctx else "outbound",
                })

                # Run bidirectional relay concurrently
                twilio_task = asyncio.create_task(self._twilio_to_el(el_ws, redis))
                el_task = asyncio.create_task(self._el_to_twilio(el_ws, redis))
                done, pending = await asyncio.wait(
                    {twilio_task, el_task},
                    return_when=asyncio.FIRST_COMPLETED,
                )
                self._running = False
                for task in pending:
                    task.cancel()
                await asyncio.gather(*pending, return_exceptions=True)
                await asyncio.gather(*done, return_exceptions=True)

        except WebSocketDisconnect:
            log.info("bridge_twilio_disconnect", call_record_id=self.call_record_id)
        except Exception as e:
            log.error("bridge_error", call_record_id=self.call_record_id, error=str(e))
        finally:
            self._running = False
            await bridge_manager.remove(self.call_record_id)
            await self._emit_event("call_ended", {"call_record_id": self.call_record_id})
            await self._finalize(redis)

    async def _load_context(self, redis) -> CallContext | None:
        key = self._redis_call_key()
        raw = await redis.hgetall(key)
        if not raw:
            # Fallback: try call_record_id key
            fallback_key = f"call:{self.call_record_id}"
            raw = await redis.hgetall(fallback_key)
            if raw and key != fallback_key:
                await redis.hset(key, mapping=raw)
                await redis.expire(key, 14400)
        if not raw:
            return None

        return CallContext(
            call_record_id=raw.get("call_record_id", self.call_record_id),
            call_sid=self.call_sid or "",
            agent_id=raw.get("agent_id", ""),
            user_id=raw.get("user_id", ""),
            agent_config=json.loads(raw.get("agent_config", "{}")),
            enabled_tools=json.loads(raw.get("enabled_tools", "[]")),
            tool_configs=json.loads(raw.get("tool_configs", "{}")),
            lead_data=json.loads(raw.get("lead_data", "{}")),
            direction=raw.get("direction", "outbound"),
        )

    async def _send_initiation_data(self, el_ws, redis) -> None:
        lead = self.ctx.lead_data if self.ctx else {}
        agent_cfg = self.ctx.agent_config if self.ctx else {}

        dynamic_vars = {
            "lead_first_name": lead.get("first_name", "there"),
            "lead_last_name": lead.get("last_name", ""),
            "lead_company": lead.get("company", ""),
            "lead_title": lead.get("title", ""),
            "product_name": agent_cfg.get("product_name", ""),
            "company_name": agent_cfg.get("company_name", ""),
            "call_id": self.call_record_id,
            "caller_number": lead.get("phone", ""),
        }
        # Merge any custom fields from campaign contact
        dynamic_vars.update({k: v for k, v in lead.items() if k not in dynamic_vars})

        msg = json.dumps({
            "type": "conversation_initiation_client_data",
            "dynamic_variables": dynamic_vars,
        })
        await el_ws.send(msg)

    async def _twilio_to_el(self, el_ws, redis) -> None:
        """Relay audio from Twilio to ElevenLabs."""
        while self._running:
            try:
                raw = await asyncio.wait_for(self.twilio_ws.receive_text(), timeout=30.0)
            except asyncio.TimeoutError:
                continue
            except Exception:
                break

            data = json.loads(raw)
            event = data.get("event")

            if event == "media":
                media = data.get("media", {})
                if media.get("track") == "inbound":
                    payload = media.get("payload", "")
                    await el_ws.send(json.dumps({
                        "user_audio_chunk": payload,
                    }))

            elif event == "stop":
                log.info("bridge_twilio_stop", call_record_id=self.call_record_id)
                self._running = False
                break

    async def _el_to_twilio(self, el_ws, redis) -> None:
        """Relay audio from ElevenLabs back to Twilio + handle tool calls."""
        async with AsyncSessionLocal() as db:
            async for raw_msg in el_ws:
                if not self._running:
                    break

                try:
                    msg = json.loads(raw_msg)
                except Exception:
                    continue

                msg_type = msg.get("type")

                if msg_type == "audio":
                    audio_event = msg.get("audio_event", {})
                    payload = audio_event.get("audio_base_64", "")
                    if payload and self.stream_sid:
                        await self.twilio_ws.send_text(json.dumps({
                            "event": "media",
                            "streamSid": self.stream_sid,
                            "media": {"payload": payload},
                        }))

                elif msg_type == "interruption":
                    # User interrupted — clear Twilio audio buffer
                    if self.stream_sid:
                        await self.twilio_ws.send_text(json.dumps({
                            "event": "clear",
                            "streamSid": self.stream_sid,
                        }))

                elif msg_type == "client_tool_call":
                    tool_data = msg.get("client_tool_call", msg)
                    tool_call = ToolCall(
                        tool_name=tool_data.get("tool_name", ""),
                        tool_call_id=tool_data.get("tool_call_id", ""),
                        parameters=tool_data.get("parameters", {}),
                    )
                    log.info("tool_call", call_id=self.call_record_id, tool=tool_call.tool_name)
                    result = await execute_tool(tool_call, self.ctx, db, redis)
                    log.info("tool_result", call_id=self.call_record_id, tool=tool_call.tool_name, error=result.error)

                    await el_ws.send(json.dumps({
                        "type": "client_tool_result",
                        "tool_call_id": result.tool_call_id,
                        "result": result.result,
                        "is_error": result.error,
                    }))

                    # Check if bridge should terminate (end_call tool sets this flag)
                    end_req = await redis.hget(self._redis_call_key(), "end_requested")
                    if end_req == "1":
                        self._running = False
                        break

                elif msg_type == "user_transcript":
                    text = msg.get("user_transcription_event", {}).get("user_transcript", "")
                    ts = datetime.now(timezone.utc).isoformat()
                    transcript_entry = json.dumps({"role": "user", "text": text, "timestamp": ts})
                    await redis.rpush(self._redis_transcript_key(), transcript_entry)
                    log.info("transcript_user", call_id=self.call_record_id, text=text[:120])
                    await self._emit_event("transcript", {
                        "call_record_id": self.call_record_id,
                        "role": "user",
                        "text": text,
                        "timestamp": ts,
                    })

                elif msg_type == "agent_response":
                    text = msg.get("agent_response_event", {}).get("agent_response", "")
                    ts = datetime.now(timezone.utc).isoformat()
                    transcript_entry = json.dumps({"role": "agent", "text": text, "timestamp": ts})
                    await redis.rpush(self._redis_transcript_key(), transcript_entry)
                    log.info("transcript_agent", call_id=self.call_record_id, text=text[:120])
                    await self._emit_event("transcript", {
                        "call_record_id": self.call_record_id,
                        "role": "agent",
                        "text": text,
                        "timestamp": ts,
                    })

                elif msg_type == "ping":
                    await el_ws.send(json.dumps({"type": "pong", "event_id": msg.get("ping_event", {}).get("event_id")}))

    async def _finalize(self, redis) -> None:
        """Store transcript from Redis into the calls table."""
        try:
            transcript_raw = await redis.lrange(self._redis_transcript_key(), 0, -1)
            stages_raw = await redis.lrange(self._redis_stages_key(), 0, -1)

            transcript = [json.loads(t) for t in transcript_raw]
            stages = [json.loads(s) for s in stages_raw]

            async with AsyncSessionLocal() as db:
                from sqlalchemy import select as _select
                result = await db.execute(_select(Call).where(Call.id == self.call_record_id))
                call = result.scalar_one_or_none()
                if call:
                    if transcript:
                        call.transcript = transcript
                    if stages:
                        call.stage_timeline = stages
                    if not call.ended_at:
                        call.ended_at = datetime.now(timezone.utc).isoformat()
                    if call.status == "in-progress":
                        call.status = "completed"
                    await db.commit()
        except Exception as e:
            log.error("bridge_finalize_error", error=str(e))

        # Cleanup Redis
        try:
            await redis.delete(
                self._redis_call_key(),
                self._redis_transcript_key(),
                self._redis_stages_key(),
                f"call:{self.call_record_id}",
                f"call:{self.call_record_id}:transcript",
                f"call:{self.call_record_id}:stages",
            )
        except Exception:
            pass

    async def _emit_event(self, event_type: str, payload: dict) -> None:
        if not self.ctx:
            return
        try:
            from app.websockets.event_bus import event_manager
            await event_manager.broadcast(self.ctx.user_id, {"type": event_type, **payload})
        except Exception:
            pass


# Import Call model at module level to avoid repeated imports
from app.models.call import Call  # noqa: E402
