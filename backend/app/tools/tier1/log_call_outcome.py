from sqlalchemy import select
from app.tools.registry import register_tool
from app.tools.schemas import CallContext
from app.models.call import Call
from app.models.lead import Lead

PARAMS = {
    "type": "object",
    "properties": {
        "outcome": {
            "type": "string",
            "enum": [
                # Goal achieved
                "goal_achieved",
                "order_confirmed",
                "agreed_on_service",
                "appointment_booked",
                "payment_collected",
                "issue_resolved",
                # Positive progress
                "interested",
                "demo_scheduled",
                # Follow-up
                "callback_requested",
                "follow_up_needed",
                "callback_scheduled",
                # Incomplete contact
                "voicemail_left",
                "no_answer",
                "gatekeeper",
                # Declined
                "not_interested",
                "not_qualified",
                # Administrative
                "do_not_call",
                "wrong_number",
                "call_disconnected",
            ],
            "description": (
                "Your best assessment of the call result. "
                "Use 'order_confirmed' when a sale/order is placed. "
                "'agreed_on_service' when they verbally agreed but haven't paid yet. "
                "'goal_achieved' for any other primary goal accomplished. "
                "'appointment_booked' or 'demo_scheduled' when a meeting is set. "
                "'interested' when they showed interest but no commitment. "
                "'callback_requested' when they ask to be called back. "
                "'not_interested' when explicitly declined. "
                "'do_not_call' when they ask to be removed. "
                "This is a hint — the post-call system will verify it from the full transcript."
            ),
        },
        "notes": {
            "type": "string",
            "description": "Disposition notes or key points from the conversation",
        },
        "next_action": {
            "type": "string",
            "description": "What should happen next, e.g. 'Send proposal', 'Schedule demo for Tuesday 3pm'",
        },
        "follow_up_date": {
            "type": "string",
            "description": "ISO 8601 datetime for follow-up if applicable",
        },
    },
    "required": ["outcome"],
}


@register_tool(
    name="log_call_outcome",
    tier=1,
    execution="server",
    description=(
        "Log the outcome of this call before ending the conversation. "
        "Call this once you have a clear sense of the result — typically just before saying goodbye. "
        "The post-call system will verify and may refine the outcome from the full transcript, "
        "so an approximate value is fine if you are unsure."
    ),
    parameters=PARAMS,
)
async def handler(params: dict, ctx: CallContext, db, redis) -> str:
    outcome       = params["outcome"]
    notes         = params.get("notes", "")
    next_action   = params.get("next_action", "")
    follow_up_date = params.get("follow_up_date")

    result = await db.execute(select(Call).where(Call.id == ctx.call_record_id))
    call = result.scalar_one_or_none()

    if call:
        call.outcome       = outcome
        call.disposition_notes = notes
        call.next_action   = next_action
        call.follow_up_date = follow_up_date

    # Flag lead as DNC immediately — this one cannot wait for post-call
    if outcome == "do_not_call":
        lead_id = await redis.hget(f"call:{ctx.call_record_id}", "lead_id")
        if not lead_id and ctx.call_sid:
            lead_id = await redis.hget(f"call:{ctx.call_sid}", "lead_id")
        if not lead_id and call and call.lead_id:
            lead_id = call.lead_id
        if lead_id:
            lead_result = await db.execute(select(Lead).where(Lead.id == lead_id))
            lead = lead_result.scalar_one_or_none()
            if lead:
                lead.do_not_call = True
                lead.do_not_call_reason = notes or "Requested during call"

    await db.commit()
    await redis.hset(f"call:{ctx.call_record_id}", "outcome", outcome)
    if ctx.call_sid and ctx.call_sid != ctx.call_record_id:
        await redis.hset(f"call:{ctx.call_sid}", "outcome", outcome)

    return f"Outcome logged: {outcome}"
