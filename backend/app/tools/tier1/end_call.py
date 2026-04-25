from datetime import datetime, timezone
from sqlalchemy import select
from app.tools.registry import register_tool
from app.tools.schemas import CallContext
from app.models.call import Call
from app.models.user import User as UserModel
from app.services.twilio_service import get_twilio_service

PARAMS = {
    "type": "object",
    "properties": {
        "reason": {
            "type": "string",
            "enum": ["goal_achieved", "not_interested", "voicemail", "callback_requested", "no_answer", "completed"],
            "description": "Why the call is ending",
        },
        "summary": {"type": "string", "description": "Brief summary of the conversation"},
    },
    "required": ["reason"],
}


@register_tool(
    name="end_call",
    tier=1,
    execution="client",
    description="End the call. IMPORTANT: Before calling this tool, always say a proper closing line to the contact and give them a chance to respond or ask anything else. Only call end_call after you have verbally said goodbye and the contact has acknowledged or there is a clear natural end to the conversation. Never cut the call abruptly mid-sentence or without a warm closing.",
    parameters=PARAMS,
)
async def handler(params: dict, ctx: CallContext, db, redis) -> str:
    reason = params.get("reason", "completed")
    summary = params.get("summary", "")

    # Update call record
    result = await db.execute(select(Call).where(Call.id == ctx.call_record_id))
    call = result.scalar_one_or_none()
    if call:
        call.disposition_notes = summary
        await db.commit()

    # Store end signal in Redis for bridge to pick up
    await redis.hset(f"call:{ctx.call_sid}", mapping={"end_requested": "1", "end_reason": reason})

    # End the Twilio call via REST API using the user's Twilio credentials
    if ctx.call_sid and ctx.user_id:
        try:
            user_result = await db.execute(select(UserModel).where(UserModel.id == ctx.user_id))
            user = user_result.scalar_one_or_none()
            twilio = get_twilio_service(user)
            await twilio.end_call(ctx.call_sid)
        except Exception:
            pass

    return f"Call ended: {reason}"
