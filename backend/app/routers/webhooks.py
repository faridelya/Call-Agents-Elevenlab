"""
Twilio webhook handlers for native ElevenLabs integration.

Flow (outbound):
  1. Our server dials Twilio → Twilio calls /twiml/{call_record_id} when answered
  2. We call EL register_call() → get back TwiML + conversation_id
  3. We seed Redis conv mapping, store conv_id in DB, emit call_started
  4. Return TwiML to Twilio → EL owns the WebSocket to Twilio natively

Flow (inbound):
  1. Twilio receives inbound call → calls /inbound
  2. Same register_call() path

Post-call (status callback):
  1. Twilio POSTs completed status → we fetch transcript from EL API
  2. Store transcript + stages in DB, emit call_ended, enqueue ARQ task
"""
import json
import structlog
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import get_db
from app.db.redis import get_redis
from app.models.base import new_uuid
from app.models.call import Call
from app.models.phone_number import PhoneNumber
from app.services.elevenlabs_service import elevenlabs_service
from app.utils.twiml import build_hangup_twiml
import redis.asyncio as aioredis

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/webhooks/twilio", tags=["webhooks"])

# TTL for call Redis context — 4 hours
_CTX_TTL = 14_400


def xml_response(content: str) -> Response:
    return Response(content=content, media_type="application/xml")


def _verify_twilio_signature(request: Request, form_data: dict) -> None:
    if not settings.is_production or not settings.twilio_auth_token:
        return
    try:
        from twilio.request_validator import RequestValidator
        validator = RequestValidator(settings.twilio_auth_token)
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
        log.error("native_register_no_el_agent", call_id=call.id, agent_id=agent_id)
        return build_hangup_twiml()

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
        log.error("native_register_call_error", call_id=call.id, error=str(exc))
        return build_hangup_twiml()

    conversation_id = result.get("conversation_id", "")
    twiml           = result.get("twiml", "")

    if not twiml:
        log.error("native_register_empty_twiml", call_id=call.id, result=result)
        return build_hangup_twiml()

    # Store Twilio call_sid in call context so tools can use it
    await redis.hset(f"call:{call.id}", "call_sid", call_sid)

    # Store conv → call_record mapping in Redis (tools look this up by conversation_id)
    if conversation_id:
        await redis.set(f"conv:{conversation_id}", call.id, ex=_CTX_TTL)
        log.info("native_conv_mapped",
                 call_id=call.id, conversation_id=conversation_id)

    # Persist conversation_id to DB
    if conversation_id:
        call.elevenlabs_conversation_id = conversation_id
        await db.commit()

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

