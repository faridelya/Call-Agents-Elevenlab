from app.tools.registry import register_tool
from app.tools.schemas import CallContext

PARAMS = {
    "type": "object",
    "properties": {
        "voicemail_template": {"type": "string", "description": "Custom voicemail message (uses configured default if omitted)"},
    },
}


@register_tool(
    name="leave_voicemail",
    tier=2,
    execution="client",
    description="Leave a voicemail message when the contact does not answer, then end the call.",
    parameters=PARAMS,
)
async def handler(params: dict, ctx: CallContext, db, redis) -> str:
    # Get voicemail text from config or params
    tool_config = ctx.tool_configs.get("leave_voicemail", {})
    message = params.get("voicemail_template") or tool_config.get("default_message", "")

    if not message:
        message = (
            f"Hi, this is an automated message from {ctx.agent_config.get('company_name', 'our team')}. "
            "Please call us back at your earliest convenience. Thank you."
        )

    # Signal bridge to play voicemail then end
    await redis.hset(f"call:{ctx.call_sid}", mapping={
        "voicemail_requested": "1",
        "voicemail_message": message,
    })

    return f"Voicemail queued: {message[:60]}..."
