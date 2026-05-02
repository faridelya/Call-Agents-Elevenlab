"""Post-call processing: transcript save, LLM outcome classification + summary, sentiment, CRM sync.

Flow
----
1. Re-fetch full EL transcript (more complete 60 s after call ended)
2. _llm_analyze_call() — single GPT-4o-mini call that returns:
       outcome   : authoritative classification from the full transcript
       summary   : 2-3 sentence human-readable summary
       next_action: what should happen next
   If log_call_outcome tool was called during the live call, that value is
   passed as a hint to the LLM which can confirm or override it.  The LLM
   wins when its confidence >= 0.7; the tool value wins otherwise.
3. Sentiment score (keyword heuristic, no LLM cost)
4. Lead status + campaign counters updated
"""
import json
import structlog
from datetime import datetime, timezone
from sqlalchemy import select

log = structlog.get_logger(__name__)

# Outcomes the LLM can assign.  Keep in sync with log_call_outcome tool enum
# and Analytics.tsx OUTCOME_META.
OUTCOME_CHOICES = {
    # ── Goal achieved ──────────────────────────────────────────────────────────
    "goal_achieved":       "The primary purpose of the call was fully accomplished (generic).",
    "order_confirmed":     "A sale, order, or purchase was confirmed during the call.",
    "agreed_on_service":   "Contact verbally agreed to use the service or product.",
    "appointment_booked":  "A meeting, demo, or appointment was scheduled.",
    "payment_collected":   "A payment or commitment to pay was received.",
    "issue_resolved":      "A support issue or complaint was fully resolved.",
    # ── Positive progress ──────────────────────────────────────────────────────
    "interested":          "Contact showed genuine interest but made no commitment yet.",
    "demo_scheduled":      "A product demo or informational meeting was booked.",
    # ── Follow-up ──────────────────────────────────────────────────────────────
    "callback_requested":  "Contact asked to be called back at a later time.",
    "follow_up_needed":    "Follow-up is needed but no specific time was agreed.",
    "callback_scheduled":  "A specific callback date and time was agreed.",
    # ── Incomplete contact ──────────────────────────────────────────────────────
    "voicemail_left":      "A voicemail was left; no live conversation occurred.",
    "no_answer":           "The call was not answered and no voicemail was left.",
    "gatekeeper":          "Reached a receptionist or assistant; did not speak with the decision-maker.",
    # ── Declined ───────────────────────────────────────────────────────────────
    "not_interested":      "Contact explicitly stated they are not interested.",
    "not_qualified":       "Contact does not meet the criteria or eligibility requirements.",
    # ── Administrative ──────────────────────────────────────────────────────────
    "do_not_call":         "Contact requested to be removed from the calling list.",
    "wrong_number":        "The number reached the wrong person or is no longer valid.",
    "call_disconnected":   "The call ended unexpectedly before the conversation concluded.",
}

# Outcomes that count as positive / converted for analytics
POSITIVE_OUTCOMES = {
    "goal_achieved", "order_confirmed", "agreed_on_service",
    "appointment_booked", "payment_collected", "issue_resolved",
    "demo_scheduled", "interested",
}


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

        # ── 1. Re-fetch full transcript from ElevenLabs ───────────────────────
        # _finalize_call saves a partial transcript right after call ends; EL
        # needs ~60s to finalize transcription. This task fires after that delay.
        if call.elevenlabs_conversation_id:
            from app.services.elevenlabs_service import elevenlabs_service
            conv = await elevenlabs_service.get_conversation_full(call.elevenlabs_conversation_id)

            if conv["duration_seconds"] and not call.duration_seconds:
                call.duration_seconds = conv["duration_seconds"]

            fresh = conv["transcript"]
            if fresh and len(fresh) >= len(call.transcript or []):
                call.transcript = fresh
                log.info("post_call_el_transcript_saved",
                         call_id=call_id, msgs=len(fresh),
                         conv_id=call.elevenlabs_conversation_id)

        # Fallback: Redis bridge messages (legacy path)
        if not call.transcript:
            raw = await redis.lrange(f"{call_key}:transcript", 0, -1)
            if raw:
                call.transcript = [json.loads(t) for t in raw]

        # Stage timeline
        if not call.stage_timeline:
            raw_stages = await redis.lrange(f"{call_key}:stages", 0, -1)
            if raw_stages:
                call.stage_timeline = [json.loads(s) for s in raw_stages]

        # ── 2. LLM: classify outcome + generate summary (single call) ─────────
        # Pass any tool-logged outcome as a hint; LLM can confirm or override.
        hint = call.outcome  # set by log_call_outcome tool during the live call
        analysis = await _llm_analyze_call(call.transcript, hint_outcome=hint)

        if analysis:
            # LLM wins when confident (>= 0.7) OR no tool hint was logged
            if not hint or analysis.get("confidence", 0) >= 0.7:
                call.outcome = analysis.get("outcome") or hint
            if not call.auto_summary:
                call.auto_summary = analysis.get("summary")
            if not call.next_action and analysis.get("next_action"):
                call.next_action = analysis.get("next_action")

            log.info("post_call_outcome_classified",
                     call_id=call_id,
                     outcome=call.outcome,
                     hint_was=hint,
                     confidence=analysis.get("confidence"),
                     overrode_hint=hint is not None and call.outcome != hint)

        # ── 3. Sentiment (keyword heuristic — no LLM cost) ───────────────────
        call.sentiment_score = _compute_sentiment(call.transcript)
        call.talk_ratio      = _compute_talk_ratio(call.transcript)

        # ── 4. Lead stats ──────────────────────────────────────────────────────
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

        # ── 5. Campaign counters ───────────────────────────────────────────────
        if call.campaign_id:
            await _update_campaign_counters(call, db)

        log.info("post_call_done", call_id=call_id, outcome=call.outcome)

        # ── 6. Notify frontend ─────────────────────────────────────────────────
        try:
            from app.websockets.event_bus import event_manager
            await event_manager.broadcast(call.user_id, {
                "type": "call_processed",
                "call_record_id": call_id,
                "outcome": call.outcome,
                "sentiment_score": call.sentiment_score,
                "auto_summary": call.auto_summary,
            })
        except Exception:
            pass


