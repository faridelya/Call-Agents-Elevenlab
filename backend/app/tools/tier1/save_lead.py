from datetime import datetime, timezone
from sqlalchemy import select
from app.tools.registry import register_tool
from app.tools.schemas import CallContext
from app.models.lead import Lead
from app.models.base import new_uuid

PARAMS = {
    "type": "object",
    "properties": {
        "first_name": {"type": "string", "description": "Contact's first name"},
        "last_name": {"type": "string", "description": "Contact's last name"},
        "email": {"type": "string", "description": "Contact's email address"},
        "phone": {"type": "string", "description": "Contact's phone number in E.164 format"},
        "company": {"type": "string", "description": "Company or organization name"},
        "title": {"type": "string", "description": "Job title or role"},
        "notes": {"type": "string", "description": "Any relevant notes about the contact"},
        "custom_fields": {"type": "object", "description": "Additional custom key-value fields"},
    },
}


@register_tool(
    name="save_lead",
    tier=1,
    execution="client",
    description="Save or update the contact information for the person you're speaking with. Call this whenever you learn new details about them.",
    parameters=PARAMS,
)
async def handler(params: dict, ctx: CallContext, db, redis) -> str:
    phone = params.get("phone") or ctx.lead_data.get("phone") or ""
    if not phone:
        return "No phone number available to save lead"

    now = datetime.now(timezone.utc).isoformat()

    result = await db.execute(
        select(Lead).where(Lead.user_id == ctx.user_id, Lead.phone == phone)
    )
    lead = result.scalar_one_or_none()

    if lead:
        if params.get("first_name"):
            lead.first_name = params["first_name"]
        if params.get("last_name"):
            lead.last_name = params["last_name"]
        if params.get("email"):
            lead.email = params["email"]
        if params.get("company"):
            lead.company = params["company"]
        if params.get("title"):
            lead.title = params["title"]
        if params.get("notes"):
            lead.notes = params["notes"]
        if params.get("custom_fields"):
            lead.custom_fields = {**lead.custom_fields, **params["custom_fields"]}
        lead.last_agent_id = ctx.agent_id
    else:
        lead = Lead(
            id=new_uuid(),
            user_id=ctx.user_id,
            phone=phone,
            first_name=params.get("first_name"),
            last_name=params.get("last_name"),
            email=params.get("email"),
            company=params.get("company"),
            title=params.get("title"),
            notes=params.get("notes"),
            custom_fields=params.get("custom_fields", {}),
            last_agent_id=ctx.agent_id,
            last_called_at=now,
        )
        db.add(lead)

    await db.commit()
    await db.refresh(lead)

    # Update Redis call context with lead_id
    await redis.hset(f"call:{ctx.call_sid}", "lead_id", lead.id)

    name = " ".join(filter(None, [lead.first_name, lead.last_name])) or phone
    return f"Lead saved: {name}"
