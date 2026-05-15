from app.tools.registry import register_tool
from app.tools.schemas import CallContext

PARAMS = {
    "type": "object",
    "properties": {
        "voicemail_template": {"type": "string", "description": "Custom voicemail message (uses configured default if omitted)"},
    },
}

# Template variables supported in the voicemail message
_TEMPLATE_VARS = {
    "company_name": lambda ctx: ctx.agent_config.get("company_name", "our team"),
    "agent_name":   lambda ctx: ctx.agent_config.get("agent_name", ""),
    "lead_first_name": lambda ctx: ctx.lead_data.get("first_name", ""),
    "lead_last_name":  lambda ctx: ctx.lead_data.get("last_name", ""),
    "lead_name":       lambda ctx: " ".join(filter(None, [ctx.lead_data.get("first_name"), ctx.lead_data.get("last_name")])),
    "product_name":    lambda ctx: ctx.agent_config.get("product_name", ""),
}


def _render_template(text: str, ctx: CallContext) -> str:
    """Replace {{variable}} placeholders with live call context values."""
    for var, resolver in _TEMPLATE_VARS.items():
        placeholder = f"{{{{{var}}}}}"
        if placeholder in text:
            text = text.replace(placeholder, resolver(ctx) or "")
    return text


@register_tool(
    name="leave_voicemail",
    tier=2,
    execution="server",
    description=(
        "Leave a voicemail message when the contact does not answer. "
        "Call this tool and then say the exact message returned by the tool verbatim, "
        "as if you are leaving a voicemail. Then immediately call end_call."
    ),
    parameters=PARAMS,
)
async def handler(params: dict, ctx: CallContext, db, redis) -> str:
    tool_config = ctx.tool_configs.get("leave_voicemail", {})
    raw_message = params.get("voicemail_template") or tool_config.get("default_message", "")

    if not raw_message:
        raw_message = (
            "Hi, this is {{company_name}}. "
            "Sorry we missed you — we'll try again soon!"
        )

    # Substitute {{variable}} placeholders from agent/lead context
    message = _render_template(raw_message, ctx)

    # Flag in Redis so post-call processing knows a voicemail was left
    mapping = {
        "voicemail_requested": "1",
        "voicemail_message": message,
    }
    await redis.hset(f"call:{ctx.call_record_id}", mapping=mapping)
    if ctx.call_sid and ctx.call_sid != ctx.call_record_id:
        await redis.hset(f"call:{ctx.call_sid}", mapping=mapping)

    # Return the message text so EL reads it aloud as the voicemail
    return message
