"""
Webhook handlers — Twilio + ElevenLabs native integration.

Twilio flow (outbound):
  1. Our server dials Twilio → Twilio calls /twiml/{call_record_id} when answered
  2. We call EL register_call() → get back TwiML + conversation_id
  3. We seed Redis conv mapping, store conv_id in DB, emit call_started
  4. Return TwiML to Twilio → EL owns the WebSocket to Twilio natively

ElevenLabs post-call transcript flow (recommended by EL official docs):
  1. EL fires POST /webhooks/elevenlabs/post-call when conversation is done + analysis complete
  2. We verify the HMAC-SHA256 signature, map conv_id → call record, save transcript to DB
  3. Emit call_processed to frontend — transcript appears without any polling

Twilio status callback (fallback):
  1. Twilio POSTs completed status → we emit call_ended + enqueue ARQ (30s deferred)
  2. ARQ worker saves transcript if EL webhook hasn't fired yet
"""
import hashlib
import hmac
import json
import structlog
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import get_db
from app.db.redis import get_redis
from app.models.base import new_uuid
from app.models.call import Call
from app.models.phone_number import PhoneNumber
from app.services.elevenlabs_service import elevenlabs_service
from app.utils.twiml import build_hangup_twiml, build_say_twiml
import redis.asyncio as aioredis

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


async def _monitor_el_conversation(
    conversation_id: str,
    call_id: str,
    user_id: str,
) -> None:
    """Enterprise real-time monitoring: connect to EL monitoring WebSocket and relay
    transcript events to the frontend via the event bus.

    - Non-Enterprise accounts: EL returns 403 → task exits immediately (no harm).
    - Enterprise accounts: streams agent_response / user_transcript events as
      {"type": "transcript", "call_record_id": ..., "role": ..., "text": ...}
      events that the TestCallPanel already handles.
    - Runs only for single test calls (campaign_id guard is applied by the caller).
    - The EL monitoring WS closes itself when the conversation ends, so the task
      always self-terminates — no manual cleanup needed.
    """
    try:
        import websockets  # type: ignore[import-untyped]
    except ImportError:
        log.warning("el_monitor_websockets_missing", call_id=call_id)
        return

    from app.websockets.event_bus import event_manager

    uri = f"wss://api.elevenlabs.io/v1/convai/conversations/{conversation_id}/monitor"
    log.info("el_monitor_connecting", call_id=call_id, conv_id=conversation_id)
    try:
        async with websockets.connect(
            uri,
            additional_headers={"xi-api-key": settings.elevenlabs_api_key},
        ) as ws:
            log.info("el_monitor_connected", call_id=call_id)
            async for raw_msg in ws:
                try:
                    msg = json.loads(raw_msg)
                    event_type = msg.get("type", "")
                    role = text = ""

                    if event_type == "agent_response":
                        role = "agent"
                        text = msg.get("agent_response_event", {}).get("agent_response", "")
                    elif event_type == "user_transcript":
                        role = "user"
                        text = msg.get("user_transcription_event", {}).get("user_transcript", "")

                    if role and text:
                        await event_manager.broadcast(user_id, {
                            "type":            "transcript",
                            "call_record_id":  call_id,
                            "role":            role,
                            "text":            text.strip(),
                            "timestamp":       datetime.now(timezone.utc).isoformat(),
                        })
                except Exception:
                    pass
    except Exception as exc:
        log.info("el_monitor_closed", call_id=call_id, reason=str(exc)[:120])


async def _enqueue_post_call(
    call_id: str,
    defer_seconds: int = 30,
    llm_model: str = "",
    llm_temperature: float = 0.0,
    stt_provider: str = "",
) -> None:
    """Enqueue post_call_processing ARQ task with a delay. Swallows errors — non-critical."""
    try:
        from arq import create_pool  # type: ignore[import-untyped]
        from arq.connections import RedisSettings  # type: ignore[import-untyped]
        from datetime import timedelta
        pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
        await pool.enqueue_job(
            "post_call_processing", call_id, llm_model, llm_temperature, stt_provider,
            _defer_by=timedelta(seconds=defer_seconds),
        )
        await pool.aclose()
        log.info("arq_enqueued", call_id=call_id, defer_seconds=defer_seconds,
                 llm_model=llm_model, stt_provider=stt_provider)
    except Exception as exc:
        log.warning("arq_enqueue_error", call_id=call_id, error=str(exc))

# TTL for call Redis context — 4 hours
_CTX_TTL = 14_400


def xml_response(content: str) -> Response:
    return Response(content=content, media_type="application/xml")


async def _twilio_auth_token_for_user(user_id: str | None, db: AsyncSession) -> str:
    if not user_id:
        return settings.twilio_auth_token
    try:
        from app.models.user import User as UserModel
        from app.utils.crypto import decrypt
        result = await db.execute(select(UserModel).where(UserModel.id == user_id))
        user = result.scalar_one_or_none()
        if user and user.twilio_auth_token:
            try:
                return decrypt(user.twilio_auth_token)
            except Exception:
                return user.twilio_auth_token
    except Exception as exc:
        log.warning("twilio_token_lookup_failed", user_id=user_id, error=str(exc))
    return settings.twilio_auth_token


def _verify_twilio_signature(request: Request, form_data: dict, auth_token: str | None = None) -> None:
    token = auth_token or settings.twilio_auth_token
    if not settings.is_production or not token:
        return
    try:
        from twilio.request_validator import RequestValidator
        validator = RequestValidator(token)
        if not validator.validate(str(request.url), form_data, request.headers.get("X-Twilio-Signature", "")):
            from fastapi import HTTPException
            raise HTTPException(status_code=403, detail="Invalid Twilio signature")
    except ImportError:
        pass