# ── LLM analysis ──────────────────────────────────────────────────────────────

async def _llm_analyze_call(
    transcript: list,
    hint_outcome: str | None = None,
) -> dict | None:
    """
    Single GPT-4o-mini call that classifies the outcome AND writes the summary.

    Returns:
        {outcome, confidence, summary, next_action}
    or None if OpenAI key not set or transcript is empty.
    """
    from app.config import settings
    if not settings.openai_api_key or not transcript:
        return None

    # Build transcript text (last 30 turns is enough for classification)
    text = "\n".join(
        f"{e['role'].upper()}: {e.get('text', '')}"
        for e in transcript[-30:]
        if e.get("text", "").strip()
    )
    if not text:
        return None

    # Outcome options with descriptions for the LLM
    choices_text = "\n".join(
        f'  "{k}" — {v}' for k, v in OUTCOME_CHOICES.items()
    )

    hint_block = ""
    if hint_outcome:
        hint_block = (
            f'\n\nThe live agent logged "{hint_outcome}" during the call as a hint. '
            "Validate this — use it if it matches the transcript, override it if a more "
            "accurate outcome exists in the list."
        )

    prompt = f"""You are analyzing a call transcript to classify the outcome and write a summary.
{hint_block}

TRANSCRIPT:
{text}

OUTCOME OPTIONS (choose exactly one key):
{choices_text}

Respond with a JSON object only — no markdown, no explanation:
{{
  "outcome": "<key from the list above>",
  "confidence": <0.0 to 1.0>,
  "summary": "<2-3 sentences: what was discussed, contact reaction, and result>",
  "next_action": "<one sentence on what should happen next, or 'No action needed'>"
}}"""

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=settings.openai_api_key)
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You classify call outcomes and summarize conversations. Always respond with valid JSON."},
                {"role": "user", "content": prompt},
            ],
            max_tokens=300,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content
        parsed = json.loads(raw)

        # Validate outcome is a known key
        if parsed.get("outcome") not in OUTCOME_CHOICES:
            parsed["outcome"] = hint_outcome  # fall back to tool hint

        return parsed

    except Exception as exc:
        log.warning("post_call_llm_failed", error=str(exc))
        return None


# ── Sentiment / talk ratio (no LLM) ──────────────────────────────────────────

def _compute_sentiment(transcript: list) -> float:
    positive = {"interested", "yes", "great", "sure", "absolutely", "perfect", "love", "good", "excellent", "definitely", "sounds good", "agree", "confirmed"}
    negative = {"no", "not", "never", "don't", "won't", "can't", "stop", "remove", "unsubscribe", "busy", "not interested", "wrong"}
    pos_count = neg_count = 0
    for entry in transcript:
        if entry.get("role") == "user":
            words = set(entry.get("text", "").lower().split())
            pos_count += len(words & positive)
            neg_count += len(words & negative)
    total = pos_count + neg_count
    return round(pos_count / total, 2) if total else 0.5


def _compute_talk_ratio(transcript: list) -> float:
    agent_words = sum(len(e.get("text", "").split()) for e in transcript if e.get("role") == "agent")
    user_words  = sum(len(e.get("text", "").split()) for e in transcript if e.get("role") == "user")
    total = agent_words + user_words
    return round(agent_words / total, 2) if total else 0.5


def _outcome_to_status(outcome: str) -> str:
    if outcome in POSITIVE_OUTCOMES:
        return "qualified"
    if outcome in {"callback_requested", "callback_scheduled", "follow_up_needed", "demo_scheduled"}:
        return "contacted"
    if outcome == "do_not_call":
        return "disqualified"
    return "contacted"


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

    # Conversion rate: any positive outcome counts, not just "interested"
    if campaign.contacts_completed > 0:
        positive = await db.execute(
            select(func.count()).select_from(type(call)).where(
                type(call).campaign_id == campaign.id,
                type(call).outcome.in_(list(POSITIVE_OUTCOMES)),
            )
        )
        campaign.conversion_rate = round(positive.scalar() / campaign.contacts_completed * 100, 1)

    await db.commit()
