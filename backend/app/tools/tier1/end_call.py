import httpx
from datetime import datetime, timezone
from sqlalchemy import select
from app.tools.registry import register_tool
from app.tools.schemas import CallContext
from app.models.call import Call
from app.config import settings

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
    description="End the call gracefully when the conversation goal has been achieved or the contact wants to hang up.",
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

    # End the Twilio call via REST API
    account_sid = settings.twilio_account_sid
    auth_token = settings.twilio_auth_token

    if ctx.call_sid and account_sid:
        try:
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Calls/{ctx.call_sid}.json",
                    data={"Status": "completed"},
                    auth=(account_sid, auth_token),
                    timeout=5.0,
                )
        except Exception:
            pass

    return f"Call ended: {reason}"
