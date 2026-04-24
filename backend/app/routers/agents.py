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
from app.models.tool import Tool
from app.models.user import User
from app.schemas.agent import AgentCreate, AgentResponse, AgentToolsUpdate, AgentUpdate, VoiceOption
from app.schemas.common import MessageResponse, PaginatedResponse
from app.services.elevenlabs_service import elevenlabs_service

router = APIRouter(prefix="/agents", tags=["agents"])


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
    custom_tools = [{"id": t.id, "name": t.name, "description": t.description, "parameters_schema": t.parameters_schema} for t in tools_result.scalars().all()]

    config = elevenlabs_service.build_agent_config(agent, custom_tools)

    if agent.elevenlabs_agent_id:
        await elevenlabs_service.update_agent(agent.elevenlabs_agent_id, config)
    else:
        el_agent_id = await elevenlabs_service.create_agent(config)
        agent.elevenlabs_agent_id = el_agent_id

    agent.el_config_snapshot = config
    agent.el_last_synced_at = datetime.now(timezone.utc).isoformat()


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

    return PaginatedResponse(
        items=agents,
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
    """Create a new agent, persist it to the DB, and attempt an initial sync to ElevenLabs.

    ElevenLabs sync failures are non-fatal — the agent is still created and the
    caller can trigger a manual sync via POST /agents/{id}/sync once credentials are valid.
    """
    agent = Agent(
        id=new_uuid(),
        user_id=current_user.id,
        signing_secret=new_uuid().replace("-", ""),
        **body.model_dump(),
    )
    db.add(agent)
    await db.flush()

    try:
        await _sync_to_elevenlabs(agent, db)
    except Exception as e:
        log.warning("el_sync_skipped_on_create", agent_id=agent.id, error=str(e))

    await db.commit()
    await db.refresh(agent)
    return agent


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
    """Retrieve a single agent by ID. Returns 404 if not found or not owned by caller."""
    return await get_agent_or_404(agent_id, current_user.id, db)


@router.patch("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: str,
    body: AgentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Partially update an agent's fields and re-sync to ElevenLabs.

    Only fields present in the request body are updated (PATCH semantics).
    ElevenLabs sync is skipped silently if an active call is in progress.
    """
    agent = await get_agent_or_404(agent_id, current_user.id, db)

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(agent, field, value)

    try:
        await _sync_to_elevenlabs(agent, db)
    except Exception as e:
        log.warning("el_sync_skipped_on_update", agent_id=agent.id, error=str(e))

    await db.commit()
    await db.refresh(agent)
    return agent


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
