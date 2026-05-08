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

Call configuration
------------------
All call configuration (from-number, Twilio credentials, ElevenLabs agent ID,
prompts, tools) is derived from the agent attached to the campaign — the same
way single test calls (POST /calls/outbound) work.  No separate phone_number_id
is required on the campaign.
"""
import json
import structlog
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, func

log = structlog.get_logger(__name__)

# Call statuses that count as "occupying a Twilio/EL slot".
_ACTIVE_STATUSES = ("initiated", "ringing", "in-progress")


async def dial_next_contact(ctx: dict, campaign_id: str) -> None:
    """ARQ task — dial the next pending contact in a campaign."""
    from app.config import settings

    redis = ctx.get("redis")
    lock_key = f"campaign:{campaign_id}:dialing_lock"

    if settings.campaign_debug:
        log.debug("campaign_task_entry", campaign_id=campaign_id)

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

    if settings.campaign_debug:
        log.debug("campaign_lock_acquired", campaign_id=campaign_id)

    try:
        await _dial(ctx, campaign_id)
    except Exception as exc:
        # Any unhandled error in _dial must not silently kill the campaign.
        # Re-enqueue with backoff so the next contact gets a chance.
        log.error(
            "campaign_dial_unhandled_error",
            campaign_id=campaign_id,
            error=str(exc),
            exc_info=True,
        )
        await _enqueue_next(campaign_id, settings.campaign_backoff_seconds)
    finally:
        # Always release the lock, even on exceptions.
        if redis:
            await redis.delete(lock_key)
        if settings.campaign_debug:
            log.debug("campaign_lock_released", campaign_id=campaign_id)


async def _dial(ctx: dict, campaign_id: str) -> None:
    """Core dial logic — runs while holding the per-campaign Redis lock."""
    from app.config import settings
    from app.models.campaign import Campaign
    from app.models.call import Call
    from app.models.lead import Lead
    from app.models.agent import Agent
    from app.models.user import User
    from app.models.base import new_uuid
    from app.services.twilio_service import get_twilio_service

    db_factory = ctx["db_factory"]
    redis = ctx.get("redis")

    async with db_factory() as db:

        # ── Fetch campaign ────────────────────────────────────────────────────
        result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
        campaign = result.scalar_one_or_none()

        if not campaign or campaign.status != "running":
            if settings.campaign_debug:
                log.debug("campaign_not_running",
                          campaign_id=campaign_id,
                          status=campaign.status if campaign else "not_found")
            return

        # ── All contacts dialled? ─────────────────────────────────────────────
        called_count = campaign.contacts_called
        if settings.campaign_debug:
            log.debug("campaign_dial_state",
                      campaign_id=campaign_id,
                      contacts_called=called_count,
                      total_contacts=len(campaign.contacts),
                      max_concurrent=campaign.max_concurrent_calls)

        # ── Stale "initiated" call cleanup ────────────────────────────────────
        # Twilio's max ring time is ~90 s. Any call still "initiated" after
        # 5 minutes never received a TwiML response and is permanently orphaned.
        # Mark it failed so it stops blocking the concurrent-call ceiling.
        stale_cutoff = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        stale_result = await db.execute(
            select(Call).where(
                Call.campaign_id == campaign_id,
                Call.status == "initiated",
                Call.started_at < stale_cutoff,
            )
        )
        stale_calls = stale_result.scalars().all()
        if stale_calls:
            for sc in stale_calls:
                sc.status = "failed"
            campaign.contacts_failed = (campaign.contacts_failed or 0) + len(stale_calls)
            await db.commit()
            log.warning(
                "campaign_stale_initiated_cleaned",
                campaign_id=campaign_id,
                count=len(stale_calls),
            )

        if called_count >= len(campaign.contacts):
            active_remaining = (
                await db.execute(
                    select(func.count())
                    .select_from(Call)
                    .where(
                        Call.campaign_id == campaign_id,
                        Call.status.in_(_ACTIVE_STATUSES),
                    )
                )
            ).scalar_one()
            if active_remaining:
                log.info(
                    "campaign_waiting_for_active_calls",
                    campaign_id=campaign_id,
                    active_remaining=active_remaining,
                )
                await _enqueue_next(campaign_id, settings.campaign_backoff_seconds)
                return

            campaign.status = "completed"
            campaign.completed_at = datetime.now(timezone.utc).isoformat()
            await db.commit()
            log.info("campaign_completed", campaign_id=campaign_id)
            return

        # ── 2a. Per-campaign active call count ────────────────────────────────
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
        if settings.campaign_debug:
            log.debug("campaign_slot_check",
                      campaign_id=campaign_id,
                      per_campaign_active=per_campaign_active,
                      max_per_campaign=max_per_campaign)

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

        if settings.campaign_debug:
            log.debug("campaign_global_slot_check",
                      campaign_id=campaign_id,
                      global_active=global_active,
                      global_limit=settings.campaign_global_max_concurrent)

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
        lead_result = await db.execute(
            select(Lead).where(
                Lead.user_id == campaign.user_id,
                Lead.phone == phone,
            )
        )
        existing_lead = lead_result.scalar_one_or_none()
        if existing_lead and existing_lead.do_not_call:
            campaign.contacts_called += 1
            campaign.contacts_dnc += 1
            await db.commit()
            await _enqueue_next(campaign_id, _effective_interval(campaign))
            return

        # ── Fetch agent (source of truth for all call config) ─────────────────
        agent_result = await db.execute(select(Agent).where(Agent.id == campaign.agent_id))
        agent = agent_result.scalar_one_or_none()

        if not agent:
            campaign.status = "failed"
            await db.commit()
            log.error("campaign_agent_missing", campaign_id=campaign_id)
            return

        if not agent.is_active:
            campaign.status = "failed"
            await db.commit()
            log.error("campaign_agent_inactive", campaign_id=campaign_id, agent_id=agent.id)
            return

        if not agent.elevenlabs_agent_id:
            campaign.status = "failed"
            await db.commit()
            log.error(
                "campaign_agent_not_synced",
                campaign_id=campaign_id,
                agent_id=agent.id,
                hint="Save/sync the agent to ElevenLabs before starting a campaign",
            )
            return

        # ── Fetch user for per-user Twilio credentials ────────────────────────
        user_result = await db.execute(select(User).where(User.id == campaign.user_id))
        user = user_result.scalar_one_or_none()

        # ── Resolve from-number from agent (same priority as single calls) ────
        from_number = agent.twilio_phone_number or settings.twilio_phone_number

        if not from_number:
            campaign.status = "failed"
            await db.commit()
            log.error(
                "campaign_no_from_number",
                campaign_id=campaign_id,
                agent_id=agent.id,
                hint="Set a Twilio phone number on the agent or in the platform settings",
            )
            return

        # ── Create call record ────────────────────────────────────────────────
        call = Call(
            id=new_uuid(),
            user_id=campaign.user_id,
            agent_id=campaign.agent_id,
            campaign_id=campaign.id,
            lead_id=existing_lead.id if existing_lead else None,
            from_number=from_number,
            to_number=phone,
            direction="outbound",
            status="initiated",
            started_at=datetime.now(timezone.utc).isoformat(),
        )
        db.add(call)
        await db.flush()  # resolve call.id before Redis write

        if settings.campaign_debug:
            log.debug("campaign_call_record_created",
                      campaign_id=campaign_id,
                      call_id=call.id,
                      to_number=phone,
                      from_number=from_number,
                      contact_index=called_count)

        # ── Seed Redis call context (mirrors POST /calls/outbound pipeline) ────
        if redis:
            context = {
                "call_record_id": call.id,
                "agent_id": agent.id,
                "user_id": campaign.user_id,
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
                "lead_data": json.dumps(contact),
            }
            await redis.hset(f"call:{call.id}", mapping=context)
            await redis.expire(f"call:{call.id}", 14400)

        # ── Place Twilio call (using per-user credentials) ────────────────────
        twiml_url = f"{settings.public_url}/api/v1/webhooks/twilio/twiml/{call.id}"
        status_url = f"{settings.public_url}/api/v1/webhooks/twilio/status"

        try:
            twilio = get_twilio_service(user)
            result = await twilio.create_call(
                to=phone,
                from_=from_number,
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
                from_number=from_number,
                global_active=global_active + 1,
            )
        except Exception as e:
            log.error("campaign_dial_error", campaign_id=campaign_id, phone=phone,
                      call_id=call.id, error=str(e))
            call.status = "failed"
            campaign.contacts_failed += 1

        campaign.contacts_called += 1
        await db.commit()

        if settings.campaign_debug:
            log.debug("campaign_contact_advanced",
                      campaign_id=campaign_id,
                      contacts_called=campaign.contacts_called,
                      contacts_failed=campaign.contacts_failed,
                      next_interval_s=_effective_interval(campaign))

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