@router.post("/inbound")
async def inbound_call(
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    """Twilio calls this when someone dials one of our phone numbers."""
    form = await request.form()
    form_dict = dict(form)
    _verify_twilio_signature(request, form_dict)

    call_sid    = form.get("CallSid", "")
    from_number = form.get("From", "")
    to_number   = form.get("To", "")

    # Find the configured inbound agent for this number
    result = await db.execute(
        select(PhoneNumber).where(
            PhoneNumber.phone_number == to_number,
            PhoneNumber.is_active == True,
        )
    )
    phone_number = result.scalar_one_or_none()
    if not phone_number or not phone_number.inbound_enabled or not phone_number.inbound_agent_id:
        return xml_response(build_hangup_twiml())

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

@router.post("/twiml/{call_record_id}")
async def outbound_twiml(
    call_record_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    """Twilio calls this when an outbound call is answered. Returns EL TwiML."""
    form = await request.form()
    _verify_twilio_signature(request, dict(form))
    call_sid = form.get("CallSid", "")

    result = await db.execute(select(Call).where(Call.id == call_record_id))
    call = result.scalar_one_or_none()
    if not call:
        log.warning("native_twiml_call_not_found", call_record_id=call_record_id)
        return xml_response(build_hangup_twiml())

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

@router.post("/status")
async def call_status_callback(
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    """Twilio status callbacks — initiated / ringing / answered / completed / failed."""
    form = await request.form()
    _verify_twilio_signature(request, dict(form))

    call_sid    = form.get("CallSid", "")
    call_status = form.get("CallStatus", "")
    duration    = form.get("CallDuration")

    result = await db.execute(select(Call).where(Call.twilio_call_sid == call_sid))
    call = result.scalar_one_or_none()
    if not call:
        return Response(status_code=204)

    call.status = call_status
    if duration:
        call.duration_seconds = int(duration)
    if call_status in ("completed", "failed", "busy", "no-answer", "canceled"):
        call.ended_at = datetime.now(timezone.utc).isoformat()

    # On completion: fetch transcript from EL, persist stages from Redis
    if call_status in ("completed", "failed"):
        await _finalize_call(call, redis, db)

    await db.commit()
    return Response(status_code=204)


async def _finalize_call(call: Call, redis, db: AsyncSession) -> None:
    """Fetch EL transcript + Redis stages, write to DB, emit call_ended, enqueue ARQ."""
    # Fetch transcript from ElevenLabs API
    if call.elevenlabs_conversation_id:
        transcript = await elevenlabs_service.get_conversation_transcript(
            call.elevenlabs_conversation_id
        )
        if transcript:
            call.transcript = transcript
            log.info("native_transcript_saved",
                     call_id=call.id,
                     msgs=len(transcript),
                     conv_id=call.elevenlabs_conversation_id)

    # Recover stage timeline from Redis (written by update_call_stage tool)
    stages_key = f"call:{call.id}:stages"
    try:
        stages_raw = await redis.lrange(stages_key, 0, -1)
        if stages_raw:
            call.stage_timeline = [json.loads(s) for s in stages_raw]
    except Exception as exc:
        log.warning("native_stages_read_error", call_id=call.id, error=str(exc))

    # Emit call_ended for frontend
    await _emit(call, "call_ended", redis)

    # Enqueue post-call processing (AI summary, CRM sync, etc.)
    try:
        from arq import create_pool
        from arq.connections import RedisSettings
        pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
        await pool.enqueue_job("post_call_processing", call.id)
        await pool.aclose()
    except Exception as exc:
        log.warning("native_arq_enqueue_error", call_id=call.id, error=str(exc))

    # Cleanup Redis call context
    try:
        await redis.delete(
            f"call:{call.id}",
            f"call:{call.id}:stages",
            f"call:{call.twilio_call_sid or ''}",
            f"conv:{call.elevenlabs_conversation_id or ''}",
        )
    except Exception:
        pass


# ─── Recording callback ───────────────────────────────────────────────────────

@router.post("/recording")
async def recording_callback(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    form = await request.form()
    call_sid      = form.get("CallSid", "")
    recording_url = form.get("RecordingUrl", "")
    recording_sid = form.get("RecordingSid", "")

    result = await db.execute(select(Call).where(Call.twilio_call_sid == call_sid))
    call = result.scalar_one_or_none()
    if call:
        call.recording_url = recording_url
        call.recording_sid = recording_sid
        await db.commit()

    return Response(status_code=204)


# ─── Redis context seeder ─────────────────────────────────────────────────────

async def _seed_redis_context(redis, call: Call, agent_id: str, db: AsyncSession) -> None:
    """Pre-load call context into Redis so tier 1 tools have fast access."""
    from app.models.agent import Agent as AgentModel

    result = await db.execute(select(AgentModel).where(AgentModel.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        return

    context = {
        "call_record_id": call.id,
        "call_sid":       call.twilio_call_sid or "",
        "agent_id":       agent.id,
        "user_id":        agent.user_id,
        "direction":      call.direction,
        "enabled_tools":  json.dumps(agent.enabled_tools),
        "tool_configs":   json.dumps(agent.tool_configs),
        "agent_config":   json.dumps({
            "call_script":         agent.call_script,
            "system_prompt":       agent.system_prompt,
            "company_name":        agent.company_name,
            "product_name":        agent.product_name,
            "elevenlabs_agent_id": agent.elevenlabs_agent_id,
        }),
        "lead_data": json.dumps({}),
    }
    await redis.hset(f"call:{call.id}", mapping=context)
    await redis.expire(f"call:{call.id}", _CTX_TTL)
