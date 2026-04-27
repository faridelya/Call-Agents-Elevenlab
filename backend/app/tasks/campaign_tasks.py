"""Campaign dialing worker — picks next contact, initiates call, enforces limits.

Concurrency model
-----------------
The task uses two layers of protection so campaign batch-dialling never
overwhelms the single-uvicorn bridge, Twilio, or ElevenLabs:

1. **Redis mutex** (SETNX + 60 s TTL): only one dial_next_contact job for a
   given campaign runs at a time.  If a second job races in while the first is
   still holding the lock it reschedules itself and exits immediately.

2. **Active-call ceiling** (checked inside the lock):
   a. *Per-campaign* — respects campaign.max_concurrent_calls (default 1).
      We count DB rows where campaign_id matches and status is live.
   b. *Global* — settings.campaign_global_max_concurrent (default 5).
      We count all campaign-originated calls that are currently live.
      Single test calls (POST /calls/outbound) share Twilio/EL capacity but
      are never blocked by this guard; they always dial immediately.

If either ceiling is hit, the task re-enqueues with campaign_backoff_seconds
delay and releases the lock — no call is placed.

Minimum interval
----------------
The effective inter-dial delay is max(campaign.call_interval_seconds,
settings.campaign_min_interval_seconds) so a misconfigured interval=0 cannot
create a tight loop.
"""
import asyncio
import json
import structlog
from datetime import datetime, timezone
from sqlalchemy import select, func

log = structlog.get_logger(__name__)

# Call statuses that count as "occupying a Twilio/EL slot".
_ACTIVE_STATUSES = ("initiated", "ringing", "in-progress")


async def dial_next_contact(ctx: dict, campaign_id: str) -> None:
    """ARQ task — dial the next pending contact in a campaign."""
    from app.config import settings

    redis = ctx.get("redis")
    lock_key = f"campaign:{campaign_id}:dialing_lock"

    # ── 1. Redis mutex ────────────────────────────────────────────────────────
    # NX = only set if not exists; EX = 60 s TTL so a crashed job never
    # permanently blocks the campaign.
    if redis:
        acquired = await redis.set(lock_key, "1", nx=True, ex=60)
        if not acquired:
            # Another job is already dialling for this campaign — back off.
            log.debug("campaign_lock_busy", campaign_id=campaign_id)
            await _enqueue_next(campaign_id, settings.campaign_backoff_seconds)
            return

    try:
        await _dial(ctx, campaign_id)
    finally:
        # Always release the lock, even on exceptions.
        if redis:
            await redis.delete(lock_key)


