from fastapi import APIRouter, Depends
from sqlalchemy import select, func, and_, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.call import Call
from app.models.lead import Lead
from app.models.campaign import Campaign
from app.models.user import User

router = APIRouter(prefix="/analytics", tags=["analytics"])

# All outcome values recognised across the system
_ALL_OUTCOMES = [
    "interested",
    "order_confirmed",
    "want_to_connect_later",
    "callback_scheduled",
    "not_interested",
    "voicemail_left",
    "voicemail",
    "wrong_number",
    "do_not_call",
    "goal_achieved",
    "no_answer",
    "completed",
]


@router.get("/overview")
async def overview(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return top-level KPIs: total calls, completed calls, total leads, qualified leads, conversion rate, and avg duration."""
    uid = current_user.id

    total_calls = (await db.execute(select(func.count()).select_from(Call).where(Call.user_id == uid))).scalar()
    completed = (await db.execute(select(func.count()).select_from(Call).where(Call.user_id == uid, Call.status == "completed"))).scalar()
    total_leads = (await db.execute(select(func.count()).select_from(Lead).where(Lead.user_id == uid))).scalar()
    qualified = (await db.execute(select(func.count()).select_from(Lead).where(Lead.user_id == uid, Lead.lead_status == "qualified"))).scalar()

    interested = (await db.execute(
        select(func.count()).select_from(Call).where(
            Call.user_id == uid,
            Call.outcome.in_(["interested", "order_confirmed"]),
        )
    )).scalar()
    conversion_rate = round(interested / completed * 100, 1) if completed else 0

    avg_duration = (await db.execute(
        select(func.avg(Call.duration_seconds)).where(Call.user_id == uid, Call.duration_seconds.isnot(None))
    )).scalar()

    return {
        "total_calls": total_calls,
        "completed_calls": completed,
        "total_leads": total_leads,
        "qualified_leads": qualified,
        "conversion_rate": conversion_rate,
        "avg_call_duration_seconds": round(avg_duration or 0, 1),
        "interested_outcomes": interested,
    }


@router.get("/calls")
async def calls_over_time(
    group_by: str = "day",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return call volume grouped by time period (day/week/month). Used to render trend charts on the dashboard."""
    result = await db.execute(
        select(
            func.date_trunc(group_by, Call.created_at).label("period"),
            func.count().label("count"),
        )
        .where(Call.user_id == current_user.id)
        .group_by("period")
        .order_by("period")
    )
    return {"data": [{"period": str(r.period), "count": r.count} for r in result]}


@router.get("/outcomes")
async def outcome_distribution(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return a breakdown of call outcomes (interested, not interested, callback, voicemail, etc.) by count."""
    result = await db.execute(
        select(Call.outcome, func.count().label("count"))
        .where(Call.user_id == current_user.id, Call.outcome.isnot(None))
        .group_by(Call.outcome)
        .order_by(func.count().desc())
    )
    return {"outcomes": [{"outcome": r.outcome, "count": r.count} for r in result]}


@router.get("/agents")
async def per_agent_metrics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return per-agent aggregate stats with name, total calls, per-outcome counts, avg duration, and sentiment."""
    from app.models.agent import Agent as AgentModel

    result = await db.execute(
        select(
            Call.agent_id,
            AgentModel.name.label("agent_name"),
            func.count().label("total_calls"),
            func.avg(Call.duration_seconds).label("avg_duration"),
            func.avg(Call.sentiment_score).label("avg_sentiment"),
            func.sum(case((Call.outcome == "interested", 1), else_=0)).label("interested_count"),
            func.sum(case((Call.outcome == "order_confirmed", 1), else_=0)).label("order_confirmed_count"),
            func.sum(case((Call.outcome == "want_to_connect_later", 1), else_=0)).label("connect_later_count"),
            func.sum(case((Call.outcome.in_(["not_interested"]), 1), else_=0)).label("not_interested_count"),
            func.sum(case((Call.outcome.in_(["voicemail_left", "voicemail"]), 1), else_=0)).label("voicemail_count"),
            func.sum(case((Call.outcome.in_(["callback_scheduled"]), 1), else_=0)).label("callback_count"),
        )
        .join(AgentModel, Call.agent_id == AgentModel.id, isouter=True)
        .where(Call.user_id == current_user.id, Call.agent_id.isnot(None))
        .group_by(Call.agent_id, AgentModel.name)
    )

    agents = []
    for r in result:
        total = r.total_calls or 0
        positive = int(r.interested_count or 0) + int(r.order_confirmed_count or 0)
        agents.append({
            "agent_id": r.agent_id,
            "agent_name": r.agent_name,
            "total_calls": total,
            "avg_duration_seconds": round(r.avg_duration or 0, 1),
            "avg_sentiment": round(r.avg_sentiment or 0, 2),
            "interested_count": int(r.interested_count or 0),
            "order_confirmed_count": int(r.order_confirmed_count or 0),
            "connect_later_count": int(r.connect_later_count or 0),
            "not_interested_count": int(r.not_interested_count or 0),
            "voicemail_count": int(r.voicemail_count or 0),
            "callback_count": int(r.callback_count or 0),
            "conversion_rate": round(positive / total * 100, 1) if total else 0,
        })
    return {"agents": agents}


@router.get("/leads")
async def lead_funnel(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return lead counts grouped by status (new, contacted, qualified, disqualified, etc.) for funnel visualization."""
    result = await db.execute(
        select(Lead.lead_status, func.count().label("count"))
        .where(Lead.user_id == current_user.id)
        .group_by(Lead.lead_status)
    )
    return {"funnel": [{"status": r.lead_status, "count": r.count} for r in result]}


@router.get("/campaigns")
async def campaign_metrics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return summary stats for the 10 most recent campaigns (contacts called, completed, conversion rate)."""
    result = await db.execute(
        select(Campaign).where(Campaign.user_id == current_user.id).order_by(Campaign.created_at.desc()).limit(10)
    )
    campaigns = result.scalars().all()
    return {"campaigns": [
        {
            "id": c.id,
            "name": c.name,
            "status": c.status,
            "total_contacts": c.total_contacts,
            "contacts_called": c.contacts_called,
            "contacts_completed": c.contacts_completed,
            "conversion_rate": c.conversion_rate,
            "avg_call_duration": c.avg_call_duration,
        }
        for c in campaigns
    ]}


@router.get("/campaign-outcomes")
async def campaign_outcomes(
    campaign_id: str | None = None,
    agent_id: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Per-campaign outcome breakdown. Optionally filter by campaign_id and/or agent_id."""
    from app.models.agent import Agent as AgentModel

    # All campaigns for the selector dropdown
    camps_result = await db.execute(
        select(Campaign.id, Campaign.name, Campaign.status)
        .where(Campaign.user_id == current_user.id)
        .order_by(Campaign.created_at.desc())
        .limit(50)
    )
    all_campaigns = [{"id": r.id, "name": r.name, "status": r.status} for r in camps_result]

    # All agents for the selector dropdown
    agents_result = await db.execute(
        select(AgentModel.id, AgentModel.name)
        .where(AgentModel.user_id == current_user.id, AgentModel.is_active.is_(True))
        .order_by(AgentModel.name)
    )
    all_agents = [{"id": r.id, "name": r.name} for r in agents_result]

    # Build call filters
    filters = [Call.user_id == current_user.id, Call.campaign_id.isnot(None)]
    if campaign_id:
        filters.append(Call.campaign_id == campaign_id)
    if agent_id:
        filters.append(Call.agent_id == agent_id)

    # Total calls for selected filters
    total = (await db.execute(
        select(func.count()).select_from(Call).where(*filters)
    )).scalar() or 0

    # Outcome breakdown (non-null outcomes only)
    outcomes_result = await db.execute(
        select(Call.outcome, func.count().label("count"))
        .where(*filters, Call.outcome.isnot(None))
        .group_by(Call.outcome)
        .order_by(func.count().desc())
    )
    outcomes = [{"outcome": r.outcome, "count": r.count} for r in outcomes_result]

    # Calls with no outcome logged
    no_outcome = (await db.execute(
        select(func.count()).select_from(Call).where(*filters, Call.outcome.is_(None))
    )).scalar() or 0
    if no_outcome > 0:
        outcomes.append({"outcome": "no_outcome", "count": no_outcome})

    return {
        "campaigns": all_campaigns,
        "agents": all_agents,
        "outcomes": outcomes,
        "total_calls": total,
    }
