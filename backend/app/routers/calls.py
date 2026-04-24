from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, WebSocket, status
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
from app.schemas.call import CallDetailResponse, CallResponse, EndCallRequest, OutboundCallRequest
from app.schemas.common import MessageResponse, PaginatedResponse
from app.services.twilio_service import get_twilio_service
from app.websockets.bridge import Bridge
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
    """List calls that are currently in-progress, plus the in-process bridge count from memory."""
    from app.websockets.bridge_manager import bridge_manager
    result = await db.execute(
        select(Call).where(Call.user_id == current_user.id, Call.status == "in-progress")
    )
    return {"active_calls": result.scalars().all(), "bridge_count": bridge_manager.active_count()}


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

    if not agent.elevenlabs_agent_id:
        raise ValidationError("Agent not synced to ElevenLabs. Save the agent first.")

    # Check for DNC if phone provided in lead_data
    phone = (body.lead_data or {}).get("phone") or body.to_number
    if phone:
        dnc_result = await db.execute(
            select(Lead).where(Lead.user_id == current_user.id, Lead.phone == phone, Lead.do_not_call == True)
        )
        if dnc_result.scalar_one_or_none():
            raise ValidationError("This number is on the Do Not Call list")

    # Create call record before dialing (we need the ID for TwiML URL)
    from_number = settings.twilio_phone_number

    call = Call(
        id=new_uuid(),
        user_id=current_user.id,
        agent_id=agent.id,
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
    twilio = get_twilio_service(current_user)
    twilio_result = await twilio.create_call(
        to=body.to_number,
        from_=from_number,
        twiml_url=twiml_url,
        status_callback=status_url,
    )

    call.twilio_call_sid = twilio_result["sid"]
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
    body: EndCallRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Terminate an in-progress call via the Twilio REST API and mark it completed in the DB."""
    call = await get_call_or_404(call_id, current_user.id, db)
    if call.twilio_call_sid:
        twilio = get_twilio_service(current_user)
        await twilio.end_call(call.twilio_call_sid)
    call.status = "completed"
    call.ended_at = datetime.now(timezone.utc).isoformat()
    await db.commit()
    return MessageResponse(message="Call ended")


# WebSocket endpoint for the Twilio media stream bridge
@router.websocket("/ws/bridge/{call_record_id}")
async def ws_bridge(call_record_id: str, websocket: WebSocket):
    bridge = Bridge(call_record_id=call_record_id, twilio_ws=websocket)
    await bridge.run()
