from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_agent_or_404, get_tool_or_404
from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.agent import Agent
from app.models.base import new_uuid
from app.models.tool import Tool
from app.models.user import User
from app.schemas.common import MessageResponse, PaginatedResponse
from app.schemas.tool import BuiltinToolInfo, ToolCreate, ToolResponse, ToolTestRequest, ToolUpdate
from app.tools.registry import list_tools

router = APIRouter(prefix="/tools", tags=["tools"])


@router.get("/catalog", response_model=list[BuiltinToolInfo])
async def get_tool_catalog(current_user: User = Depends(get_current_user)):
    """Return all built-in tools (Tier 1 + Tier 2) with their names, descriptions, and parameter schemas."""
    return [
        BuiltinToolInfo(
            name=t["name"],
            tier=t["tier"],
            execution=t["execution"],
            description=t["description"],
            parameters=t["parameters"],
        )
        for t in list_tools()
    ]


@router.get("/custom", response_model=PaginatedResponse[ToolResponse])
async def list_custom_tools(
    agent_id: str | None = None,
    page: int = 1,
    page_size: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List the user's custom (Tier 3) webhook tools, optionally scoped to a specific agent."""
    filters = [Tool.user_id == current_user.id]
    if agent_id:
        filters.append(Tool.agent_id == agent_id)

    offset = (page - 1) * page_size
    total = (await db.execute(select(func.count()).select_from(Tool).where(*filters))).scalar()
    result = await db.execute(
        select(Tool).where(*filters).order_by(Tool.created_at.desc()).offset(offset).limit(page_size)
    )
    return PaginatedResponse(items=result.scalars().all(), total=total, page=page, page_size=page_size, pages=(total + page_size - 1) // page_size)


@router.post("/custom", response_model=ToolResponse, status_code=status.HTTP_201_CREATED)
async def create_custom_tool(
    body: ToolCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a custom webhook tool attached to an agent. The tool URL is called by ElevenLabs during live calls."""
    await get_agent_or_404(body.agent_id, current_user.id, db)
    tool = Tool(id=new_uuid(), user_id=current_user.id, **body.model_dump())
    db.add(tool)
    await db.commit()
    await db.refresh(tool)
    return tool


@router.get("/custom/{tool_id}", response_model=ToolResponse)
async def get_custom_tool(
    tool_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve a single custom tool by ID."""
    return await get_tool_or_404(tool_id, current_user.id, db)


@router.patch("/custom/{tool_id}", response_model=ToolResponse)
async def update_custom_tool(
    tool_id: str,
    body: ToolUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a custom tool's name, description, parameters, config, or active flag."""
    tool = await get_tool_or_404(tool_id, current_user.id, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(tool, field, value)
    await db.commit()
    await db.refresh(tool)
    return tool


@router.delete("/custom/{tool_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_custom_tool(
    tool_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete a custom tool. The next agent sync will remove it from ElevenLabs."""
    tool = await get_tool_or_404(tool_id, current_user.id, db)
    await db.delete(tool)
    await db.commit()


# ── Server tool endpoints (called by ElevenLabs during live calls) ────────────

def _verify_secret(x_voxara_secret: str, x_agent_id: str, db_agent: Agent):
    if x_voxara_secret != db_agent.signing_secret:
        raise HTTPException(status_code=401, detail="Invalid tool secret")


@router.post("/book_meeting")
async def tool_book_meeting(
    body: dict,
    x_voxara_secret: str = Header(...),
    x_agent_id: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """Server tool called by ElevenLabs to book a meeting. Validates the agent signing secret before executing.

    Requires X-Voxara-Secret and X-Agent-Id headers. Calendar integration is stubbed — Phase 5.
    """
    result = await db.execute(select(Agent).where(Agent.id == x_agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404)
    _verify_secret(x_voxara_secret, x_agent_id, agent)

    params = body.get("parameters", {})
    # TODO Phase 5: integrate Cal.com / Google Calendar
    contact = params.get("contact_name", "the contact")
    date = params.get("preferred_date", "a suitable time")
    return {"result": f"Meeting request recorded for {contact} on {date}. Calendar integration coming soon."}


@router.post("/send_followup_sms")
async def tool_send_followup_sms(
    body: dict,
    x_voxara_secret: str = Header(...),
    x_agent_id: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """Server tool called by ElevenLabs to send a follow-up SMS via Twilio.

    Uses the agent's configured message_template; falls back to a generic message.
    """
    result = await db.execute(select(Agent).where(Agent.id == x_agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404)
    _verify_secret(x_voxara_secret, x_agent_id, agent)

    params = body.get("parameters", {})
    from app.services.twilio_service import TwilioService
    from app.config import settings

    phone = params.get("phone_number", "")
    tool_cfg = (agent.tool_configs or {}).get("send_followup_sms", {})
    message = params.get("message_template") or tool_cfg.get("message_template", "Thank you for your time today!")
    if phone:
        twilio = TwilioService()
        await twilio.send_sms(to=phone, from_=settings.twilio_phone_number, body=message)
        return {"result": f"SMS sent to {phone}"}
    return {"result": "No phone number provided for SMS"}


@router.post("/lookup_product_info")
async def tool_product_info(
    body: dict,
    x_voxara_secret: str = Header(...),
    x_agent_id: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """Server tool: search the agent's product catalog using keyword matching and return the best matching item."""
    result = await db.execute(select(Agent).where(Agent.id == x_agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404)
    _verify_secret(x_voxara_secret, x_agent_id, agent)

    params = body.get("parameters", {})
    query = params.get("query", "").lower()
    catalog = agent.product_catalog or []

    if not catalog:
        return {"result": "No product catalog configured for this agent"}

    # Simple keyword search in catalog
    for item in catalog:
        if isinstance(item, dict):
            text = " ".join(str(v) for v in item.values()).lower()
            if query and any(word in text for word in query.split()):
                return {"result": str(item)}

    return {"result": f"Product info for '{query}': " + str(catalog[0]) if catalog else "No matching products found"}


@router.post("/qualify_lead")
async def tool_qualify_lead(
    body: dict,
    x_voxara_secret: str = Header(...),
    x_agent_id: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """Server tool: score a lead against the agent's qualification_criteria. Returns a 0–100 score and qualified/not verdict."""
    result = await db.execute(select(Agent).where(Agent.id == x_agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404)
    _verify_secret(x_voxara_secret, x_agent_id, agent)

    params = body.get("parameters", {})
    answers = params.get("answers", {})
    criteria = agent.qualification_criteria or {}

    # Simple scoring: count how many criteria are answered positively
    score = 0
    total = len(criteria) or 1
    for key, criterion in criteria.items():
        answer = answers.get(key, "")
        if answer and answer.lower() not in ("no", "false", "0", "none", ""):
            score += 1

    pct = int(score / total * 100)
    qualified = pct >= 60
    return {"result": f"Lead score: {pct}/100. {'Qualified' if qualified else 'Not yet qualified'}."}


@router.post("/custom/{tool_id}")
async def tool_custom_webhook(
    tool_id: str,
    body: dict,
    x_voxara_secret: str = Header(...),
    x_agent_id: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """Server tool proxy: validates agent secret, then forwards the call parameters to the user's configured webhook URL."""
    result = await db.execute(select(Agent).where(Agent.id == x_agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404)
    _verify_secret(x_voxara_secret, x_agent_id, agent)

    tool_result = await db.execute(select(Tool).where(Tool.id == tool_id, Tool.agent_id == x_agent_id))
    tool = tool_result.scalar_one_or_none()
    if not tool or not tool.is_active:
        raise HTTPException(status_code=404, detail="Tool not found")

    config = tool.config or {}
    url = config.get("url", "")
    if not url:
        return {"result": "Tool URL not configured"}

    import httpx
    headers = config.get("headers", {})
    method = config.get("method", "POST").upper()
    params = body.get("parameters", {})

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            if method == "GET":
                response = await client.get(url, params=params, headers=headers)
            else:
                response = await client.post(url, json=params, headers=headers)
        return {"result": response.text[:500]}
    except Exception as e:
        return {"result": f"Webhook error: {str(e)}", "is_error": True}


# ── CRM tool endpoints ────────────────────────────────────────────────────────

async def _get_agent_crm_creds(agent: "Agent") -> tuple[str, dict]:
    """Return (provider, credentials_dict) from agent tool_configs."""
    tool_configs = agent.tool_configs or {}
    # Check both possible config keys (check_crm_record is the canonical key)
    crm_cfg = tool_configs.get("check_crm_record") or tool_configs.get("update_crm_record") or {}
    provider = crm_cfg.get("provider", "")
    credentials = crm_cfg.get("credentials", {})
    return provider, credentials


@router.post("/check_crm_record")
async def tool_crm_lookup(
    body: dict,
    x_voxara_secret: str = Header(...),
    x_agent_id: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """Server tool: look up a contact in HubSpot or Salesforce by phone number. Returns the record as a string."""
    result = await db.execute(select(Agent).where(Agent.id == x_agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404)
    _verify_secret(x_voxara_secret, x_agent_id, agent)

    params = body.get("parameters", {})
    phone = params.get("phone_number", "")
    if not phone:
        return {"result": "No phone number provided"}

    provider, credentials = await _get_agent_crm_creds(agent)
    if not provider or not credentials:
        return {"result": "CRM not configured for this agent"}

    try:
        from app.services.crm_service import get_crm_service
        crm = get_crm_service(provider, credentials)
        contact = await crm.get_contact(phone)
        if contact:
            return {"result": str(contact)}
        return {"result": f"No CRM record found for {phone}"}
    except Exception as e:
        return {"result": f"CRM lookup error: {str(e)}", "is_error": True}


@router.post("/update_crm_record")
async def tool_crm_update(
    body: dict,
    x_voxara_secret: str = Header(...),
    x_agent_id: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """Server tool: update a CRM contact record by ID and optionally create a call note."""
    result = await db.execute(select(Agent).where(Agent.id == x_agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404)
    _verify_secret(x_voxara_secret, x_agent_id, agent)

    params = body.get("parameters", {})
    crm_id = params.get("crm_id", "")
    properties = params.get("properties", {})
    note = params.get("note", "")

    if not crm_id:
        return {"result": "crm_id is required"}

    provider, credentials = await _get_agent_crm_creds(agent)
    if not provider or not credentials:
        return {"result": "CRM not configured for this agent"}

    try:
        from app.services.crm_service import get_crm_service
        crm = get_crm_service(provider, credentials)
        if properties:
            await crm.update_contact(crm_id, properties)
        if note and hasattr(crm, "create_note"):
            await crm.create_note(crm_id, note)
        return {"result": f"CRM record {crm_id} updated"}
    except Exception as e:
        return {"result": f"CRM update error: {str(e)}", "is_error": True}


# ── KB query tool endpoint ────────────────────────────────────────────────────

@router.post("/kb_query/{agent_id_path}")
async def tool_kb_query(
    agent_id_path: str,
    body: dict,
    x_voxara_secret: str = Header(...),
    x_agent_id: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    """Server tool: run a semantic similarity search against the agent's knowledge base and return the top-3 chunks."""
    result = await db.execute(select(Agent).where(Agent.id == x_agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404)
    _verify_secret(x_voxara_secret, x_agent_id, agent)

    params = body.get("parameters", {})
    query = params.get("query", "")
    if not query:
        return {"result": "No query provided"}

    try:
        from app.services.embedding_service import query_knowledge_base
        results = await query_knowledge_base(agent_id_path, query, db, top_k=3)
        if results:
            combined = "\n\n".join(r["content"] for r in results)
            return {"result": combined[:1500]}
        return {"result": "No relevant content found in knowledge base"}
    except Exception as e:
        return {"result": f"KB query error: {str(e)}", "is_error": True}
