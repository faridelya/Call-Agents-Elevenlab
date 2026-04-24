"""Campaign dialing worker — picks next contact, initiates call, enforces call window."""
import asyncio
import json
import structlog
from datetime import datetime, timezone
from sqlalchemy import select

log = structlog.get_logger(__name__)


async def dial_next_contact(ctx: dict, campaign_id: str) -> None:
    """ARQ task — dial the next pending contact in a campaign."""
    db_factory = ctx["db_factory"]

    async with db_factory() as db:
        from app.models.campaign import Campaign
        from app.models.call import Call
        from app.models.lead import Lead
        from app.models.base import new_uuid
        from app.config import settings

        result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
        campaign = result.scalar_one_or_none()

        if not campaign or campaign.status != "running":
            return

        # Find next contact index
        called_count = campaign.contacts_called
        if called_count >= len(campaign.contacts):
            # All contacts dialed — complete campaign
            campaign.status = "completed"
            campaign.completed_at = datetime.now(timezone.utc).isoformat()
            await db.commit()
            log.info("campaign_completed", campaign_id=campaign_id)
            return

        contact = campaign.contacts[called_count]
        phone = contact.get("phone") or contact.get("Phone", "")

        if not phone:
            campaign.contacts_called += 1
            campaign.contacts_failed += 1
            await db.commit()
            await _enqueue_next(campaign_id, campaign.call_interval_seconds)
            return

        # Check DNC
        dnc = await db.execute(
            select(Lead).where(
                Lead.user_id == campaign.user_id,
                Lead.phone == phone,
                Lead.do_not_call == True,
            )
        )
        if dnc.scalar_one_or_none():
            campaign.contacts_called += 1
            campaign.contacts_dnc += 1
            await db.commit()
            await _enqueue_next(campaign_id, 1)
            return

        # Initiate Twilio call
        from app.models.agent import Agent
        from app.services.twilio_service import TwilioService

        agent_result = await db.execute(select(Agent).where(Agent.id == campaign.agent_id))
        agent = agent_result.scalar_one_or_none()

        if not agent:
            campaign.status = "failed"
            await db.commit()
            return

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
        await db.flush()

        # Seed Redis context with campaign contact data
        redis = ctx.get("redis")
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

        twiml_url = f"{settings.public_url}/api/v1/webhooks/twilio/twiml/{call.id}"
        status_url = f"{settings.public_url}/api/v1/webhooks/twilio/status"

        try:
            twilio = TwilioService()
            result = await twilio.create_call(to=phone, from_=settings.twilio_phone_number, twiml_url=twiml_url, status_callback=status_url)
            call.twilio_call_sid = result["sid"]
        except Exception as e:
            log.error("campaign_dial_error", campaign_id=campaign_id, phone=phone, error=str(e))
            campaign.contacts_failed += 1

        campaign.contacts_called += 1
        await db.commit()

        # Schedule next contact after interval
        await _enqueue_next(campaign_id, campaign.call_interval_seconds)


async def _enqueue_next(campaign_id: str, delay_seconds: int) -> None:
    from arq import create_pool
    from arq.connections import RedisSettings
    from app.config import settings

    try:
        pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
        await pool.enqueue_job("dial_next_contact", campaign_id, _defer_by=delay_seconds)
        await pool.aclose()
    except Exception as e:
        log.error("campaign_enqueue_error", error=str(e))
