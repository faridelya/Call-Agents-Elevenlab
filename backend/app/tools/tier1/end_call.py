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


import structlog as _log
_logger = _log.get_logger(__name__)

@register_tool(
    name="end_call",
    tier=1,
    execution="server",
    description="End the call. IMPORTANT: Before calling this tool, always say a proper closing line to the contact and give them a chance to respond or ask anything else. Only call end_call after you have verbally said goodbye and the contact has acknowledged or there is a clear natural end to the conversation. Never cut the call abruptly mid-sentence or without a warm closing.",
    parameters=PARAMS,
)
async def handler(params: dict, ctx: CallContext, db, redis) -> str:
    reason = params.get("reason", "completed")
    summary = params.get("summary", "")

    # Load call from DB to get the definitive Twilio SID
    result = await db.execute(select(Call).where(Call.id == ctx.call_record_id))
    call = result.scalar_one_or_none()

    if call:
        call.disposition_notes = summary
        call.outcome = reason
        await db.flush()

    # Resolve Twilio SID — prefer DB value over Redis context (most reliable)
    twilio_sid = (call.twilio_call_sid if call else None) or ctx.call_sid
    user_id = (call.user_id if call else None) or ctx.user_id

    if twilio_sid and user_id:
        try:
            user_result = await db.execute(select(UserModel).where(UserModel.id == user_id))
            user = user_result.scalar_one_or_none()
            twilio = get_twilio_service(user)
            await twilio.end_call(twilio_sid)
            _logger.info("end_call_ok", call_id=ctx.call_record_id, sid=twilio_sid, reason=reason)
        except Exception as exc:
            _logger.error("end_call_twilio_failed", call_id=ctx.call_record_id, sid=twilio_sid, error=str(exc))
    else:
        _logger.warning("end_call_no_sid", call_id=ctx.call_record_id)

    await db.commit()
    return f"Call ended: {reason}"
