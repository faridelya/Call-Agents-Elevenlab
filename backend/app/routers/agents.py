from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

log = structlog.get_logger(__name__)

from app.core.exceptions import ConflictError, ExternalServiceError
from app.core.permissions import get_agent_or_404
from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.agent import Agent
from app.models.base import new_uuid
from app.models.call import Call
from app.models.phone_number import PhoneNumber
from app.models.tool import Tool
from app.models.user import User
from app.schemas.agent import AgentCreate, AgentResponse, AgentToolsUpdate, AgentUpdate, VoiceOption
from app.schemas.common import MessageResponse, PaginatedResponse
from app.services.elevenlabs_service import elevenlabs_service

router = APIRouter(prefix="/agents", tags=["agents"])


async def _warn_duplicate_phone(agent_id: str, user_id: str, phone: str | None, db: AsyncSession) -> None:
    """Log a warning if another agent belonging to this user already uses the same outbound number.

    Two agents sharing a Twilio phone number causes EL to fail the audio WebSocket after
    the greeting — EL's server-side routing gets confused about which agent owns the call.
    This is not blocked (the user may have intentional reasons) but a warning is logged.
    """
    if not phone:
        return
    result = await db.execute(
        select(Agent).where(
            Agent.user_id == user_id,
            Agent.twilio_phone_number == phone,
            Agent.id != agent_id,
        )
    )
    conflicts = result.scalars().all()
    if conflicts:
        log.warning(
            "duplicate_twilio_phone_number",
            agent_id=agent_id,
            phone=phone,
            conflicting_agents=[a.id for a in conflicts],
            msg="Two agents share the same outbound Twilio number. "
                "EL may drop calls after the greeting. "
                "Assign a unique number per agent or clear twilio_phone_number on one.",
        )


async def _sync_to_elevenlabs(agent: Agent, db: AsyncSession) -> None:
    """Create or update the ElevenLabs agent from a Voxara agent."""
    # Check no in-progress calls before updating
    active = await db.execute(
        select(func.count()).select_from(Call).where(
            Call.agent_id == agent.id, Call.status == "in-progress"
        )
    )
    if active.scalar() > 0:
        return  # Skip sync — call in progress

    # Fetch custom (Tier 3) tools for this agent
    tools_result = await db.execute(
        select(Tool).where(Tool.agent_id == agent.id, Tool.is_active == True)
    )
    custom_tools = [
        {
            "id": t.id,
            "name": t.name,
            "description": t.description,
            "el_tool_type": t.el_tool_type,
            "parameters_schema": t.parameters_schema,
            "tool_parameters": t.tool_parameters,
            "expects_response": t.expects_response,
            "response_timeout_secs": t.response_timeout_secs,
            "disable_interruptions": t.disable_interruptions,
            "execution_mode": t.execution_mode,
            "pre_tool_speech": t.pre_tool_speech,
        }
        for t in tools_result.scalars().all()
    ]

    config = elevenlabs_service.build_agent_config(agent, custom_tools)

    if agent.elevenlabs_agent_id:
        await elevenlabs_service.update_agent(agent.elevenlabs_agent_id, config)
    else:
        el_agent_id = await elevenlabs_service.create_agent(config)
        agent.elevenlabs_agent_id = el_agent_id

    agent.el_config_snapshot = config
    agent.el_last_synced_at = datetime.now(timezone.utc).isoformat()


# ── Phone number helpers ──────────────────────────────────────────────────────

async def _get_inbound_number(agent_id: str, db: AsyncSession) -> str | None:
    """Return the inbound phone number linked to this agent, or None."""
    result = await db.execute(
        select(PhoneNumber.phone_number).where(
            PhoneNumber.inbound_agent_id == agent_id,
            PhoneNumber.is_active == True,
        )
    )
    return result.scalar_one_or_none()


