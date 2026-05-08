from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, status
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.config import settings
from app.core.exceptions import NotFoundError, ValidationError
from app.core.permissions import get_agent_or_404, get_call_or_404
from app.db.session import get_db
from app.db.redis import get_redis
from app.dependencies import get_current_user
from app.models.agent import Agent
from app.models.base import new_uuid
from app.models.call import Call
from app.models.lead import Lead
from app.models.user import User
from app.schemas.call import CallDetailResponse, CallResponse, OutboundCallRequest
from app.schemas.common import MessageResponse, PaginatedResponse
from app.services.twilio_service import get_twilio_service
import json

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/calls", tags=["calls"])


@router.get("", response_model=PaginatedResponse[CallResponse])
async def list_calls(
    page: int = 1,
    page_size: int = 20,
    agent_id: str | None = None,
    campaign_id: str | None = None,
    direction: str | None = None,
    status: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return a paginated call log for the authenticated user, optionally filtered by agent, campaign, direction, or status."""
    filters = [Call.user_id == current_user.id]
    if agent_id:
        filters.append(Call.agent_id == agent_id)
    if campaign_id:
        filters.append(Call.campaign_id == campaign_id)
    if direction:
        filters.append(Call.direction == direction)
    if status:
        filters.append(Call.status == status)

    offset = (page - 1) * page_size
    total = (await db.execute(select(func.count()).select_from(Call).where(*filters))).scalar()
    result = await db.execute(
        select(Call)
        .options(joinedload(Call.agent))
        .where(*filters)
        .order_by(Call.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    calls_list = result.unique().scalars().all()
    log.info("list_calls", user=current_user.id, total=total, page=page, direction=direction)

    items = []
    for call in calls_list:
        item = CallResponse.model_validate(call)
        item.agent_name = call.agent.name if call.agent else None
        items.append(item)

    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.get("/active")
async def list_active_calls(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List calls that are currently in-progress."""
    result = await db.execute(
        select(Call).where(Call.user_id == current_user.id, Call.status == "in-progress")
    )
    return {"active_calls": result.scalars().all(), "bridge_count": 0}


@router.post("/outbound", response_model=CallResponse, status_code=status.HTTP_201_CREATED)
async def initiate_outbound_call(
    body: OutboundCallRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    """Dial a number using Twilio and start a Voxara AI bridge session.

    Flow:
    1. Validates the agent is synced to ElevenLabs and the number is not on DNC.
    2. Creates a Call record and pre-seeds Redis with lead context.
    3. Instructs Twilio to call `to_number`; when answered, Twilio fetches TwiML from
       /webhooks/twilio/twiml/{call_id} which opens the media-stream WebSocket bridge.
    """
    agent = await get_agent_or_404(body.agent_id, current_user.id, db)

    log.info("outbound_call_attempt",
             agent_id=agent.id,
             agent_name=agent.name,
             el_agent_id=agent.elevenlabs_agent_id or "MISSING",
             to_number=body.to_number,
             call_type=agent.call_type,
             agent_is_active=agent.is_active)

    if not agent.is_active:
        log.warning("outbound_call_blocked_inactive", agent_id=agent.id)
        raise ValidationError("This agent is currently disabled and cannot place calls.")

    if not agent.elevenlabs_agent_id:
        log.error("outbound_call_blocked_no_el_id", agent_id=agent.id)
        raise ValidationError("Agent not synced to ElevenLabs. Save the agent first.")

    if agent.call_type == "inbound":
        log.warning("outbound_call_blocked_inbound_only", agent_id=agent.id)
        raise ValidationError("This agent is configured for inbound calls only and cannot place outbound calls.")

    # Check for DNC if phone provided in lead_data
    phone = (body.lead_data or {}).get("phone") or body.to_number
    existing_lead = None
    if phone:
        lead_result = await db.execute(
            select(Lead).where(Lead.user_id == current_user.id, Lead.phone == phone)
        )
        existing_lead = lead_result.scalar_one_or_none()
        if existing_lead and existing_lead.do_not_call:
            log.warning("outbound_call_blocked_dnc", to_number=phone)
            raise ValidationError("This number is on the Do Not Call list")

    # Create call record before dialing (we need the ID for TwiML URL)
    from_number = (
        body.from_number
        or agent.twilio_phone_number
        or settings.twilio_phone_number
    )

    # ── Phone number conflict check ───────────────────────────────────────────
    # Two agents sharing the same outbound Twilio number causes EL to drop the
    # audio WebSocket after the first message. Warn loudly so this is visible.
    if from_number:
        conflict_result = await db.execute(
            select(Agent).where(
                Agent.user_id == current_user.id,
                Agent.twilio_phone_number == from_number,
                Agent.id != agent.id,
            )
        )
        conflicting = conflict_result.scalars().all()
        if conflicting:
            log.warning(
                "outbound_call_phone_number_conflict",
                from_number=from_number,
                dialing_agent_id=agent.id,
                dialing_agent_name=agent.name,
                conflicting_agent_ids=[a.id for a in conflicting],
                conflicting_agent_names=[a.name for a in conflicting],
                risk="EL may drop this call after the greeting — two agents share the same "
                     "outbound phone number. Assign unique numbers to avoid WebSocket conflicts.",
            )

    call = Call(
        id=new_uuid(),
        user_id=current_user.id,
        agent_id=agent.id,
        lead_id=existing_lead.id if existing_lead else None,
        from_number=from_number,
        to_number=body.to_number,
        direction="outbound",
        status="initiated",
        started_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(call)
    await db.flush()

    # Pre-seed Redis context with lead data for personalization
    lead_data = body.lead_data or {}
    lead_data.setdefault("phone", body.to_number)
    context = {
        "call_record_id": call.id,
        "agent_id": agent.id,
        "user_id": current_user.id,
        "lead_id": existing_lead.id if existing_lead else "",
        "direction": "outbound",
        "enabled_tools": json.dumps(agent.enabled_tools),
        "tool_configs": json.dumps(agent.tool_configs),
        "agent_config": json.dumps({
            "call_script": agent.call_script,
            "system_prompt": agent.system_prompt,
            "company_name": agent.company_name,
            "product_name": agent.product_name,
            "elevenlabs_agent_id": agent.elevenlabs_agent_id,
        }),
        "lead_data": json.dumps(lead_data),
    }
    await redis.hset(f"call:{call.id}", mapping=context)
    await redis.expire(f"call:{call.id}", 14400)

    # Initiate Twilio call — when answered, Twilio fetches TwiML from /twiml/{call.id}
    twiml_url = f"{settings.public_url}/api/v1/webhooks/twilio/twiml/{call.id}"
    status_url = f"{settings.public_url}/api/v1/webhooks/twilio/status"

    log.info("outbound_call_dialing",
             call_id=call.id,
             from_number=from_number,
             to_number=body.to_number,
             twiml_url=twiml_url,
             status_url=status_url,
             el_agent_id=agent.elevenlabs_agent_id)

    twilio = get_twilio_service(current_user)
    twilio_result = await twilio.create_call(
        to=body.to_number,
        from_=from_number,
        twiml_url=twiml_url,
        status_callback=status_url,
    )

    call.twilio_call_sid = twilio_result["sid"]
    log.info("outbound_call_initiated",
             call_id=call.id,
             twilio_sid=call.twilio_call_sid,
             twilio_status=twilio_result.get("status"),
             to_number=body.to_number)

    await db.commit()
    await db.refresh(call)
    return call


@router.get("/{call_id}", response_model=CallDetailResponse)
async def get_call(
    call_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve full call details including transcript, stage timeline, and key moments."""
    return await get_call_or_404(call_id, current_user.id, db)


@router.get("/{call_id}/transcript")
async def get_transcript(
    call_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the call transcript array and total duration in seconds."""
    call = await get_call_or_404(call_id, current_user.id, db)
    return {"transcript": call.transcript, "duration_seconds": call.duration_seconds}


@router.get("/{call_id}/live-transcript")
async def get_live_transcript(
    call_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Proxy EL conversation transcript during an active call.

    Only for single test calls — campaign calls return 403.
    Used by non-Enterprise clients that poll for partial transcript every few seconds.
    """
    import httpx
    from fastapi import HTTPException
    from app.utils.crypto import decrypt

    call = await get_call_or_404(call_id, current_user.id, db)
    if call.campaign_id:
        raise HTTPException(status_code=403, detail="Live transcript not available for campaign calls")
    if not call.elevenlabs_conversation_id:
        return {"transcript": [], "status": "no_conversation"}

    api_key = ""
    if current_user.elevenlabs_api_key:
        try:
            api_key = decrypt(current_user.elevenlabs_api_key)
        except Exception:
            api_key = current_user.elevenlabs_api_key
    if not api_key:
        api_key = settings.elevenlabs_api_key

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(
                f"{settings.elevenlabs_base_url}/convai/conversations/{call.elevenlabs_conversation_id}",
                headers={"xi-api-key": api_key},
            )
        if r.status_code != 200:
            return {"transcript": [], "status": "unavailable"}

        data = r.json()
        raw_transcript = data.get("transcript", [])
        transcript = []
        for entry in raw_transcript:
            text = (entry.get("message") or "").strip()
            if not text:
                continue
            role = entry.get("role", "user")
            if role not in ("user", "agent"):
                continue
            transcript.append({
                "role": role,
                "text": text,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        return {"transcript": transcript, "status": data.get("status", "unknown")}
    except Exception:
        return {"transcript": [], "status": "error"}


@router.get("/{call_id}/recording")
async def get_recording(
    call_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the Twilio recording URL for a completed call. Returns 404 if no recording exists."""
    call = await get_call_or_404(call_id, current_user.id, db)
    if not call.recording_url:
        raise NotFoundError("No recording available for this call")
    return {"recording_url": call.recording_url, "recording_sid": call.recording_sid}


@router.post("/{call_id}/end", response_model=MessageResponse)
async def end_call(
    call_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    """Terminate an in-progress call via Twilio, fetch transcript from EL, and emit call_ended."""
    from app.routers.webhooks import _finalize_call
    call = await get_call_or_404(call_id, current_user.id, db)

    # If the call was transferred, the Twilio <Dial> is still executing —
    # ringing or connected to the human agent. Terminating the call SID here
    # would cut that leg (causing a missed call). Let it complete naturally
    # through the <Dial action> → transfer-fallback → Twilio status callback.
    is_transferred = (await redis.hget(f"call:{call_id}", "transferred")) == "1"
    if is_transferred:
        log.info("end_call_skip_transferred", call_id=call_id,
                 note="Transferred call — skipping Twilio termination, "
                      "human leg will complete via Twilio <Dial>")
        return MessageResponse(message="Call transferred to human agent")

    if call.twilio_call_sid:
        twilio = get_twilio_service(current_user)
        try:
            await twilio.end_call(call.twilio_call_sid)
        except Exception as exc:
            log.warning("end_call_twilio_error", call_id=call_id, error=str(exc))
    if call.status not in ("completed", "failed", "finalized"):
        call.status = "completed"
        call.ended_at = datetime.now(timezone.utc).isoformat()
        await _finalize_call(call, redis, db)
        await db.commit()
    return MessageResponse(message="Call ended")