async def _register_and_respond(
    *,
    call: Call,
    agent_id: str,
    call_sid: str,
    redis: aioredis.Redis,
    db: AsyncSession,
) -> str:
    """
    Call EL register_call, store conv_id, seed Redis conv→call mapping, emit call_started.
    Returns TwiML string to send back to Twilio.
    """
    # Build dynamic variables from Redis call context
    raw_ctx = await redis.hgetall(f"call:{call.id}")
    lead_data   = json.loads(raw_ctx.get("lead_data", "{}"))
    agent_cfg   = json.loads(raw_ctx.get("agent_config", "{}"))

    dynamic_vars = {
        "lead_first_name": lead_data.get("first_name", "there"),
        "lead_last_name":  lead_data.get("last_name", ""),
        "lead_company":    lead_data.get("company", ""),
        "lead_title":      lead_data.get("title", ""),
        "product_name":    agent_cfg.get("product_name", ""),
        "company_name":    agent_cfg.get("company_name", ""),
        "call_id":         call.id,
        "caller_number":   lead_data.get("phone", call.to_number or ""),
    }
    dynamic_vars.update({k: v for k, v in lead_data.items() if k not in dynamic_vars})

    # Look up the EL agent_id from the agent record or context
    el_agent_id = agent_cfg.get("elevenlabs_agent_id", "")
    if not el_agent_id:
        # Fallback: query DB
        from app.models.agent import Agent as AgentModel
        r = await db.execute(select(AgentModel).where(AgentModel.id == agent_id))
        ag = r.scalar_one_or_none()
        el_agent_id = ag.elevenlabs_agent_id if ag else ""

    if not el_agent_id:
        log.error("native_register_no_el_agent",
                  call_id=call.id,
                  agent_id=agent_id,
                  note="Agent has no EL agent ID — was it synced to ElevenLabs?")
        return build_hangup_twiml()

    log.info("native_register_starting",
             call_id=call.id,
             agent_id=agent_id,
             el_agent_id=el_agent_id,
             from_number=call.from_number,
             to_number=call.to_number,
             direction=call.direction,
             dynamic_var_keys=list(dynamic_vars.keys()))

    # Call EL register_call — returns {"conversation_id": "conv_...", "twiml": "<?xml...>"}
    try:
        result = await elevenlabs_service.register_call(
            agent_id=el_agent_id,
            from_number=call.from_number,
            to_number=call.to_number,
            direction=call.direction,
            dynamic_vars=dynamic_vars,
        )
    except Exception as exc:
        log.error("native_register_call_error",
                  call_id=call.id,
                  el_agent_id=el_agent_id,
                  from_number=call.from_number,
                  to_number=call.to_number,
                  error=str(exc),
                  note="EL register_call threw an exception — returning hangup TwiML")
        return build_hangup_twiml()

    conversation_id = result.get("conversation_id", "")
    twiml           = result.get("twiml", "")

    if not twiml:
        log.error("native_register_empty_twiml",
                  call_id=call.id,
                  el_agent_id=el_agent_id,
                  result_keys=list(result.keys()),
                  note="EL returned no TwiML — returning hangup")
        return build_hangup_twiml()

    # Store Twilio call_sid in call context so tools can use it
    await redis.hset(f"call:{call.id}", "call_sid", call_sid)

    # Store conv → call_record mapping in Redis (tools look this up by conversation_id)
    if conversation_id:
        await redis.set(f"conv:{conversation_id}", call.id, ex=_CTX_TTL)
        log.info("native_conv_mapped",
                 call_id=call.id, conversation_id=conversation_id)

    # Store agent → active call mapping as fallback for tool webhooks.
    # EL's native Twilio integration does not send conversation_id in webhook
    # tool call bodies, so we need a secondary lookup keyed by agent_id.
    if agent_id:
        await redis.set(f"agent:{agent_id}:active_call_id", call.id, ex=_CTX_TTL)
        log.info("native_agent_call_mapped", call_id=call.id, agent_id=agent_id)

    # Persist conversation_id to DB
    if conversation_id:
        call.elevenlabs_conversation_id = conversation_id
        await db.commit()

    # Start Enterprise real-time monitoring relay (single test calls only).
    # For non-Enterprise accounts EL returns 403 and the task exits in milliseconds.
    # Campaign calls are excluded — they have no live transcript viewer.
    if conversation_id and not call.campaign_id:
        import asyncio
        asyncio.create_task(
            _monitor_el_conversation(
                conversation_id=conversation_id,
                call_id=call.id,
                user_id=call.user_id,
            )
        )

    # Emit call_started so frontend TestCallPanel transitions to "connected"
    await _emit(call, "call_started", redis)

    log.info("native_register_ok",
             call_id=call.id,
             call_sid=call_sid,
             conversation_id=conversation_id,
             direction=call.direction)

    return twiml


async def _emit(call: Call, event_type: str, redis) -> None:
    """Push a real-time event to the frontend via the event bus."""
    try:
        from app.websockets.event_bus import event_manager
        payload = {
            "type": event_type,
            "call_record_id": call.id,
            "agent_id": call.agent_id or "",
            "direction": call.direction,
        }
        await event_manager.broadcast(call.user_id, payload)
    except Exception as exc:
        log.warning("native_emit_error", event=event_type, error=str(exc))


# ─── Inbound call ─────────────────────────────────────────────────────────────

