from fastapi import APIRouter, Depends
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.call import Call
from app.models.lead import Lead
from app.models.campaign import Campaign
from app.models.user import User

router = APIRouter(prefix="/analytics", tags=["analytics"])


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
        select(func.count()).select_from(Call).where(Call.user_id == uid, Call.outcome == "interested")
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
    """Return per-agent aggregate stats: total calls, average duration, and average sentiment score."""
    result = await db.execute(
        select(
            Call.agent_id,
            func.count().label("total_calls"),
            func.avg(Call.duration_seconds).label("avg_duration"),
            func.avg(Call.sentiment_score).label("avg_sentiment"),
        )
        .where(Call.user_id == current_user.id, Call.agent_id.isnot(None))
        .group_by(Call.agent_id)
    )
    return {"agents": [
        {
            "agent_id": r.agent_id,
            "total_calls": r.total_calls,
            "avg_duration_seconds": round(r.avg_duration or 0, 1),
            "avg_sentiment": round(r.avg_sentiment or 0, 2),
        }
        for r in result
    ]}


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
