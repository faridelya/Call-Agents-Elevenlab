from sqlalchemy import select
from app.tools.registry import register_tool
from app.tools.schemas import CallContext
from app.models.lead import Lead
from app.models.call import Call

PARAMS = {
    "type": "object",
    "properties": {
        "phone_number": {"type": "string", "description": "Phone number to look up (defaults to caller's number)"},
        "email": {"type": "string", "description": "Email address to look up if phone is not available"},
    },
}


@register_tool(
    name="get_contact_info",
    tier=1,
    execution="client",
    description="Look up existing information about the contact you're speaking with, including their history and previous interactions.",
    parameters=PARAMS,
)
async def handler(params: dict, ctx: CallContext, db, redis) -> str:
    phone = params.get("phone_number") or ctx.lead_data.get("phone") or ""

    filters = [Lead.user_id == ctx.user_id]
    if phone:
        filters.append(Lead.phone == phone)
    elif params.get("email"):
        filters.append(Lead.email == params["email"])
    else:
        return "No identifier provided"

    result = await db.execute(select(Lead).where(*filters))
    lead = result.scalar_one_or_none()

    if not lead:
        return "No existing contact record found"

    # Get recent call count
    calls_result = await db.execute(
        select(Call).where(Call.lead_id == lead.id).order_by(Call.created_at.desc()).limit(3)
    )
    recent_calls = calls_result.scalars().all()

    name = " ".join(filter(None, [lead.first_name, lead.last_name])) or "Unknown"
    parts = [f"Contact: {name}"]
    if lead.company:
        parts.append(f"Company: {lead.company}")
    if lead.title:
        parts.append(f"Title: {lead.title}")
    if lead.email:
        parts.append(f"Email: {lead.email}")
    parts.append(f"Status: {lead.lead_status}")
    if lead.qualification_score is not None:
        parts.append(f"Score: {lead.qualification_score}/100")
    if lead.do_not_call:
        parts.append("DNC: Yes")
    parts.append(f"Total calls: {lead.total_calls}")
    if recent_calls:
        outcomes = [c.outcome for c in recent_calls if c.outcome]
        if outcomes:
            parts.append(f"Recent outcomes: {', '.join(outcomes)}")
    if lead.notes:
        parts.append(f"Notes: {lead.notes}")

    return " | ".join(parts)
