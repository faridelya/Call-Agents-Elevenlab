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
            "enum": ["interested", "not_interested", "callback_scheduled", "voicemail_left", "wrong_number", "do_not_call"],
            "description": "Result of the call",
        },
        "notes": {"type": "string", "description": "Disposition notes or conversation summary"},
        "next_action": {"type": "string", "description": "What should happen next, e.g. 'send proposal', 'schedule demo'"},
        "follow_up_date": {"type": "string", "description": "ISO 8601 datetime for follow-up"},
    },
    "required": ["outcome"],
}


@register_tool(
    name="log_call_outcome",
    tier=1,
    execution="client",
    description="Record the outcome and disposition of this call. Always call this before ending the conversation.",
    parameters=PARAMS,
)
async def handler(params: dict, ctx: CallContext, db, redis) -> str:
    outcome = params["outcome"]
    notes = params.get("notes", "")
    next_action = params.get("next_action", "")
    follow_up_date = params.get("follow_up_date")

    result = await db.execute(select(Call).where(Call.id == ctx.call_record_id))
    call = result.scalar_one_or_none()

    if call:
        call.outcome = outcome
        call.disposition_notes = notes
        call.next_action = next_action
        call.follow_up_date = follow_up_date

    # If DNC, flag the lead
    if outcome == "do_not_call":
        lead_id = await redis.hget(f"call:{ctx.call_sid}", "lead_id")
        if lead_id:
            lead_result = await db.execute(select(Lead).where(Lead.id == lead_id))
            lead = lead_result.scalar_one_or_none()
            if lead:
                lead.do_not_call = True
                lead.do_not_call_reason = notes or "Requested during call"

    await db.commit()

    # Cache outcome in Redis for fast retrieval
    await redis.hset(f"call:{ctx.call_sid}", "outcome", outcome)

    return f"Outcome logged: {outcome}"
