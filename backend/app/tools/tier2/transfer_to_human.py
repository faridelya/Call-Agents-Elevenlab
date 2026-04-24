import httpx
from app.tools.registry import register_tool
from app.tools.schemas import CallContext
from app.config import settings

PARAMS = {
    "type": "object",
    "properties": {
        "transfer_to": {"type": "string", "description": "Phone number to transfer to"},
        "transfer_type": {"type": "string", "enum": ["warm", "cold"], "description": "warm = brief the human agent before connecting; cold = immediate blind transfer"},
        "brief": {"type": "string", "description": "Context to give the human agent (warm transfer)"},
    },
    "required": ["transfer_to"],
}


@register_tool(
    name="transfer_to_human",
    tier=2,
    execution="client",
    description="Transfer this call to a human agent when the situation requires personal attention.",
    parameters=PARAMS,
)
async def handler(params: dict, ctx: CallContext, db, redis) -> str:
    transfer_to = params["transfer_to"]
    transfer_type = params.get("transfer_type", "cold")

    account_sid = settings.twilio_account_sid
    auth_token = settings.twilio_auth_token

    # Signal bridge to update TwiML to <Dial> the transfer number
    await redis.hset(f"call:{ctx.call_sid}", mapping={
        "transfer_requested": "1",
        "transfer_to": transfer_to,
        "transfer_type": transfer_type,
        "transfer_brief": params.get("brief", ""),
    })

    return f"Transferring call to {transfer_to} ({transfer_type} transfer)"