async def _handle_inbound_phone(agent_id: str, user_id: str, number: str | None, db: AsyncSession) -> None:
    """Upsert or clear the PhoneNumber record used for inbound routing to this agent."""
    # Unlink any existing inbound number pointing to this agent
    old_result = await db.execute(
        select(PhoneNumber).where(PhoneNumber.inbound_agent_id == agent_id)
    )
    for pn in old_result.scalars().all():
        pn.inbound_agent_id = None
        pn.inbound_enabled = False

    if not number:
        return

    # Find existing record for this phone number or create a new one
    existing_result = await db.execute(
        select(PhoneNumber).where(PhoneNumber.phone_number == number)
    )
    existing = existing_result.scalar_one_or_none()

    if existing:
        if existing.user_id != user_id:
            raise ConflictError("This phone number is already registered to another account")
        existing.inbound_agent_id = agent_id
        existing.inbound_enabled = True
    else:
        db.add(PhoneNumber(
            id=new_uuid(),
            user_id=user_id,
            phone_number=number,
            twilio_sid=None,
            inbound_enabled=True,
            inbound_agent_id=agent_id,
        ))


async def _with_inbound(agent: Agent, db: AsyncSession) -> AgentResponse:
    """Build an AgentResponse with inbound_phone_number populated from the PhoneNumber table."""
    resp = AgentResponse.model_validate(agent)
    return resp.model_copy(update={"inbound_phone_number": await _get_inbound_number(agent.id, db)})


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedResponse[AgentResponse])
async def list_agents(
    page: int = 1,
    page_size: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return a paginated list of all agents owned by the authenticated user."""
    offset = (page - 1) * page_size
    total_result = await db.execute(
        select(func.count()).select_from(Agent).where(Agent.user_id == current_user.id)
    )
    total = total_result.scalar()

    result = await db.execute(
        select(Agent)
        .where(Agent.user_id == current_user.id)
        .order_by(Agent.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    agents = result.scalars().all()

    # Fetch all inbound numbers in one query to avoid N+1
    agent_ids = [a.id for a in agents]
    pn_result = await db.execute(
        select(PhoneNumber.inbound_agent_id, PhoneNumber.phone_number).where(
            PhoneNumber.inbound_agent_id.in_(agent_ids),
            PhoneNumber.is_active == True,
        )
    )
    inbound_map = {row.inbound_agent_id: row.phone_number for row in pn_result}

    items = [
        AgentResponse.model_validate(a).model_copy(update={"inbound_phone_number": inbound_map.get(a.id)})
        for a in agents
    ]

    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.post("", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def create_agent(
    body: AgentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new agent and attempt an initial sync to ElevenLabs."""
    body_data = body.model_dump(exclude={"inbound_phone_number"}, exclude_none=True)
    agent = Agent(
        id=new_uuid(),
        user_id=current_user.id,
        signing_secret=new_uuid().replace("-", ""),
        **body_data,
    )
    db.add(agent)
    await db.flush()

    if body.inbound_phone_number:
        await _handle_inbound_phone(agent.id, current_user.id, body.inbound_phone_number, db)

    await _warn_duplicate_phone(agent.id, current_user.id, body.twilio_phone_number, db)

    try:
        await _sync_to_elevenlabs(agent, db)
    except Exception as e:
        log.warning("el_sync_skipped_on_create", agent_id=agent.id, error=str(e))

    await db.commit()
    await db.refresh(agent)
    return await _with_inbound(agent, db)


@router.get("/voices", response_model=list[VoiceOption])
async def list_voices(current_user: User = Depends(get_current_user)):
    """Fetch all voices available in the user's ElevenLabs library."""
    voices = await elevenlabs_service.list_voices()
    return [
        VoiceOption(
            voice_id=v["voice_id"],
            name=v["name"],
            preview_url=v.get("preview_url"),
            labels=v.get("labels", {}),
        )
        for v in voices
    ]


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve a single agent by ID."""
    agent = await get_agent_or_404(agent_id, current_user.id, db)
    return await _with_inbound(agent, db)


@router.patch("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: str,
    body: AgentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Partially update an agent's fields and re-sync to ElevenLabs."""
    agent = await get_agent_or_404(agent_id, current_user.id, db)

    update_data = body.model_dump(exclude={"inbound_phone_number"}, exclude_unset=True)
    for field, value in update_data.items():
        setattr(agent, field, value)

    # Handle inbound phone only if the field was explicitly included in the request
    if "inbound_phone_number" in body.model_fields_set:
        await _handle_inbound_phone(agent.id, current_user.id, body.inbound_phone_number, db)

    new_phone = update_data.get("twilio_phone_number", agent.twilio_phone_number)
    await _warn_duplicate_phone(agent.id, current_user.id, new_phone, db)

    try:
        await _sync_to_elevenlabs(agent, db)
    except Exception as e:
        log.warning("el_sync_skipped_on_update", agent_id=agent.id, error=str(e))

    await db.commit()
    await db.refresh(agent)
    return await _with_inbound(agent, db)


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(
    agent_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete an agent and its corresponding ElevenLabs agent (best-effort).

    The local record is always removed; the ElevenLabs deletion failure is swallowed
    to avoid leaving orphaned DB rows when the remote agent has already been deleted.
    """
    agent = await get_agent_or_404(agent_id, current_user.id, db)

    if agent.elevenlabs_agent_id:
        try:
            await elevenlabs_service.delete_agent(agent.elevenlabs_agent_id)
        except ExternalServiceError:
            pass

    await db.delete(agent)
    await db.commit()


@router.post("/{agent_id}/clone", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def clone_agent(
    agent_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Deep-copy an agent (all config, tools, and script) into a new record named '{original} (copy)'.

    The clone gets its own signing_secret and elevenlabs_agent_id after the first sync.
    """
    source = await get_agent_or_404(agent_id, current_user.id, db)

    clone = Agent(
        id=new_uuid(),
        user_id=current_user.id,
        name=f"{source.name} (copy)",
        description=source.description,
        voice_id=source.voice_id,
        language=source.language,
        system_prompt=source.system_prompt,
        first_message=source.first_message,
        agent_role=source.agent_role,
        company_name=source.company_name,
        product_name=source.product_name,
        call_type=source.call_type,
        max_call_duration_seconds=source.max_call_duration_seconds,
        silence_timeout_seconds=source.silence_timeout_seconds,
        call_script=source.call_script,
        enabled_tools=source.enabled_tools,
        tool_configs=source.tool_configs,
        product_catalog=source.product_catalog,
        qualification_criteria=source.qualification_criteria,
        signing_secret=new_uuid().replace("-", ""),
    )
    db.add(clone)
    await db.flush()

    try:
        await _sync_to_elevenlabs(clone, db)
    except ExternalServiceError:
        pass

    await db.commit()
    await db.refresh(clone)
    return clone


@router.post("/{agent_id}/sync", response_model=MessageResponse)
async def force_sync(
    agent_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Push the current agent config to ElevenLabs (create if new, update if existing).

    Blocked while any call is in-progress for this agent to prevent mid-call config changes.
    Raises ExternalServiceError if the ElevenLabs API call fails.
    """
    agent = await get_agent_or_404(agent_id, current_user.id, db)
    await _sync_to_elevenlabs(agent, db)
    await db.commit()
    return MessageResponse(message=f"Agent synced to ElevenLabs: {agent.elevenlabs_agent_id}")


@router.get("/{agent_id}/tools")
async def get_agent_tools(
    agent_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the agent's enabled tool IDs and their per-tool config dicts."""
    agent = await get_agent_or_404(agent_id, current_user.id, db)
    return {"enabled_tools": agent.enabled_tools, "tool_configs": agent.tool_configs}


@router.patch("/{agent_id}/tools", response_model=AgentResponse)
async def update_agent_tools(
    agent_id: str,
    body: AgentToolsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Replace the agent's full tool list and configs, then re-sync to ElevenLabs.

    Tier 1 tools (client-side) are always included by the sync layer regardless of this list.
    """
    agent = await get_agent_or_404(agent_id, current_user.id, db)
    agent.enabled_tools = body.enabled_tools
    agent.tool_configs = body.tool_configs

    try:
        await _sync_to_elevenlabs(agent, db)
    except ExternalServiceError:
        pass

    await db.commit()
    await db.refresh(agent)
    return agent
