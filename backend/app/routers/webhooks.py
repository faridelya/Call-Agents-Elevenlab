"""Twilio webhook handlers — inbound calls, TwiML delivery, status callbacks."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import get_db
from app.db.redis import get_redis
from app.models.base import new_uuid
from app.models.call import Call
from app.models.phone_number import PhoneNumber
from app.utils.twiml import build_hangup_twiml, build_stream_twiml
import json
import redis.asyncio as aioredis

router = APIRouter(prefix="/webhooks/twilio", tags=["webhooks"])


def _verify_twilio_signature(request: Request, form_data: dict) -> None:
    """Validate Twilio request signature. Only enforced in production."""
    if not settings.is_production:
        return
    if not settings.twilio_auth_token:
        return

    try:
        from twilio.request_validator import RequestValidator
        validator = RequestValidator(settings.twilio_auth_token)
        signature = request.headers.get("X-Twilio-Signature", "")
        url = str(request.url)
        if not validator.validate(url, form_data, signature):
            raise HTTPException(status_code=403, detail="Invalid Twilio signature")
    except ImportError:
        pass  # twilio SDK not installed, skip validation


def xml_response(content: str) -> Response:
    return Response(content=content, media_type="application/xml")


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
    call_sid = form.get("CallSid", "")
    from_number = form.get("From", "")
    to_number = form.get("To", "")

    # Find the phone number record → which agent handles inbound
    result = await db.execute(
        select(PhoneNumber).where(PhoneNumber.phone_number == to_number, PhoneNumber.is_active == True)
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
        status="initiated",
        started_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(call)
    await db.flush()
    await db.commit()

    # Pre-load call context in Redis (call_sid → context)
    await _seed_redis_context(redis, call, phone_number.inbound_agent_id, db)

    return xml_response(build_stream_twiml(call.id))


@router.post("/twiml/{call_record_id}")
async def outbound_twiml(
    call_record_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    """Called by Twilio when an outbound call is answered. Returns <Stream> TwiML."""
    form = await request.form()
    _verify_twilio_signature(request, dict(form))
    call_sid = form.get("CallSid", "")

    result = await db.execute(select(Call).where(Call.id == call_record_id))
    call = result.scalar_one_or_none()

    if not call:
        return xml_response(build_hangup_twiml())

    # Update with real call_sid (set at initiation time, confirmed here)
    if call_sid and not call.twilio_call_sid:
        call.twilio_call_sid = call_sid
    call.status = "in-progress"
    call.answered_at = datetime.now(timezone.utc).isoformat()
    await db.commit()

    await _seed_redis_context(redis, call, call.agent_id, db)

    return xml_response(build_stream_twiml(call_record_id))


@router.post("/status")
async def call_status_callback(
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
):
    """Twilio status callbacks — initiated / ringing / answered / completed / failed."""
    form = await request.form()
    _verify_twilio_signature(request, dict(form))
    call_sid = form.get("CallSid", "")
    call_status = form.get("CallStatus", "")
    duration = form.get("CallDuration")
    recording_url = form.get("RecordingUrl")
    recording_sid = form.get("RecordingSid")

    result = await db.execute(select(Call).where(Call.twilio_call_sid == call_sid))
    call = result.scalar_one_or_none()

    if call:
        call.status = call_status
        if duration:
            call.duration_seconds = int(duration)
        if call_status in ("completed", "failed", "busy", "no-answer", "canceled"):
            call.ended_at = datetime.now(timezone.utc).isoformat()
        if recording_url:
            call.recording_url = recording_url
            call.recording_sid = recording_sid
        await db.commit()

        # Enqueue post-call processing when call ends
        if call_status in ("completed", "failed"):
            try:
                from arq import create_pool
                from arq.connections import RedisSettings
                pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
                await pool.enqueue_job("post_call_processing", call.id)
                await pool.aclose()
            except Exception:
                pass

    return Response(status_code=204)


@router.post("/recording")
async def recording_callback(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Twilio recording-ready callback."""
    form = await request.form()
    call_sid = form.get("CallSid", "")
    recording_url = form.get("RecordingUrl", "")
    recording_sid = form.get("RecordingSid", "")

    result = await db.execute(select(Call).where(Call.twilio_call_sid == call_sid))
    call = result.scalar_one_or_none()
    if call:
        call.recording_url = recording_url
        call.recording_sid = recording_sid
        await db.commit()

    return Response(status_code=204)


async def _seed_redis_context(redis, call: Call, agent_id: str, db) -> None:
    """Pre-load call context into Redis so the bridge and tools have fast access."""
    from sqlalchemy import select as _select
    from app.models.agent import Agent

    result = await db.execute(_select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        return

    context = {
        "call_record_id": call.id,
        "agent_id": agent.id,
        "user_id": agent.user_id,
        "direction": call.direction,
        "enabled_tools": json.dumps(agent.enabled_tools),
        "tool_configs": json.dumps(agent.tool_configs),
        "agent_config": json.dumps({
            "call_script": agent.call_script,
            "system_prompt": agent.system_prompt,
            "company_name": agent.company_name,
            "product_name": agent.product_name,
            "elevenlabs_agent_id": agent.elevenlabs_agent_id,
        }),
        "lead_data": json.dumps({}),
    }
    key = f"call:{call.twilio_call_sid or call.id}"
    await redis.hset(key, mapping=context)
    await redis.expire(key, 14400)  # 4-hour TTL
