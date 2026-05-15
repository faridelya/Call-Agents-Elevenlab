from app.tools.registry import register_tool
from app.tools.schemas import CallContext

DEFAULT_SECTIONS = ["opener", "discovery", "pitch", "objection_handling", "closing", "faq"]

PARAMS = {
    "type": "object",
    "properties": {
        "section": {
            "type": "string",
            "enum": DEFAULT_SECTIONS,
            "description": "Which section of the product/service details or playbook to retrieve",
        },
    },
    "required": ["section"],
}


@register_tool(
    name="get_call_script",
    tier=1,
    execution="server",
    description="Retrieve a specific section of your product details, service information, or playbook to guide the conversation.",
    parameters=PARAMS,
)
async def handler(params: dict, ctx: CallContext, db, redis) -> str:
    section = params.get("section", "opener")
    call_script = ctx.agent_config.get("call_script", {})
    content = call_script.get(section, "")
    if not content:
        return f"No content configured for section: {section}"
    return content
