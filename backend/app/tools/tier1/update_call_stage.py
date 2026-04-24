from datetime import datetime, timezone
from app.tools.registry import register_tool
from app.tools.schemas import CallContext
import json

PARAMS = {
    "type": "object",
    "properties": {
        "stage": {
            "type": "string",
            "enum": ["intro", "discovery", "pitch", "objection", "closing", "follow_up"],
            "description": "Current stage of the sales conversation",
        },
        "duration_seconds": {"type": "integer", "description": "How many seconds were spent in the previous stage"},
    },
    "required": ["stage"],
}


@register_tool(
    name="update_call_stage",
    tier=1,
    execution="client",
    description="Track the current stage of the sales conversation for analytics and reporting.",
    parameters=PARAMS,
)
async def handler(params: dict, ctx: CallContext, db, redis) -> str:
    stage = params["stage"]
    duration = params.get("duration_seconds", 0)
    entry = json.dumps({
        "stage": stage,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "duration_seconds": duration,
    })
    await redis.rpush(f"call:{ctx.call_sid}:stages", entry)
    return f"Stage updated: {stage}"
