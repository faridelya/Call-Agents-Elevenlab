"""Periodic maintenance: data retention, stale call cleanup."""
import structlog
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, delete

log = structlog.get_logger(__name__)

CALL_RETENTION_DAYS = 365
TRANSCRIPT_REDIS_TTL = 14400  # 4 hours (already set on write)


async def cleanup_stale_calls(ctx: dict) -> None:
    """Mark calls stuck in 'in-progress' for >4 hours as failed."""
    db_factory = ctx["db_factory"]

    async with db_factory() as db:
        from app.models.call import Call

        cutoff = (datetime.now(timezone.utc) - timedelta(hours=4)).isoformat()
        result = await db.execute(
            select(Call).where(
                Call.status == "in-progress",
                Call.started_at < cutoff,
            )
        )
        stale = result.scalars().all()

        for call in stale:
            call.status = "failed"
            call.ended_at = datetime.now(timezone.utc).isoformat()
            log.warning("stale_call_closed", call_id=call.id)

        if stale:
            await db.commit()
            log.info("stale_calls_cleaned", count=len(stale))


async def purge_old_calls(ctx: dict) -> None:
    """Delete call records older than retention window (respects GDPR-style cleanup)."""
    db_factory = ctx["db_factory"]

    async with db_factory() as db:
        from app.models.call import Call
        from sqlalchemy import delete as _delete

        cutoff = (datetime.now(timezone.utc) - timedelta(days=CALL_RETENTION_DAYS)).isoformat()
        result = await db.execute(
            _delete(Call).where(Call.created_at < cutoff).returning(Call.id)
        )
        deleted_ids = result.fetchall()
        if deleted_ids:
            await db.commit()
            log.info("old_calls_purged", count=len(deleted_ids))


async def reset_failed_campaigns(ctx: dict) -> None:
    """Re-queue campaigns that were running when the worker crashed."""
    db_factory = ctx["db_factory"]

    async with db_factory() as db:
        from app.models.campaign import Campaign

        result = await db.execute(
            select(Campaign).where(Campaign.status == "running")
        )
        running = result.scalars().all()

        for campaign in running:
            # If no calls were initiated in the last 10 minutes, resume dialing
            last_call_cutoff = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
            from app.models.call import Call
            from sqlalchemy import func

            last_call = await db.execute(
                select(func.max(Call.started_at)).where(
                    Call.campaign_id == campaign.id
                )
            )
            last_called_at = last_call.scalar()

            if not last_called_at or last_called_at < last_call_cutoff:
                log.info("resuming_stalled_campaign", campaign_id=campaign.id)
                from app.tasks.campaign_tasks import _enqueue_next
                await _enqueue_next(campaign.id, delay_seconds=5)