async def _dial(ctx: dict, campaign_id: str) -> None:
    """Core dial logic — runs while holding the per-campaign Redis lock."""
    from app.config import settings
    from app.models.campaign import Campaign
    from app.models.call import Call
    from app.models.lead import Lead
    from app.models.agent import Agent
    from app.models.base import new_uuid
    from app.services.twilio_service import TwilioService

    db_factory = ctx["db_factory"]
    redis = ctx.get("redis")

    async with db_factory() as db:

        # ── Fetch campaign ────────────────────────────────────────────────────
        result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
        campaign = result.scalar_one_or_none()

        if not campaign or campaign.status != "running":
            return

        # ── All contacts dialled? ─────────────────────────────────────────────
        called_count = campaign.contacts_called
        if called_count >= len(campaign.contacts):
            campaign.status = "completed"
            campaign.completed_at = datetime.now(timezone.utc).isoformat()
            await db.commit()
            log.info("campaign_completed", campaign_id=campaign_id)
            return

        # ── 2a. Per-campaign active call count ────────────────────────────────
        # Uses campaign.max_concurrent_calls (default 1 from the model).
        per_campaign_active = (
            await db.execute(
                select(func.count())
                .select_from(Call)
                .where(
                    Call.campaign_id == campaign_id,
                    Call.status.in_(_ACTIVE_STATUSES),
                )
            )
        ).scalar_one()

        max_per_campaign = max(1, campaign.max_concurrent_calls)
        if per_campaign_active >= max_per_campaign:
            log.info(
                "campaign_slot_full",
                campaign_id=campaign_id,
                active=per_campaign_active,
                limit=max_per_campaign,
            )
            await _enqueue_next(campaign_id, settings.campaign_backoff_seconds)
            return

        # ── 2b. Global active campaign call count ─────────────────────────────
        # Counts all calls that originated from *any* campaign (campaign_id IS
        # NOT NULL) and are currently live.  Single test calls have campaign_id
        # NULL so they don't count against this limit.
        global_active = (
            await db.execute(
                select(func.count())
                .select_from(Call)
                .where(
                    Call.campaign_id.isnot(None),
                    Call.status.in_(_ACTIVE_STATUSES),
                )
            )
        ).scalar_one()

        if global_active >= settings.campaign_global_max_concurrent:
            log.info(
                "campaign_global_limit_hit",
                campaign_id=campaign_id,
                global_active=global_active,
                limit=settings.campaign_global_max_concurrent,
            )
            await _enqueue_next(campaign_id, settings.campaign_backoff_seconds)
            return

        # ── Pick contact ──────────────────────────────────────────────────────
        contact = campaign.contacts[called_count]
        phone = contact.get("phone") or contact.get("Phone", "")

        if not phone:
            campaign.contacts_called += 1
            campaign.contacts_failed += 1
            await db.commit()
            await _enqueue_next(campaign_id, _effective_interval(campaign))
            return

        # ── DNC check ─────────────────────────────────────────────────────────
        dnc = await db.execute(
            select(Lead).where(
                Lead.user_id == campaign.user_id,
                Lead.phone == phone,
                Lead.do_not_call.is_(True),
            )
        )
        if dnc.scalar_one_or_none():
            campaign.contacts_called += 1
            campaign.contacts_dnc += 1
            await db.commit()
            await _enqueue_next(campaign_id, _effective_interval(campaign))
            return

        # ── Fetch agent ───────────────────────────────────────────────────────
        agent_result = await db.execute(select(Agent).where(Agent.id == campaign.agent_id))
        agent = agent_result.scalar_one_or_none()

        if not agent:
            campaign.status = "failed"
            await db.commit()
            log.error("campaign_agent_missing", campaign_id=campaign_id)
            return

        # ── Create call record ────────────────────────────────────────────────
        call = Call(
            id=new_uuid(),
            user_id=campaign.user_id,
            agent_id=campaign.agent_id,
            campaign_id=campaign.id,
            phone_number_id=campaign.phone_number_id,
            from_number=settings.twilio_phone_number,
            to_number=phone,
            direction="outbound",
            status="initiated",
            started_at=datetime.now(timezone.utc).isoformat(),
        )
        db.add(call)
        await db.flush()  # resolve call.id before Redis write

        # ── Seed Redis call context ───────────────────────────────────────────
        if redis:
            context = {
                "call_record_id": call.id,
                "agent_id": agent.id,
                "user_id": campaign.user_id,
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
                "lead_data": json.dumps(contact),
            }
            await redis.hset(f"call:{call.id}", mapping=context)
            await redis.expire(f"call:{call.id}", 14400)

        # ── Place Twilio call ─────────────────────────────────────────────────
        twiml_url = f"{settings.public_url}/api/v1/webhooks/twilio/twiml/{call.id}"
        status_url = f"{settings.public_url}/api/v1/webhooks/twilio/status"

        try:
            twilio = TwilioService()
            result = await twilio.create_call(
                to=phone,
                from_=settings.twilio_phone_number,
                twiml_url=twiml_url,
                status_callback=status_url,
            )
            call.twilio_call_sid = result["sid"]
            log.info(
                "campaign_dial_placed",
                campaign_id=campaign_id,
                phone=phone,
                call_id=call.id,
                sid=result["sid"],
                global_active=global_active + 1,
            )
        except Exception as e:
            log.error("campaign_dial_error", campaign_id=campaign_id, phone=phone, error=str(e))
            call.status = "failed"
            campaign.contacts_failed += 1

        campaign.contacts_called += 1
        await db.commit()

        # ── Schedule next contact ─────────────────────────────────────────────
        # Always re-enqueue so each filled slot immediately refills itself.
        # The slot checks at the top of _dial() act as the throttle — no call
        # is placed if all concurrent slots are already occupied.
        await _enqueue_next(campaign_id, _effective_interval(campaign))


def _effective_interval(campaign) -> int:
    """Return the inter-dial delay, respecting the configured minimum."""
    from app.config import settings
    return max(campaign.call_interval_seconds, settings.campaign_min_interval_seconds)


async def _enqueue_next(campaign_id: str, delay_seconds: int) -> None:
    """Re-queue dial_next_contact after delay_seconds."""
    from arq import create_pool
    from arq.connections import RedisSettings
    from app.config import settings

    # Enforce an absolute minimum even on explicit backoff to prevent
    # pathological tight re-queue loops.
    delay_seconds = max(delay_seconds, 1)

    try:
        pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
        await pool.enqueue_job("dial_next_contact", campaign_id, _defer_by=delay_seconds)
        await pool.aclose()
    except Exception as e:
        log.error("campaign_enqueue_error", campaign_id=campaign_id, error=str(e))
