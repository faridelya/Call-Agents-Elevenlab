"""Post-call processing: transcript save, sentiment, LLM summary, CRM sync."""
import json
import structlog
from datetime import datetime, timezone
from sqlalchemy import select

log = structlog.get_logger(__name__)


async def post_call_processing(ctx: dict, call_id: str) -> None:
    """ARQ task — runs after every call ends."""
    db_factory = ctx["db_factory"]
    redis = ctx["redis"]

    async with db_factory() as db:
        from app.models.call import Call
        result = await db.execute(select(Call).where(Call.id == call_id))
        call = result.scalar_one_or_none()
        if not call:
            return

        call_key = f"call:{call.twilio_call_sid or call_id}"

        # Always refresh from ElevenLabs — _finalize_call may have saved a
        # partial transcript immediately after the call ended while EL was still
        # transcribing. By the time this ARQ task fires (60s deferred) EL will
        # have the full transcript. Only overwrite if we get an equal-or-better result.
        if call.elevenlabs_conversation_id:
            from app.services.elevenlabs_service import elevenlabs_service
            conv = await elevenlabs_service.get_conversation_full(call.elevenlabs_conversation_id)

            # Save duration if Twilio didn't report it (common when EL ends the call)
            if conv["duration_seconds"] and not call.duration_seconds:
                call.duration_seconds = conv["duration_seconds"]

            fresh = conv["transcript"]
            if fresh and len(fresh) >= len(call.transcript or []):
                call.transcript = fresh
                log.info("post_call_el_transcript_saved",
                         call_id=call_id,
                         msgs=len(fresh),
                         conv_id=call.elevenlabs_conversation_id)

        # Fallback: assemble from Redis bridge messages (legacy bridge mode only)
        if not call.transcript:
            raw = await redis.lrange(f"{call_key}:transcript", 0, -1)
            if raw:
                call.transcript = [json.loads(t) for t in raw]

        # Assemble stage timeline
        if not call.stage_timeline:
            raw_stages = await redis.lrange(f"{call_key}:stages", 0, -1)
            if raw_stages:
                call.stage_timeline = [json.loads(s) for s in raw_stages]

        # Simple sentiment from transcript
        call.sentiment_score = _compute_sentiment(call.transcript)

        # Talk ratio (agent vs user word count)
        call.talk_ratio = _compute_talk_ratio(call.transcript)

        # LLM summary (optional — only if openai key set)
        if not call.auto_summary:
            call.auto_summary = await _generate_summary(call.transcript)

        # Update lead stats
        if call.lead_id:
            from app.models.lead import Lead
            lead_result = await db.execute(select(Lead).where(Lead.id == call.lead_id))
            lead = lead_result.scalar_one_or_none()
            if lead:
                lead.total_calls += 1
                lead.last_called_at = datetime.now(timezone.utc).isoformat()
                if call.outcome:
                    lead.lead_status = _outcome_to_status(call.outcome)

        await db.commit()

        # Update campaign counters
        if call.campaign_id:
            await _update_campaign_counters(call, db)

        log.info("post_call_done", call_id=call_id, outcome=call.outcome)

        # Notify frontend of completed processing
        try:
            from app.websockets.event_bus import event_manager
            await event_manager.broadcast(call.user_id, {
                "type": "call_processed",
                "call_record_id": call_id,   # matches LiveEvent type in frontend
                "outcome": call.outcome,
                "sentiment_score": call.sentiment_score,
                "auto_summary": call.auto_summary,
            })
        except Exception:
            pass


def _compute_sentiment(transcript: list) -> float:
    """Very simple sentiment: count positive/negative words."""
    positive = {"interested", "yes", "great", "sure", "absolutely", "perfect", "love", "good", "excellent", "definitely"}
    negative = {"no", "not", "never", "don't", "won't", "can't", "stop", "remove", "unsubscribe", "busy"}

    pos_count = 0
    neg_count = 0
    for entry in transcript:
        if entry.get("role") == "user":
            words = set(entry.get("text", "").lower().split())
            pos_count += len(words & positive)
            neg_count += len(words & negative)

    total = pos_count + neg_count
    if total == 0:
        return 0.5
    return round(pos_count / total, 2)


def _compute_talk_ratio(transcript: list) -> float:
    """Ratio of agent words to total words."""
    agent_words = sum(len(e.get("text", "").split()) for e in transcript if e.get("role") == "agent")
    user_words = sum(len(e.get("text", "").split()) for e in transcript if e.get("role") == "user")
    total = agent_words + user_words
    return round(agent_words / total, 2) if total else 0.5


async def _generate_summary(transcript: list) -> str | None:
    from app.config import settings
    if not settings.openai_api_key or not transcript:
        return None

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=settings.openai_api_key)
        text = "\n".join(f"{e['role'].upper()}: {e.get('text', '')}" for e in transcript[-20:])
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Summarize this sales call in 2-3 sentences. Focus on outcome and next steps."},
                {"role": "user", "content": text},
            ],
            max_tokens=150,
        )
        return response.choices[0].message.content
    except Exception:
        return None


def _outcome_to_status(outcome: str) -> str:
    mapping = {
        "interested": "contacted",
        "callback_scheduled": "contacted",
        "not_interested": "contacted",
        "do_not_call": "contacted",
        "voicemail_left": "contacted",
    }
    return mapping.get(outcome, "contacted")


async def _update_campaign_counters(call, db) -> None:
    from app.models.campaign import Campaign
    from sqlalchemy import select, func

    result = await db.execute(select(Campaign).where(Campaign.id == call.campaign_id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        return

    campaign.contacts_answered += 1
    if call.status == "completed":
        campaign.contacts_completed += 1
    elif call.status in ("failed", "busy", "no-answer"):
        campaign.contacts_failed += 1

    # Recompute conversion rate
    if campaign.contacts_completed > 0:
        interested = await db.execute(
            select(func.count()).select_from(type(call)).where(
                type(call).campaign_id == campaign.id,
                type(call).outcome == "interested",
            )
        )
        campaign.conversion_rate = round(interested.scalar() / campaign.contacts_completed * 100, 1)

    await db.commit()
