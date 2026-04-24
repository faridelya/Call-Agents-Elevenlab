from app.tools.registry import register_tool
from app.tools.schemas import CallContext
import json

PARAMS = {
    "type": "object",
    "properties": {
        "section": {
            "type": "string",
            "enum": ["opener", "discovery", "pitch", "objection_handling", "closing", "faq"],
            "description": "Which part of the sales script to retrieve",
        },
    },
    "required": ["section"],
}


@register_tool(
    name="get_call_script",
    tier=1,
    execution="client",
    description="Retrieve a specific section of your sales script or playbook to guide the conversation.",
    parameters=PARAMS,
)
async def handler(params: dict, ctx: CallContext, db, redis) -> str:
    section = params.get("section", "opener")
    call_script = ctx.agent_config.get("call_script", {})
    content = call_script.get(section, "")
    if not content:
        return f"No script configured for section: {section}"
    return content