@router.post("/twilio/inbound")
async def inbound_call(
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    """Twilio calls this when someone dials one of our phone numbers."""
    form = await request.form()
    form_dict = dict(form)

    call_sid    = form.get("CallSid", "")
    from_number = form.get("From", "")
    to_number   = form.get("To", "")

    log.info("inbound_call_received",
             call_sid=call_sid,
             from_number=from_number,
             to_number=to_number)

    # Find the configured inbound agent for this number
    result = await db.execute(
        select(PhoneNumber).where(
            PhoneNumber.phone_number == to_number,
            PhoneNumber.is_active == True,
        )
    )
    phone_number = result.scalar_one_or_none()
    auth_token = await _twilio_auth_token_for_user(phone_number.user_id if phone_number else None, db)
    _verify_twilio_signature(request, form_dict, auth_token)

    if not phone_number:
        log.warning("inbound_call_no_phone_record",
                    to_number=to_number,
                    call_sid=call_sid,
                    note="No PhoneNumber record found for this number — hanging up. "
                         "Add this number in Settings → Phone Numbers and link it to an agent.")
        return xml_response(build_hangup_twiml())

    if not phone_number.inbound_enabled or not phone_number.inbound_agent_id:
        log.warning("inbound_call_not_configured",
                    to_number=to_number,
                    call_sid=call_sid,
                    inbound_enabled=phone_number.inbound_enabled,
                    inbound_agent_id=phone_number.inbound_agent_id,
                    note="Phone number found but inbound routing not configured — hanging up.")
        return xml_response(build_hangup_twiml())

    # Verify the linked agent is configured to accept inbound calls
    from app.models.agent import Agent as AgentModel
    agent_result = await db.execute(select(AgentModel).where(AgentModel.id == phone_number.inbound_agent_id))
    inbound_agent = agent_result.scalar_one_or_none()
    if not inbound_agent:
        log.error("inbound_call_agent_not_found",
                  to_number=to_number,
                  agent_id=phone_number.inbound_agent_id,
                  note="PhoneNumber points to an agent that no longer exists.")
        return xml_response(build_say_twiml(
            "Sorry, this number does not accept incoming calls. Please contact us through another channel. Goodbye."
        ))

    if inbound_agent.call_type == "outbound":
        log.warning("inbound_call_agent_is_outbound_only",
                    to_number=to_number,
                    agent_id=inbound_agent.id,
                    agent_name=inbound_agent.name,
                    note="Agent is configured for outbound only — rejecting inbound call.")
        return xml_response(build_say_twiml(
            "Sorry, this number does not accept incoming calls. Please contact us through another channel. Goodbye."
        ))

    log.info("inbound_call_routing",
             call_sid=call_sid,
             from_number=from_number,
             to_number=to_number,
             agent_id=inbound_agent.id,
             agent_name=inbound_agent.name,
             el_agent_id=inbound_agent.elevenlabs_agent_id or "MISSING")

    if not inbound_agent.is_active:
        log.warning("inbound_call_agent_inactive",
                    agent_id=inbound_agent.id,
                    agent_name=inbound_agent.name)
        return xml_response(build_say_twiml(
            "Sorry, this service is temporarily unavailable. Please try again later. Goodbye."
        ))

    # Create call record
    call = Call(
        id=new_uuid(),
        user_id=phone_number.user_id,
        agent_id=phone_number.inbound_agent_id,
        phone_number_id=phone_number.id,
        twilio_call_sid=call_sid,
        from_number=from_number,
        to_number=to_number,
        direction="inbound",
        status="in-progress",
        started_at=datetime.now(timezone.utc).isoformat(),
        answered_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(call)
    await db.flush()

    # Seed call context in Redis (tools will read this)
    await _seed_redis_context(redis, call, phone_number.inbound_agent_id, db)

    twiml = await _register_and_respond(
        call=call, agent_id=phone_number.inbound_agent_id,
        call_sid=call_sid, redis=redis, db=db,
    )
    await db.commit()
    return xml_response(twiml)


# ─── Outbound TwiML (called by Twilio when outbound call is answered) ─────────

@router.post("/twilio/twiml/{call_record_id}")
async def outbound_twiml(
    call_record_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    """Twilio calls this when an outbound call is answered. Returns EL TwiML."""
    form = await request.form()

    call_sid      = form.get("CallSid", "")
    call_status   = form.get("CallStatus", "")
    from_number   = form.get("From", "")
    to_number     = form.get("To", "")
    call_duration = form.get("CallDuration", "")

    log.info("twilio_twiml_request",
             call_record_id=call_record_id,
             call_sid=call_sid,
             twilio_status=call_status,
             from_number=from_number,
             to_number=to_number,
             duration=call_duration,
             note="Twilio called our TwiML URL — outbound call was answered")

    result = await db.execute(select(Call).where(Call.id == call_record_id))
    call = result.scalar_one_or_none()
    auth_token = await _twilio_auth_token_for_user(call.user_id if call else None, db)
    _verify_twilio_signature(request, dict(form), auth_token)

    if not call:
        log.error("native_twiml_call_not_found",
                  call_record_id=call_record_id,
                  call_sid=call_sid,
                  note="No call record found for this TwiML request — returning hangup")
        return xml_response(build_hangup_twiml())

    if settings.campaign_debug and call.campaign_id:
        log.debug("campaign_twiml_answered",
                  call_record_id=call_record_id,
                  call_sid=call_sid,
                  campaign_id=call.campaign_id,
                  to_number=call.to_number)

    # Confirm call_sid (may differ from the initiated SID in edge cases)
    if call_sid and not call.twilio_call_sid:
        call.twilio_call_sid = call_sid
    call.status = "in-progress"
    call.answered_at = datetime.now(timezone.utc).isoformat()
    await db.flush()

    # Ensure context is seeded (outbound seeds at creation; inbound seeds above)
    await _seed_redis_context(redis, call, call.agent_id, db)

    twiml = await _register_and_respond(
        call=call, agent_id=call.agent_id,
        call_sid=call_sid or call.twilio_call_sid or call.id,
        redis=redis, db=db,
    )
    await db.commit()
    return xml_response(twiml)


# ─── Status callback ──────────────────────────────────────────────────────────

@router.post("/twilio/status")
async def call_status_callback(
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    """Twilio status callbacks — initiated / ringing / answered / completed / failed."""
    form = await request.form()

    call_sid    = form.get("CallSid", "")
    call_status = form.get("CallStatus", "")
    duration    = form.get("CallDuration")
    from_num    = form.get("From", "")
    to_num      = form.get("To", "")

    log.info("twilio_status_callback",
             call_sid=call_sid,
             twilio_status=call_status,
             duration_s=duration,
             from_number=from_num,
             to_number=to_num)

    result = await db.execute(select(Call).where(Call.twilio_call_sid == call_sid))
    call = result.scalar_one_or_none()
    auth_token = await _twilio_auth_token_for_user(call.user_id if call else None, db)
    _verify_twilio_signature(request, dict(form), auth_token)

    if not call:
        # This can happen for transfer-leg calls (different SID) or orphaned records.
        log.warning("twilio_status_no_call_record",
                    call_sid=call_sid,
                    twilio_status=call_status,
                    note="No call record matched this Twilio SID. "
                         "Possible causes: transfer leg SID, call initiated outside Voxara, "
                         "or DB record was deleted.")
        return Response(status_code=204)

    log.info("twilio_status_matched",
             call_id=call.id,
             call_sid=call_sid,
             twilio_status=call_status,
             current_db_status=call.status,
             el_conv_id=call.elevenlabs_conversation_id or "none",
             duration_s=duration,
             campaign_id=call.campaign_id or "none")

    final_statuses = ("completed", "failed", "busy", "no-answer", "canceled")
    if call_status in final_statuses:
        already_finalized = bool(call.ended_at and call.status in final_statuses)
        log.info("twilio_status_finalizing",
                 call_id=call.id,
                 twilio_status=call_status,
                 duration_s=duration,
                 already_finalized=already_finalized)
        call.status = call_status
        if duration:
            call.duration_seconds = int(duration)
        if not call.ended_at:
            call.ended_at = datetime.now(timezone.utc).isoformat()
        if not already_finalized:
            await _finalize_call(call, redis, db)
    else:
        # For any other status (initiated, ringing, in-progress): update status,
        # but also check EL — the call may have already ended on EL's side before
        # Twilio fires the "completed" event (common with native integration).
        call.status = call_status
        if duration:
            call.duration_seconds = int(duration)
        if call.elevenlabs_conversation_id:
            el_status = await elevenlabs_service.get_conversation_status(
                call.elevenlabs_conversation_id
            )
            log.info("twilio_status_el_check",
                     call_id=call.id,
                     twilio_status=call_status,
                     el_status=el_status,
                     el_conv_id=call.elevenlabs_conversation_id)
            if el_status in ("done", "failed"):
                log.info("twilio_status_el_already_done",
                         call_id=call.id,
                         el_status=el_status,
                         note="EL finished before Twilio sent completed — finalizing now")
                call.status = "completed"
                call.ended_at = datetime.now(timezone.utc).isoformat()
                await _finalize_call(call, redis, db)
        else:
            log.info("twilio_status_no_el_conv",
                     call_id=call.id,
                     twilio_status=call_status,
                     note="No EL conversation ID yet — call may still be ringing or EL registration failed")

    await db.commit()
    return Response(status_code=204)


async def _finalize_call(call: Call, redis, db: AsyncSession) -> None:
    """Fetch EL transcript + Redis stages, write to DB, emit call_ended, enqueue ARQ.

    EL takes 5-30s to finalize transcription after a call ends. We check the
    conversation status first: if already done we fetch immediately; if still
    processing we skip and let the ARQ worker (enqueued with a 30s delay) handle it.
    This guarantees the transcript is saved regardless of which side ended the call.
    """
    if settings.campaign_debug and call.campaign_id:
        log.debug("campaign_finalize_call",
                  call_id=call.id,
                  campaign_id=call.campaign_id,
                  final_status=call.status,
                  duration_s=call.duration_seconds,
                  conv_id=call.elevenlabs_conversation_id)

    # ── Read transfer metadata from Redis ────────────────────────────────────
    transfer_info: dict = {}
    try:
        raw_ctx = await redis.hgetall(f"call:{call.id}")
        if raw_ctx.get("transferred") == "1":
            transfer_info = {
                "transferred_to":  raw_ctx.get("transferred_to", ""),
                "transfer_type":   raw_ctx.get("transfer_type", "cold"),
                "transfer_reason": raw_ctx.get("transfer_reason", ""),
                "transferred_at":  raw_ctx.get("transferred_at", ""),
                "fallback_status": raw_ctx.get("transfer_fallback_status", ""),
            }
            # Stamp forced_outcome onto call.outcome NOW while Redis still exists.
            # post_call_processing reads this as `hint` — the hint mechanism then
            # prevents EL/LLM from overriding it.
            forced = (raw_ctx.get("forced_outcome") or "").strip()
            if forced:
                call.outcome = forced
                log.info("transfer_forced_outcome_stamped",
                         call_id=call.id, outcome=forced)
    except Exception as exc:
        log.warning("transfer_metadata_read_error", call_id=call.id, error=str(exc))

    # ── Fetch agent config for post-call ARQ args ─────────────────────────────
    # One DB query here — _finalize_call already has a session open and is doing
    # writes. Typed values passed directly to ARQ; no Redis string conversion needed.
    llm_model: str = ""
    llm_temperature: float = 0.0
    stt_provider: str = ""
    if call.agent_id:
        from app.models.agent import Agent as AgentModel
        agent_result = await db.execute(
            select(AgentModel).where(AgentModel.id == call.agent_id)
        )
        agent_obj = agent_result.scalar_one_or_none()
        if agent_obj:
            llm_model       = agent_obj.llm_model or ""
            llm_temperature = agent_obj.llm_temperature or 0.0
            stt_provider    = agent_obj.stt_provider or ""

    # ── Transcript from ElevenLabs ───────────────────────────────────────────
    if call.elevenlabs_conversation_id:
        el_status = await elevenlabs_service.get_conversation_status(
            call.elevenlabs_conversation_id
        )
        log.info("finalize_el_status_check",
                 call_id=call.id,
                 el_status=el_status,
                 conv_id=call.elevenlabs_conversation_id,
                 call_status=call.status)
        if el_status == "done":
            transcript = await elevenlabs_service.get_conversation_transcript(
                call.elevenlabs_conversation_id
            )
            if transcript:
                call.transcript = transcript
                log.info("native_transcript_saved",
                         call_id=call.id,
                         msgs=len(transcript),
                         conv_id=call.elevenlabs_conversation_id)
            else:
                log.warning("native_transcript_empty_after_done",
                            call_id=call.id,
                            conv_id=call.elevenlabs_conversation_id)
        elif el_status == "failed":
            # EL terminated abnormally — termination_reason already logged by get_conversation_status
            log.warning("native_transcript_el_failed",
                        call_id=call.id,
                        conv_id=call.elevenlabs_conversation_id,
                        note="EL conversation failed — check el_conversation_status_failed log above for error_code/reason")
        else:
            # EL still processing — ARQ task will retry after 30s
            log.info("native_transcript_deferred",
                     call_id=call.id,
                     el_status=el_status,
                     conv_id=call.elevenlabs_conversation_id)

    # ── Append transfer event to transcript (if transfer happened) ───────────
    if transfer_info:
        transferred_to   = transfer_info["transferred_to"]
        transfer_type    = transfer_info["transfer_type"]
        fallback_status  = transfer_info["fallback_status"]
        transferred_at   = transfer_info["transferred_at"] or datetime.now(timezone.utc).isoformat()

        if fallback_status in ("", "answered", "completed"):
            outcome_note = "Call successfully transferred to human agent."
        elif fallback_status == "busy":
            outcome_note = "Transfer attempted — human agent was busy."
        elif fallback_status == "no-answer":
            outcome_note = "Transfer attempted — human agent did not answer."
        elif fallback_status in ("redirect_failed", "redirect_timeout", "redirect_error"):
            outcome_note = "Transfer could not be started."
        else:
            outcome_note = f"Transfer attempted — outcome: {fallback_status}."

        transfer_entry = {
            "role": "system",
            "text": (
                f"[Transfer] {transfer_type.capitalize()} transfer to {transferred_to}. "
                f"{outcome_note}"
                + (f" Reason: {transfer_info['transfer_reason']}." if transfer_info.get("transfer_reason") else "")
            ),
            "timestamp": transferred_at,
        }
        current_transcript = list(call.transcript or [])
        current_transcript.append(transfer_entry)
        call.transcript = current_transcript
        log.info(
            "transfer_event_appended_to_transcript",
            call_id=call.id,
            transferred_to=transferred_to,
            fallback_status=fallback_status or "answered",
        )

    # ── Stage timeline from Redis ────────────────────────────────────────────
    stages_key = f"call:{call.id}:stages"
    try:
        stages_raw = await redis.lrange(stages_key, 0, -1)
        if stages_raw:
            call.stage_timeline = [json.loads(s) for s in stages_raw]
    except Exception as exc:
        log.warning("native_stages_read_error", call_id=call.id, error=str(exc))

    # ── Emit call_ended to frontend ──────────────────────────────────────────
    await _emit(call, "call_ended", redis)

    # ── Enqueue post-call processing as ARQ safety net ───────────────────────
    # EL post-call webhook is the primary path (fires in ~1x call duration seconds).
    # ARQ fires at 1.5x call duration (min 60s) as a fallback if the webhook missed.
    duration = call.duration_seconds or 0
    arq_delay = max(60, int(duration * 1.5))
    await _enqueue_post_call(
        call.id,
        defer_seconds=arq_delay,
        llm_model=llm_model,
        llm_temperature=llm_temperature,
        stt_provider=stt_provider,
    )

    # ── Cleanup Redis call context ───────────────────────────────────────────
    try:
        await redis.delete(
            f"call:{call.id}",
            f"call:{call.id}:stages",
            f"call:{call.twilio_call_sid or ''}",
            f"call:{call.twilio_call_sid or ''}:stages",
            f"call:{call.twilio_call_sid or ''}:transcript",
            f"conv:{call.elevenlabs_conversation_id or ''}",
            f"agent:{call.agent_id or ''}:active_call_id",
        )
    except Exception:
        pass


# ─── Transfer fallback ────────────────────────────────────────────────────────
#
# Twilio calls this URL as the <Dial action> when the human-agent leg ends.
# DialCallStatus values: answered | busy | no-answer | failed | canceled
#
# "answered" means the call was successfully transferred and both parties spoke.
# All other statuses mean the human agent was unreachable — we handle each case
# with a spoken message and a clean hang-up so the customer is never left in silence.

def _num_for_speech(e164: str) -> str:
    """Convert E.164 to a spoken-friendly digit string."""
    digits = e164.lstrip("+")
    if len(digits) == 11 and digits.startswith("1"):
        return f"{digits[1:4]} {digits[4:7]} {digits[7:]}"
    return " ".join(digits[i : i + 3] for i in range(0, len(digits), 3))


@router.post("/twilio/transfer-fallback")
async def transfer_fallback(
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    """
    Handle the outcome of a human-agent transfer dial.
    Always returns TwiML — Twilio will execute it on the customer's leg.
    """
    form = await request.form()
    dial_status = form.get("DialCallStatus", "completed")

    # Query-string params were appended by transfer_to_human.py when building the URL
    call_record_id = request.query_params.get("call_record_id", "")
    transfer_to    = request.query_params.get("transfer_to", "")
    call = None
    if call_record_id:
        result = await db.execute(select(Call).where(Call.id == call_record_id))
        call = result.scalar_one_or_none()
    auth_token = await _twilio_auth_token_for_user(call.user_id if call else None, db)
    _verify_twilio_signature(request, dict(form), auth_token)

    log.info(
        "transfer_fallback_received",
        dial_status=dial_status,
        call_record_id=call_record_id,
        transfer_to=transfer_to,
    )

    # ── Stamp the fallback outcome in Redis for transcript annotation ──────────
    if call_record_id:
        await redis.hset(
            f"call:{call_record_id}",
            "transfer_fallback_status",
            dial_status,
        )

    # ── Answered/completed: call completed normally — just hang up gracefully ──
    if dial_status in ("answered", "completed"):
        return xml_response(
            '<?xml version="1.0" encoding="UTF-8"?>'
            "<Response><Hangup/></Response>"
        )

    # ── Human agent unreachable — craft an appropriate spoken message ──────────
    num_spoken = _num_for_speech(transfer_to) if transfer_to else "our direct line"

    if dial_status == "busy":
        primary = (
            "Our team member is currently on another call. "
            f"You can reach them directly at {num_spoken}, "
            "or please try calling back in a few minutes."
        )
    elif dial_status == "no-answer":
        primary = (
            "Our team member is not available to take your call right now. "
            f"You can reach us directly at {num_spoken}, "
            "or leave a message and someone will get back to you shortly."
        )
    elif dial_status in ("failed", "canceled"):
        primary = (
            "The transfer could not be completed at this time. "
            f"Please contact our team directly at {num_spoken}. "
            "We apologize for the inconvenience."
        )
    else:
        primary = (
            f"We were unable to connect you with a human agent. "
            f"Please reach us at {num_spoken}."
        )

    twiml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        "<Response>"
        f"<Say>{primary}</Say>"
        '<Pause length="1"/>'
        "<Say>Thank you for your patience. Goodbye.</Say>"
        "<Hangup/>"
        "</Response>"
    )
    return xml_response(twiml)


# ─── Recording callback ───────────────────────────────────────────────────────

async def _enqueue_transcribe_human_leg(call_id: str, recording_sid: str) -> None:
    """Enqueue transcribe_human_leg ARQ task. Swallows errors — non-critical."""
    try:
        from arq import create_pool
        from arq.connections import RedisSettings
        from datetime import timedelta
        pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
        # Allow 30s for Twilio to finish processing the recording before we download it
        await pool.enqueue_job(
            "transcribe_human_leg", call_id, recording_sid,
            _defer_by=timedelta(seconds=30),
        )
        await pool.aclose()
        log.info("arq_transcribe_enqueued", call_id=call_id, recording_sid=recording_sid)
    except Exception as exc:
        log.warning("arq_transcribe_enqueue_error", call_id=call_id, error=str(exc))


@router.post("/twilio/recording")
async def recording_callback(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    form = await request.form()
    call_sid      = form.get("CallSid", "")
    recording_url = form.get("RecordingUrl", "")
    recording_sid = form.get("RecordingSid", "")

    call_record_id = request.query_params.get("call_record_id", "")
    is_transfer    = request.query_params.get("is_transfer", "0") == "1"

    call = None

    # For transfer recordings the recording CallSid is the dialed-leg SID, not the
    # original call SID. Use the call_record_id query param as the primary lookup.
    if call_record_id:
        result = await db.execute(select(Call).where(Call.id == call_record_id))
        call = result.scalar_one_or_none()

    if not call and call_sid:
        result = await db.execute(select(Call).where(Call.twilio_call_sid == call_sid))
        call = result.scalar_one_or_none()

    auth_token = await _twilio_auth_token_for_user(call.user_id if call else None, db)
    _verify_twilio_signature(request, dict(form), auth_token)

    if call:
        if not is_transfer:
            call.recording_url = recording_url
            call.recording_sid = recording_sid
            await db.commit()

        if is_transfer and recording_sid:
            await _enqueue_transcribe_human_leg(call.id, recording_sid)

    return Response(status_code=204)


# ─── Redis context seeder ─────────────────────────────────────────────────────

async def _seed_redis_context(redis, call: Call, agent_id: str, db: AsyncSession) -> None:
    """Pre-load call context into Redis so tier 1 tools have fast access.

    For outbound calls (single test calls and campaign calls) the context is
    already seeded at call-creation time with the correct lead_data.  This
    function acts as a safety-net re-seed — it must NOT overwrite lead_data
    that was already set, otherwise campaign contact details are lost.
    """
    from app.models.agent import Agent as AgentModel

    result = await db.execute(select(AgentModel).where(AgentModel.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        return

    # Preserve existing lead_data (set by campaign task or POST /calls/outbound).
    # hget returns bytes in most aioredis builds; decode defensively.
    existing_lead_data_raw = await redis.hget(f"call:{call.id}", "lead_data")
    if isinstance(existing_lead_data_raw, bytes):
        existing_lead_data_raw = existing_lead_data_raw.decode()
    lead_data = existing_lead_data_raw or json.dumps({})

    context = {
        "call_record_id":  call.id,
        "call_sid":        call.twilio_call_sid or "",
        "agent_id":        agent.id,
        "user_id":         agent.user_id,
        "lead_id":         call.lead_id or "",
        "direction":       call.direction,
        "enabled_tools":   json.dumps(agent.enabled_tools),
        "tool_configs":    json.dumps(agent.tool_configs),
        "agent_config":    json.dumps({
            "call_script":         agent.call_script,
            "system_prompt":       agent.system_prompt,
            "company_name":        agent.company_name,
            "product_name":        agent.product_name,
            "elevenlabs_agent_id": agent.elevenlabs_agent_id,
        }),
        "lead_data": lead_data,
    }
    await redis.hset(f"call:{call.id}", mapping=context)
    await redis.expire(f"call:{call.id}", _CTX_TTL)


# ─── ElevenLabs post-call webhook ─────────────────────────────────────────────
#
# ElevenLabs fires POST /webhooks/elevenlabs/post-call when a conversation is
# fully done and transcription + analysis are complete.
#
# Official docs: https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks
#
# To configure in EL console:
#   Conversational AI → Settings → Post-call webhooks →
#   URL: {your_public_url}/api/v1/webhooks/elevenlabs/post-call
#   Secret: copy value → set ELEVENLABS_WEBHOOK_SECRET in backend/.env
#
# EL retries up to 5 times with exponential backoff on non-2xx responses.
# Returning 200 immediately then processing async keeps retry count low.

@router.post("/elevenlabs/post-call")
async def elevenlabs_post_call(
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    """
    Receives ElevenLabs post_call_transcription event.
    Saves transcript to DB and emits call_processed to the frontend.
    This is the primary transcript delivery path — no polling required.
    """
    body = await request.body()

    try:
        payload = json.loads(body)
    except Exception:
        return Response(status_code=400)

    event_type = payload.get("type")
    if event_type != "post_call_transcription":
        return Response(status_code=200)

    data = payload.get("data", {})
    conversation_id = data.get("conversation_id") or payload.get("conversation_id")
    if not conversation_id:
        return Response(status_code=400)

    # ── HMAC-SHA256 signature verification ───────────────────────────────────
    # Look up the call → user → their stored webhook secret (falls back to env)
    sig_header = request.headers.get("ElevenLabs-Signature", "")
    if sig_header:
        call_result = await db.execute(
            select(Call).where(Call.elevenlabs_conversation_id == conversation_id)
        )
        _call_for_sig = call_result.scalar_one_or_none()
        secret = None
        if _call_for_sig:
            from app.models.user import User as UserModel
            from app.utils.crypto import decrypt
            user_result = await db.execute(select(UserModel).where(UserModel.id == _call_for_sig.user_id))
            _user = user_result.scalar_one_or_none()
            if _user and _user.elevenlabs_webhook_secret:
                try:
                    secret = decrypt(_user.elevenlabs_webhook_secret)
                except Exception:
                    secret = _user.elevenlabs_webhook_secret
        # Fall back to env secret if user hasn't saved one yet
        if not secret:
            secret = settings.elevenlabs_webhook_secret
        if secret:
            parts = dict(p.split("=", 1) for p in sig_header.split(",") if "=" in p)
            timestamp = parts.get("t", "")
            signature = parts.get("v0", "")
            signed_payload = f"{timestamp}.{body.decode()}"
            expected = hmac.new(secret.encode(), signed_payload.encode(), hashlib.sha256).hexdigest()
            if not hmac.compare_digest(expected, signature):
                log.warning("el_webhook_invalid_signature", conversation_id=conversation_id)
                return Response(status_code=403)

    log.info("el_post_call_webhook_received", conversation_id=conversation_id)

    # ── Find the call record by EL conversation ID ────────────────────────────
    result = await db.execute(
        select(Call).where(Call.elevenlabs_conversation_id == conversation_id)
    )
    call = result.scalar_one_or_none()
    if not call:
        log.warning("el_webhook_call_not_found", conversation_id=conversation_id)
        return Response(status_code=200)  # 200 so EL doesn't retry for a missing record

    # ── Check if call was transferred ─────────────────────────────────────────
    # EL ends its AI conversation immediately upon transfer, but Twilio <Dial> may
    # still be active for the human-agent leg. The transfer_to_human tool stamps
    # Redis with transferred=1 before redirecting. Redis is cleaned up by
    # _finalize_call (from Twilio status callback) which fires AFTER this webhook.
    is_transferred = (await redis.hget(f"call:{call.id}", "transferred")) == "1"
    if is_transferred:
        log.info("el_webhook_transferred_call", call_id=call.id,
                 note="AI leg ended; human leg may still be active — saving transcript only, "
                      "deferring finalization to Twilio status callback")

    # ── Parse transcript from EL webhook payload ──────────────────────────────
    # EL delivers the same format as GET /convai/conversations/{id}
    raw_transcript = data.get("transcript", [])
    if raw_transcript:
        meta = data.get("metadata", {})
        start_unix = meta.get("start_time_unix_secs")
        base_dt = (
            datetime.fromtimestamp(start_unix, tz=timezone.utc)
            if start_unix
            else datetime.now(timezone.utc)
        )
        transcript = []
        for entry in raw_transcript:
            text = (entry.get("message") or "").strip()
            if not text:
                continue
            time_offset = entry.get("time_in_call_secs", 0) or 0
            iso_ts = datetime.fromtimestamp(
                base_dt.timestamp() + time_offset, tz=timezone.utc
            ).isoformat()
            transcript.append({
                "role": entry.get("role", "user"),
                "text": text,
                "timestamp": iso_ts,
            })

        if transcript:
            # Preserve system/human_agent/customer entries that EL doesn't know about.
            # 'customer' is used for diarized customer speech in the human-agent leg.
            extras = [
                e for e in (call.transcript or [])
                if e.get("role") in ("system", "human_agent", "customer")
            ]
            call.transcript = transcript + extras
            log.info("el_webhook_transcript_saved",
                     call_id=call.id, msgs=len(transcript),
                     extras=len(extras),
                     conversation_id=conversation_id)

    # ── Pull all analysis fields EL provides in the webhook payload ──────────
    el_analysis = data.get("analysis", {})
    if el_analysis:
        call.auto_summary    = el_analysis.get("transcript_summary") or call.auto_summary
        call.sentiment_score = el_analysis.get("user_sentiment_score") or call.sentiment_score

        # Save criteria + data collection immediately — don't wait for ARQ
        criteria_results = el_analysis.get("criteria_results") or []
        call_successful_el = el_analysis.get("call_successful") or "unknown"
        if criteria_results or not call.el_analysis_results:
            call.el_analysis_results = {
                "criteria_results": criteria_results,
                "call_successful": call_successful_el,
            }
        data_coll = el_analysis.get("data_collection_results")
        if data_coll:
            call.el_data_collection = data_coll
        if criteria_results:
            log.info("el_webhook_criteria_saved",
                     call_id=call.id, criteria_count=len(criteria_results))

    # ── Duration from metadata ────────────────────────────────────────────────
    meta = data.get("metadata", {})
    if meta.get("call_duration_secs") and not call.duration_seconds:
        call.duration_seconds = int(meta["call_duration_secs"])

    # ── Transferred calls: save EL data, then defer the rest ─────────────────
    # For transferred calls the human-agent leg is still active. We save the EL
    # transcript + metadata now, then let the Twilio status callback (which fires
    # after the human leg completes) run _finalize_call, enqueue post_call_processing,
    # and emit call_ended / call_processed with the full assembled transcript.
    if is_transferred:
        await db.commit()
        log.info("el_webhook_transferred_deferred",
                 call_id=call.id, transcript_len=len(call.transcript or []))
        return Response(status_code=200)

    call.status = "completed"
    if not call.ended_at:
        call.ended_at = datetime.now(timezone.utc).isoformat()

    # ── Set outcome from EL analysis + compute cheap metrics ─────────────────
    # EL provides call_successful ("success"|"failure"|"unknown") — use it
    # directly for normal calls; no LLM needed here.  Transfer calls keep
    # forced_outcome set by _finalize_call.  ARQ re-classifies the full
    # conversation with LLM only for calls with a human leg.
    if not call.outcome and el_analysis:
        call_successful_el = el_analysis.get("call_successful") or "unknown"
        call.outcome = {
            "success": "goal_achieved",
            "failure": "not_interested",
            "unknown": "follow_up_needed",
        }.get(call_successful_el, "follow_up_needed")
        log.info("el_webhook_outcome_from_el",
                 call_id=call.id, outcome=call.outcome,
                 call_successful=call_successful_el)

    if call.transcript:
        try:
            from app.tasks.post_call_tasks import _compute_sentiment, _compute_talk_ratio
            if not call.sentiment_score:
                call.sentiment_score = _compute_sentiment(call.transcript)
            if not call.talk_ratio:
                call.talk_ratio = _compute_talk_ratio(call.transcript)
        except Exception as exc:
            log.warning("el_webhook_metrics_error", call_id=call.id, error=str(exc))

    await db.commit()

    try:
        from app.tasks.post_call_tasks import _update_lead_stats
        await _update_lead_stats(call, db)
    except Exception as exc:
        log.warning("el_webhook_lead_stats_error", call_id=call.id, error=str(exc))

    if call.campaign_id:
        try:
            from app.tasks.post_call_tasks import _update_campaign_counters
            await _update_campaign_counters(call, db)
        except Exception as exc:
            log.warning("el_webhook_campaign_counter_error", call_id=call.id, error=str(exc))

    # ── Notify frontend with full processed data ──────────────────────────────
    # Only emit for single test calls — campaign calls are shown as cards on the
    # Campaigns page and don't have a live transcript viewer that consumes this event.
    if not call.campaign_id:
        try:
            from app.websockets.event_bus import event_manager
            await event_manager.broadcast(call.user_id, {
                "type":            "call_processed",
                "call_record_id":  call.id,
                "outcome":         call.outcome,
                "auto_summary":    call.auto_summary,
                "next_action":     call.next_action,
                "sentiment_score": call.sentiment_score,
                "talk_ratio":      call.talk_ratio,
                "transcript_len":  len(call.transcript or []),
            })
        except Exception:
            pass

    return Response(status_code=200)
