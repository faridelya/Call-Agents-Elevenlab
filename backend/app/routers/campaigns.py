import csv
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, UploadFile, File, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
from app.core.permissions import get_campaign_or_404
from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.base import new_uuid
from app.models.call import Call
from app.models.campaign import Campaign
from app.models.user import User
from app.schemas.campaign import CampaignCreate, CampaignResponse, CampaignUpdate, ContactPoolSave
from app.schemas.common import MessageResponse, PaginatedResponse

router = APIRouter(prefix="/campaigns", tags=["campaigns"])

_MUTABLE_STATUSES = {"draft", "paused"}


def _normalize_contact_row(row: dict[str, str | None]) -> dict[str, str]:
    normalized: dict[str, str] = {}
    for key, value in row.items():
        if key is None:
            continue
        normalized[key.lower().replace(" ", "_")] = (value or "").strip()
    return normalized


@router.get("", response_model=PaginatedResponse[CampaignResponse])
async def list_campaigns(
    page: int = 1,
    page_size: int = 20,
    status_filter: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return a paginated list of the user's campaigns. Optionally filter by status (draft/running/paused/completed)."""
    filters = [Campaign.user_id == current_user.id]
    if status_filter:
        filters.append(Campaign.status == status_filter)

    offset = (page - 1) * page_size
    total = (await db.execute(select(func.count()).select_from(Campaign).where(*filters))).scalar()
    result = await db.execute(
        select(Campaign).where(*filters).order_by(Campaign.created_at.desc()).offset(offset).limit(page_size)
    )
    return PaginatedResponse(items=result.scalars().all(), total=total, page=page, page_size=page_size, pages=(total + page_size - 1) // page_size)


@router.post("", response_model=CampaignResponse, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    body: CampaignCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a campaign in draft status. Contacts can be embedded in the body or uploaded later via CSV."""
    contacts = body.contacts or []
    campaign = Campaign(
        id=new_uuid(),
        user_id=current_user.id,
        total_contacts=len(contacts),
        **body.model_dump(exclude_none=True),
    )
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    return campaign


@router.get("/pool")
async def get_contact_pool(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the user's saved contact pool (staging area before campaign creation)."""
    return {"contacts": current_user.contact_pool or [], "total": len(current_user.contact_pool or [])}


@router.put("/pool", response_model=MessageResponse)
async def save_contact_pool(
    body: ContactPoolSave,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Overwrite the user's contact pool with the supplied list."""
    current_user.contact_pool = body.contacts
    await db.commit()
    return MessageResponse(message=f"Pool saved: {len(body.contacts)} contacts")


@router.get("/{campaign_id}", response_model=CampaignResponse)
async def get_campaign(
    campaign_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve a single campaign by ID. Returns 404 if not owned by caller."""
    return await get_campaign_or_404(campaign_id, current_user.id, db)


@router.patch("/{campaign_id}", response_model=CampaignResponse)
async def update_campaign(
    campaign_id: str,
    body: CampaignUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update campaign settings. Only allowed when status is draft or paused."""
    campaign = await get_campaign_or_404(campaign_id, current_user.id, db)
    if campaign.status not in _MUTABLE_STATUSES:
        raise ValidationError("Can only update draft or paused campaigns")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(campaign, field, value)
    await db.commit()
    await db.refresh(campaign)
    return campaign


@router.delete("/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_campaign(
    campaign_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a campaign. Blocked while the campaign is actively running."""
    campaign = await get_campaign_or_404(campaign_id, current_user.id, db)
    if campaign.status == "running":
        raise ValidationError("Stop the campaign before deleting")
    await db.delete(campaign)
    await db.commit()


@router.post("/{campaign_id}/start", response_model=MessageResponse)
async def start_campaign(
    campaign_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Start a draft or paused campaign. Sets status to 'running' and enqueues the first contact dial via ARQ."""
    from sqlalchemy import select as _select
    from app.models.agent import Agent as AgentModel
    from app.config import settings as _settings

    campaign = await get_campaign_or_404(campaign_id, current_user.id, db)
    if campaign.status not in _MUTABLE_STATUSES:
        raise ValidationError(f"Cannot start campaign in status: {campaign.status}")
    if not campaign.contacts:
        raise ValidationError("Campaign has no contacts")

    # ── Pre-flight: validate agent + credentials before queuing ───────────────
    agent_result = await db.execute(_select(AgentModel).where(AgentModel.id == campaign.agent_id))
    agent = agent_result.scalar_one_or_none()

    if not agent:
        raise ValidationError("The agent attached to this campaign no longer exists.")

    if not agent.is_active:
        raise ValidationError(
            f"Agent '{agent.name}' is disabled. Enable it in the Agents page before starting."
        )

    if not agent.elevenlabs_agent_id:
        raise ValidationError(
            f"Agent '{agent.name}' has not been synced to ElevenLabs. "
            "Open the agent, save it, then try again."
        )

    if agent.call_type == "inbound":
        raise ValidationError(
            f"Agent '{agent.name}' is configured for inbound calls only. "
            "Switch it to outbound in the agent settings."
        )

    from_number = agent.twilio_phone_number or _settings.twilio_phone_number
    if not from_number:
        raise ValidationError(
            f"No outbound phone number configured. "
            "Set a Twilio phone number on the agent or add one in Settings → Credentials."
        )

    has_twilio_creds = (
        (current_user.twilio_account_sid and current_user.twilio_auth_token)
        or (_settings.twilio_account_sid and _settings.twilio_auth_token)
    )
    if not has_twilio_creds:
        raise ValidationError(
            "Twilio credentials are not configured. "
            "Add your Account SID and Auth Token in Settings → Credentials."
        )

    from app.config import settings as _cfg
    import structlog as _sl
    _log = _sl.get_logger(__name__)

    original_status = campaign.status
    campaign.status = "running"
    campaign.started_at = campaign.started_at or datetime.now(timezone.utc).isoformat()
    await db.commit()

    if _cfg.campaign_debug:
        _log.debug("campaign_start_committed",
                   campaign_id=campaign_id,
                   name=campaign.name,
                   max_concurrent=campaign.max_concurrent_calls,
                   total_contacts=campaign.total_contacts)

    # Enqueue N staggered dial jobs — one per configured parallel slot.
    # Each job checks the slot ceiling before dialling, so the concurrency
    # limits in campaign_tasks.py act as the real throttle.
    try:
        from arq import create_pool
        from arq.connections import RedisSettings
        from app.config import settings
        pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
        slots = max(1, campaign.max_concurrent_calls)
        for i in range(slots):
            await pool.enqueue_job("dial_next_contact", campaign.id, _defer_by=i)
        await pool.aclose()
    except Exception:
        # Roll back — don't leave campaign stuck in "running" with no worker jobs.
        campaign.status = original_status
        await db.commit()
        raise ValidationError(
            "Failed to queue campaign jobs — the background worker is unreachable. "
            "Ensure Redis and the ARQ worker are running, then try again."
        )

    return MessageResponse(message=f"Campaign started: {campaign.name}")


@router.post("/{campaign_id}/pause", response_model=MessageResponse)
async def pause_campaign(
    campaign_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Pause a running campaign. In-flight calls complete normally; no new dials are scheduled."""
    campaign = await get_campaign_or_404(campaign_id, current_user.id, db)
    if campaign.status != "running":
        raise ValidationError("Campaign is not running")
    campaign.status = "paused"
    await db.commit()
    return MessageResponse(message="Campaign paused")


@router.post("/{campaign_id}/resume", response_model=MessageResponse)
async def resume_campaign(
    campaign_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Resume a paused campaign. Re-enqueues the next pending contact dial in ARQ."""
    campaign = await get_campaign_or_404(campaign_id, current_user.id, db)
    if campaign.status != "paused":
        raise ValidationError("Campaign is not paused")
    campaign.status = "running"
    await db.commit()

    try:
        from arq import create_pool
        from arq.connections import RedisSettings
        from app.config import settings
        pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
        await pool.enqueue_job("dial_next_contact", campaign.id)
        await pool.aclose()
    except Exception:
        pass

    return MessageResponse(message="Campaign resumed")


@router.post("/{campaign_id}/stop", response_model=MessageResponse)
async def stop_campaign(
    campaign_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently stop a campaign and mark it 'completed'. Cannot be restarted."""
    campaign = await get_campaign_or_404(campaign_id, current_user.id, db)
    campaign.status = "completed"
    campaign.completed_at = datetime.now(timezone.utc).isoformat()
    await db.commit()
    return MessageResponse(message="Campaign stopped")


@router.post("/{campaign_id}/contacts", response_model=MessageResponse)
async def upload_contacts(
    campaign_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a CSV file of contacts for a draft or paused campaign.

    Required column: `phone`. All other columns are stored as-is in the contact dict
    and injected into the call's lead_data context at dial time.
    """
    campaign = await get_campaign_or_404(campaign_id, current_user.id, db)
    if campaign.status not in _MUTABLE_STATUSES:
        raise ValidationError("Can only upload contacts to draft or paused campaigns")

    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig")))
    contacts = []
    for row in reader:
        normalized = _normalize_contact_row(row)
        phone = normalized.get("phone") or normalized.get("phone_number")
        if phone:
            normalized["phone"] = phone
            contacts.append(normalized)

    campaign.contacts = contacts
    campaign.total_contacts = len(contacts)
    await db.commit()
    return MessageResponse(message=f"Uploaded {len(contacts)} contacts")


@router.get("/{campaign_id}/contacts")
async def list_contacts(
    campaign_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all contacts stored in this campaign along with the total count."""
    campaign = await get_campaign_or_404(campaign_id, current_user.id, db)
    return {"contacts": campaign.contacts, "total": campaign.total_contacts}


@router.get("/{campaign_id}/calls")
async def list_campaign_calls(
    campaign_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all calls placed under this campaign, ordered by most recent first."""
    await get_campaign_or_404(campaign_id, current_user.id, db)
    result = await db.execute(
        select(Call).where(Call.campaign_id == campaign_id).order_by(Call.created_at.desc())
    )
    return {"calls": result.scalars().all()}
