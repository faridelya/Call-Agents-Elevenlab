"""Periodic maintenance: data retention, stale call cleanup."""
import structlog
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, delete

log = structlog.get_logger(__name__)

CALL_RETENTION_DAYS = 365
TRANSCRIPT_REDIS_TTL = 14400  # 4 hours (already set on write)


async def cleanup_stale_calls(ctx: dict) -> None:
    """Finalize calls whose EL conversation is done but weren't caught by Twilio callbacks.
    Also hard-fail any calls stuck in-progress for >4 hours."""
    from app.models.call import Call
    from app.services.elevenlabs_service import elevenlabs_service
    from app.db.redis import get_redis_pool

    db_factory = ctx["db_factory"]
    redis = ctx.get("redis") or await get_redis_pool()

    async with db_factory() as db:
        # Find all live calls that started more than 2 minutes ago
        cutoff_recent = (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat()
        cutoff_stale  = (datetime.now(timezone.utc) - timedelta(hours=4)).isoformat()

        result = await db.execute(
            select(Call).where(
                Call.status.in_(("initiated", "ringing", "in-progress")),
                Call.started_at < cutoff_recent,
            )
        )
        calls = result.scalars().all()

        for call in calls:
            # Hard-fail calls stuck >4 hours regardless of EL status
            if call.started_at and call.started_at < cutoff_stale:
                call.status = "failed"
                call.ended_at = datetime.now(timezone.utc).isoformat()
                from app.routers.webhooks import _finalize_call
                await _finalize_call(call, redis, db)
                log.warning("stale_call_force_failed", call_id=call.id)
                continue

            # For calls with an EL conversation ID, check if EL says it's done
            if call.elevenlabs_conversation_id:
                conv = await elevenlabs_service.get_conversation_full(
                    call.elevenlabs_conversation_id
                )
                el_status = conv["status"]
                if el_status in ("done", "failed"):
                    call.status = "completed"
                    call.ended_at = call.ended_at or datetime.now(timezone.utc).isoformat()
                    # Save duration from EL metadata if Twilio didn't report it
                    if conv["duration_seconds"] and not call.duration_seconds:
                        call.duration_seconds = conv["duration_seconds"]
                    from app.routers.webhooks import _finalize_call
                    await _finalize_call(call, redis, db)
                    log.info("sweep_finalized_call",
                             call_id=call.id, el_status=el_status)

        await db.commit()


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
