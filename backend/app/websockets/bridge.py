"""
Twilio ↔ ElevenLabs WebSocket bridge.

Flow per call:
  Twilio opens WS to /ws/bridge/{call_record_id}
  Bridge opens WS to ElevenLabs conversational endpoint
  Audio relay: Twilio μ-law 8kHz base64 ↔ ElevenLabs (same format via URL params)
  Client tool calls: EL sends client_tool_call event → bridge dispatches → result back

Key: always set output_format=ulaw_8000&input_format=ulaw_8000 on the EL URL
so EL accepts μ-law input from Twilio and returns μ-law output for Twilio to play.
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

# Always request ulaw_8000 — Twilio Media Streams use μ-law 8kHz G.711
EL_WS_URL = (
    "wss://api.elevenlabs.io/v1/convai/conversation"
    "?output_format=ulaw_8000"
    "&input_format=ulaw_8000"
)


class Bridge:
    def __init__(self, call_record_id: str, twilio_ws: WebSocket):
        self.call_record_id = call_record_id
        self.twilio_ws = twilio_ws
        self.el_ws = None
        self.call_sid: str | None = None
        self.stream_sid: str | None = None
        self.ctx: CallContext | None = None
        self._running = False
        self._audio_to_el: int = 0
        self._audio_to_twilio: int = 0

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

            # Wait for Twilio "start" event (sometimes preceded by "connected")
            connected_msg = await self.twilio_ws.receive_text()
            data = json.loads(connected_msg)

            if data.get("event") == "connected":
                start_msg = await self.twilio_ws.receive_text()
                data = json.loads(start_msg)

            if data.get("event") != "start":
                log.warning("bridge_missing_start",
                            call_record_id=self.call_record_id,
                            first_event=data.get("event"))
                return

            start = data.get("start", {})
            self.stream_sid = start.get("streamSid")
            self.call_sid = start.get("callSid") or self.stream_sid
            if not self.stream_sid or not self.call_sid:
                log.warning("bridge_invalid_start",
                            call_record_id=self.call_record_id,
                            payload=start)
                return

            log.info("bridge_start",
                     call_record_id=self.call_record_id,
                     call_sid=self.call_sid,
                     stream_sid=self.stream_sid)

            # Load call context from Redis
            self.ctx = await self._load_context(redis)
            if not self.ctx:
                log.error("bridge_no_context", call_record_id=self.call_record_id)
                return

            el_agent_id = self.ctx.agent_config.get("elevenlabs_agent_id")
            if not el_agent_id:
                log.error("bridge_no_el_agent", call_record_id=self.call_record_id)
                return

            # Append agent_id; output_format=ulaw_8000&input_format=ulaw_8000 already in base URL
            el_url = f"{EL_WS_URL}&agent_id={el_agent_id}"
            el_headers = {"xi-api-key": settings.elevenlabs_api_key}

            log.info("bridge_connecting_el",
                     call_record_id=self.call_record_id,
                     agent_id=el_agent_id,
                     url=el_url)

            async with websockets.connect(
                el_url,
                additional_headers=el_headers,
                ping_interval=20,
                ping_timeout=30,
            ) as el_ws:
                self.el_ws = el_ws

                # Step 1: Wait for EL's conversation_initiation_metadata
                try:
                    raw_meta = await asyncio.wait_for(el_ws.recv(), timeout=10.0)
                    meta = json.loads(raw_meta)
                    meta_type = meta.get("type", "")
                    if meta_type == "conversation_initiation_metadata":
                        meta_event = meta.get("conversation_initiation_metadata_event", {})
                        out_fmt = meta_event.get("agent_output_audio_format", "unknown")
                        conv_id = meta_event.get("conversation_id", "")
                        log.info("bridge_el_metadata",
                                 call_record_id=self.call_record_id,
                                 conversation_id=conv_id,
                                 agent_output_audio_format=out_fmt)
                        if out_fmt not in ("ulaw_8000", "pcm_mulaw"):
                            log.warning("bridge_wrong_output_format",
                                        call_record_id=self.call_record_id,
                                        got=out_fmt,
                                        expected="ulaw_8000")
                    else:
                        log.warning("bridge_unexpected_first_msg",
                                    call_record_id=self.call_record_id,
                                    type=meta_type)
                except asyncio.TimeoutError:
                    log.warning("bridge_el_metadata_timeout",
                                call_record_id=self.call_record_id)

                # Step 2: Send dynamic variables / conversation_initiation_client_data
                await self._send_initiation_data(el_ws, redis)

                log.info("bridge_el_connected",
                         call_record_id=self.call_record_id,
                         agent_id=el_agent_id)

                await self._emit_event("call_started", {
                    "call_record_id": self.call_record_id,
                    "agent_id": self.ctx.agent_id,
                    "direction": self.ctx.direction,
                })

                # Step 3: Bidirectional relay
                twilio_task = asyncio.create_task(self._twilio_to_el(el_ws, redis))
                el_task    = asyncio.create_task(self._el_to_twilio(el_ws, redis))
                done, pending = await asyncio.wait(
                    {twilio_task, el_task},
                    return_when=asyncio.FIRST_COMPLETED,
                )
                self._running = False
                for task in pending:
                    task.cancel()
                await asyncio.gather(*pending, return_exceptions=True)
                await asyncio.gather(*done, return_exceptions=True)

                log.info("bridge_relay_done",
                         call_record_id=self.call_record_id,
                         audio_sent_to_el=self._audio_to_el,
                         audio_sent_to_twilio=self._audio_to_twilio)

        except WebSocketDisconnect:
            log.info("bridge_twilio_disconnect", call_record_id=self.call_record_id)
        except websockets.exceptions.ConnectionClosedError as e:
            log.warning("bridge_el_disconnect",
                        call_record_id=self.call_record_id,
                        code=e.code, reason=e.reason)
        except Exception as e:
            log.error("bridge_error",
                      call_record_id=self.call_record_id,
                      error=str(e), exc_info=True)
        finally:
            self._running = False
            await bridge_manager.remove(self.call_record_id)
            await self._emit_event("call_ended", {"call_record_id": self.call_record_id})
            await self._finalize(redis)

    async def _load_context(self, redis) -> CallContext | None:
        key = self._redis_call_key()
        raw = await redis.hgetall(key)
        if not raw:
            fallback_key = f"call:{self.call_record_id}"
            raw = await redis.hgetall(fallback_key)
            if raw and key != fallback_key:
                await redis.hset(key, mapping=raw)
                await redis.expire(key, 14400)
        if not raw:
            log.error("bridge_context_missing",
                      call_record_id=self.call_record_id,
                      tried_keys=[self._redis_call_key(), f"call:{self.call_record_id}"])
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
            "lead_last_name":  lead.get("last_name", ""),
            "lead_company":    lead.get("company", ""),
            "lead_title":      lead.get("title", ""),
            "product_name":    agent_cfg.get("product_name", ""),
            "company_name":    agent_cfg.get("company_name", ""),
            "call_id":         self.call_record_id,
            "caller_number":   lead.get("phone", ""),
        }
        dynamic_vars.update({k: v for k, v in lead.items() if k not in dynamic_vars})

        msg = json.dumps({
            "type": "conversation_initiation_client_data",
            "dynamic_variables": dynamic_vars,
        })
        await el_ws.send(msg)
        log.debug("bridge_initiation_sent",
                  call_record_id=self.call_record_id,
                  vars_keys=list(dynamic_vars.keys()))

    async def _twilio_to_el(self, el_ws, redis) -> None:
        """Relay caller audio from Twilio → ElevenLabs as user_audio_chunk."""
        while self._running:
            try:
                raw = await asyncio.wait_for(
                    self.twilio_ws.receive_text(), timeout=30.0
                )
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                log.info("bridge_twilio_recv_error",
                         call_record_id=self.call_record_id, error=str(e))
                break

            data = json.loads(raw)
            event = data.get("event")

            if event == "media":
                media = data.get("media", {})
                # "inbound" = caller's voice flowing into the server
                if media.get("track") == "inbound":
                    payload = media.get("payload", "")
                    if payload:
                        await el_ws.send(json.dumps({"user_audio_chunk": payload}))
                        self._audio_to_el += 1
                        if self._audio_to_el % 200 == 1:
                            log.debug("audio_to_el_count",
                                      call_record_id=self.call_record_id,
                                      chunks=self._audio_to_el)

            elif event == "stop":
                log.info("bridge_twilio_stop", call_record_id=self.call_record_id)
                self._running = False
                break

            elif event == "mark":
                pass  # acknowledgement, no action needed

    async def _el_to_twilio(self, el_ws, redis) -> None:
        """Relay ElevenLabs audio → Twilio + handle tool calls and transcripts."""
        async with AsyncSessionLocal() as db:
            async for raw_msg in el_ws:
                if not self._running:
                    break

                try:
                    msg = json.loads(raw_msg)
                except Exception:
                    continue

                msg_type = msg.get("type")

                # ── Agent audio ─────────────────────────────────────────────
                if msg_type == "audio":
                    audio_event = msg.get("audio_event", {})
                    payload = audio_event.get("audio_base_64", "")
                    if not payload:
                        # some EL versions use different field names — try fallbacks
                        payload = (
                            msg.get("audio", {}).get("chunk", "")
                            or msg.get("audio", {}).get("audio_base_64", "")
                        )
                    if payload and self.stream_sid:
                        await self.twilio_ws.send_text(json.dumps({
                            "event": "media",
                            "streamSid": self.stream_sid,
                            "media": {"payload": payload},
                        }))
                        self._audio_to_twilio += 1
                        if self._audio_to_twilio % 200 == 1:
                            log.debug("audio_to_twilio_count",
                                      call_record_id=self.call_record_id,
                                      chunks=self._audio_to_twilio)
                    elif not payload:
                        log.warning("audio_empty_payload",
                                    call_record_id=self.call_record_id,
                                    msg_keys=list(msg.keys()),
                                    audio_event_keys=list(audio_event.keys()))

                # ── User interruption — clear Twilio buffer ──────────────────
                elif msg_type == "interruption":
                    if self.stream_sid:
                        await self.twilio_ws.send_text(json.dumps({
                            "event": "clear",
                            "streamSid": self.stream_sid,
                        }))

                # ── Client tool call ─────────────────────────────────────────
                elif msg_type == "client_tool_call":
                    tool_data = msg.get("client_tool_call", msg)
                    tool_call = ToolCall(
                        tool_name=tool_data.get("tool_name", ""),
                        tool_call_id=tool_data.get("tool_call_id", ""),
                        parameters=tool_data.get("parameters", {}),
                    )
                    log.info("tool_call",
                             call_id=self.call_record_id,
                             tool=tool_call.tool_name)
                    result = await execute_tool(tool_call, self.ctx, db, redis)
                    log.info("tool_result",
                             call_id=self.call_record_id,
                             tool=tool_call.tool_name,
                             error=result.error)

                    await el_ws.send(json.dumps({
                        "type": "client_tool_result",
                        "tool_call_id": result.tool_call_id,
                        "result": result.result,
                        "is_error": result.error,
                    }))

                    end_req = await redis.hget(self._redis_call_key(), "end_requested")
                    if end_req == "1":
                        self._running = False
                        break

                # ── User transcript ──────────────────────────────────────────
                elif msg_type == "user_transcript":
                    text = (
                        msg.get("user_transcription_event", {}).get("user_transcript", "")
                        or msg.get("user_transcript_event", {}).get("user_transcript", "")
                    )
                    ts = datetime.now(timezone.utc).isoformat()
                    await redis.rpush(
                        self._redis_transcript_key(),
                        json.dumps({"role": "user", "text": text, "timestamp": ts}),
                    )
                    log.info("transcript_user",
                             call_id=self.call_record_id, text=text[:120])
                    await self._emit_event("transcript", {
                        "call_record_id": self.call_record_id,
                        "role": "user",
                        "text": text,
                        "timestamp": ts,
                    })

                # ── Agent response text ──────────────────────────────────────
                elif msg_type == "agent_response":
                    text = (
                        msg.get("agent_response_event", {}).get("agent_response", "")
                        or msg.get("agent_response_correction_event", {}).get("agent_response", "")
                    )
                    ts = datetime.now(timezone.utc).isoformat()
                    await redis.rpush(
                        self._redis_transcript_key(),
                        json.dumps({"role": "agent", "text": text, "timestamp": ts}),
                    )
                    log.info("transcript_agent",
                             call_id=self.call_record_id, text=text[:120])
                    await self._emit_event("transcript", {
                        "call_record_id": self.call_record_id,
                        "role": "agent",
                        "text": text,
                        "timestamp": ts,
                    })

                # ── Ping/pong keepalive ──────────────────────────────────────
                elif msg_type == "ping":
                    event_id = msg.get("ping_event", {}).get("event_id")
                    await el_ws.send(json.dumps({
                        "type": "pong",
                        "event_id": event_id,
                    }))

                # ── Known informational messages — no action needed ──────────
                elif msg_type in (
                    "conversation_initiation_metadata",
                    "conversation_config_update",
                    "agent_response_correction",
                    "internal_tentative_agent_response",
                    "vad_score",
                ):
                    pass

                # ── Unexpected — log for debugging ───────────────────────────
                else:
                    log.debug("bridge_el_unknown_msg",
                              call_record_id=self.call_record_id,
                              type=msg_type,
                              keys=list(msg.keys()))

    async def _finalize(self, redis) -> None:
        """Persist transcript → DB and hang up Twilio leg."""
        try:
            transcript_raw = await redis.lrange(self._redis_transcript_key(), 0, -1)
            stages_raw     = await redis.lrange(self._redis_stages_key(), 0, -1)

            transcript = [json.loads(t) for t in transcript_raw]
            stages     = [json.loads(s) for s in stages_raw]

            async with AsyncSessionLocal() as db:
                from sqlalchemy import select as _select
                from app.models.user import User as UserModel
                from app.services.twilio_service import get_twilio_service

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
                    if not call.duration_seconds:
                        ref = call.answered_at or call.started_at
                        if ref and call.ended_at:
                            try:
                                t0 = datetime.fromisoformat(ref)
                                t1 = datetime.fromisoformat(call.ended_at)
                                call.duration_seconds = max(0, int((t1 - t0).total_seconds()))
                            except Exception:
                                pass
                    await db.commit()
                    log.info("bridge_finalized",
                             call_record_id=self.call_record_id,
                             transcript_msgs=len(transcript),
                             duration=call.duration_seconds)

                if self.call_sid and self.ctx and self.ctx.user_id:
                    try:
                        user_result = await db.execute(
                            _select(UserModel).where(UserModel.id == self.ctx.user_id)
                        )
                        user = user_result.scalar_one_or_none()
                        twilio = get_twilio_service(user)
                        await twilio.end_call(self.call_sid)
                        log.info("bridge_hangup_ok", call_sid=self.call_sid)
                    except Exception as e:
                        log.warning("bridge_hangup_failed",
                                    call_sid=self.call_sid, error=str(e))
        except Exception as e:
            log.error("bridge_finalize_error", error=str(e), exc_info=True)

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
            await event_manager.broadcast(
                self.ctx.user_id, {"type": event_type, **payload}
            )
        except Exception:
            pass


# Import at module level to avoid repeated deferred imports
from app.models.call import Call  # noqa: E402
