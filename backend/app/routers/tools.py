import httpx
import structlog
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
from app.schemas.tool import (
    BuiltinToolInfo,
    KnowledgeBaseMeta,
    SystemToolMeta,
    ToolCreate,
    ToolResponse,
    ToolTestRequest,
    ToolUpdate,
)
from app.tools.registry import list_tools
from app.tools.system_catalog import EL_KNOWLEDGE_BASE_META, EL_SYSTEM_TOOLS

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/tools", tags=["tools"])


# ── Catalog endpoints ─────────────────────────────────────────────────────────

@router.get("/catalog", response_model=list[BuiltinToolInfo])
async def get_tool_catalog(current_user: User = Depends(get_current_user)):
    """Built-in Voxara tools (Tier 1 always-on + Tier 2 optional) with their schemas."""
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


@router.get("/system-catalog", response_model=list[SystemToolMeta])
async def get_system_tool_catalog(current_user: User = Depends(get_current_user)):
    """ElevenLabs native system tools (transfer_to_number, end_conversation, language_detection)."""
    return [
        SystemToolMeta(
            key=key,
            label=meta["label"],
            subtitle=meta["subtitle"],
            description=meta["description"],
            icon=meta["icon"],
            color=meta["color"],
            el_type=meta["el_type"],
            system_tool_type=meta["system_tool_type"],
            default_config=meta["default_config"],
            config_fields=meta["config_fields"],
        )
        for key, meta in EL_SYSTEM_TOOLS.items()
    ]


@router.get("/knowledge-base-meta", response_model=KnowledgeBaseMeta)
async def get_kb_meta(current_user: User = Depends(get_current_user)):
    """Metadata about the ElevenLabs Knowledge Base attachment option."""
    return KnowledgeBaseMeta(**EL_KNOWLEDGE_BASE_META)


# ── Custom tool CRUD ──────────────────────────────────────────────────────────

@router.get("/custom", response_model=PaginatedResponse[ToolResponse])
async def list_custom_tools(
    agent_id: str | None = None,
    page: int = 1,
    page_size: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List the user's custom tools, optionally scoped to a specific agent."""
    filters = [Tool.user_id == current_user.id]
    if agent_id:
        filters.append(Tool.agent_id == agent_id)

    offset = (page - 1) * page_size
    total = (await db.execute(select(func.count()).select_from(Tool).where(*filters))).scalar()
    result = await db.execute(
        select(Tool).where(*filters).order_by(Tool.created_at.desc()).offset(offset).limit(page_size)
    )
    return PaginatedResponse(
        items=result.scalars().all(),
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.post("/custom", response_model=ToolResponse, status_code=status.HTTP_201_CREATED)
async def create_custom_tool(
    body: ToolCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a webhook, client, or MCP tool attached to an agent."""
    await get_agent_or_404(body.agent_id, current_user.id, db)
    data = body.model_dump()
    tool = Tool(id=new_uuid(), user_id=current_user.id, **data)
    db.add(tool)
    await db.commit()
    await db.refresh(tool)
    log.info("custom_tool_created", tool_id=tool.id, el_type=tool.el_tool_type, name=tool.name)
    return tool


@router.get("/custom/{tool_id}", response_model=ToolResponse)
async def get_custom_tool(
    tool_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_tool_or_404(tool_id, current_user.id, db)


@router.patch("/custom/{tool_id}", response_model=ToolResponse)
async def update_custom_tool(
    tool_id: str,
    body: ToolUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
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
    """Delete a custom tool. The next agent sync removes it from ElevenLabs."""
    tool = await get_tool_or_404(tool_id, current_user.id, db)
    await db.delete(tool)
    await db.commit()


# ── Server tool endpoints (called by ElevenLabs during live calls) ────────────

def _verify_secret(x_voxara_secret: str, x_agent_id: str, db_agent: Agent):
    if x_voxara_secret != db_agent.signing_secret:
        raise HTTPException(status_code=401, detail="Invalid tool secret")


async def _load_agent(agent_id: str, secret: str, db: AsyncSession) -> Agent:
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404)
    _verify_secret(secret, agent_id, agent)
    return agent


@router.post("/book_meeting")
async def tool_book_meeting(
    body: dict,
    x_voxara_secret: str = Header(...),
    x_agent_id: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    agent = await _load_agent(x_agent_id, x_voxara_secret, db)
    params = body.get("parameters", {})
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
    agent = await _load_agent(x_agent_id, x_voxara_secret, db)
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
    agent = await _load_agent(x_agent_id, x_voxara_secret, db)
    params = body.get("parameters", {})
    query = params.get("query", "").lower()
    catalog = agent.product_catalog or []
    if not catalog:
        return {"result": "No product catalog configured for this agent"}
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
    agent = await _load_agent(x_agent_id, x_voxara_secret, db)
    params = body.get("parameters", {})
    answers = params.get("answers", {})
    criteria = agent.qualification_criteria or {}
    score = sum(
        1 for key in criteria
        if (answers.get(key, "") or "").lower() not in ("no", "false", "0", "none", "")
    )
    total = len(criteria) or 1
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
    """Proxy tool call to the user's configured webhook URL or handle client tool no-op."""
    agent = await _load_agent(x_agent_id, x_voxara_secret, db)

    tool_result = await db.execute(
        select(Tool).where(Tool.id == tool_id, Tool.agent_id == x_agent_id, Tool.is_active == True)
    )
    tool = tool_result.scalar_one_or_none()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found or inactive")

    if tool.el_tool_type == "client":
        # Client tools execute in the caller's browser/SDK — no server proxy needed.
        # For our Twilio-native integration, simply acknowledge.
        return {"result": "Client tool acknowledged", "is_error": False}

    if tool.el_tool_type == "mcp":
        return await _execute_mcp_tool(tool, body)

    # webhook (default)
    return await _execute_webhook_tool(tool, body)


async def _execute_webhook_tool(tool: Tool, body: dict) -> dict:
    config = tool.config or {}
    url = config.get("url", "")
    if not url:
        return {"result": "Webhook URL not configured", "is_error": True}

    method = config.get("method", "POST").upper()
    params = body.get("parameters", {})
    timeout = tool.response_timeout_secs or 20

    # Build headers: static headers from config + any auth header
    headers: dict[str, str] = {}
    for h in config.get("headers", []):
        if h.get("key") and h.get("value"):
            headers[h["key"]] = h["value"]

    auth = config.get("auth", {})
    auth_type = auth.get("type", "none")
    if auth_type == "bearer" and auth.get("token"):
        headers["Authorization"] = f"Bearer {auth['token']}"
    elif auth_type == "api_key" and auth.get("header") and auth.get("token"):
        headers[auth["header"]] = auth["token"]
    elif auth_type == "basic" and auth.get("username") and auth.get("password"):
        import base64
        creds = base64.b64encode(f"{auth['username']}:{auth['password']}".encode()).decode()
        headers["Authorization"] = f"Basic {creds}"

    # Build response assignments mapping: value_path → dynamic_variable
    assignments = config.get("assignments", [])

    try:
        async with httpx.AsyncClient(timeout=float(timeout)) as client:
            if method == "GET":
                response = await client.get(url, params=params, headers=headers)
            elif method == "DELETE":
                response = await client.delete(url, headers=headers)
            elif method == "PUT":
                response = await client.put(url, json=params, headers=headers)
            elif method == "PATCH":
                response = await client.patch(url, json=params, headers=headers)
            else:
                response = await client.post(url, json=params, headers=headers)

        result_text = response.text[:1000]
        log.info("custom_webhook_executed", tool_id=tool.id, status=response.status_code)
        return {"result": result_text, "is_error": response.status_code >= 400}
    except httpx.TimeoutException:
        log.warning("custom_webhook_timeout", tool_id=tool.id, url=url)
        return {"result": f"Webhook timed out after {timeout}s", "is_error": True}
    except Exception as exc:
        log.error("custom_webhook_error", tool_id=tool.id, error=str(exc))
        return {"result": f"Webhook error: {exc}", "is_error": True}


async def _execute_mcp_tool(tool: Tool, body: dict) -> dict:
    """Scaffold for MCP tool execution — proxies to the configured MCP server."""
    config = tool.config or {}
    server_url = config.get("server_url", "")
    if not server_url:
        return {"result": "MCP server URL not configured", "is_error": True}

    headers: dict[str, str] = {"Content-Type": "application/json"}
    if config.get("auth_token"):
        headers["Authorization"] = f"Bearer {config['auth_token']}"

    params = body.get("parameters", {})
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(server_url, json={"tool": tool.name, "parameters": params}, headers=headers)
        return {"result": r.text[:1000], "is_error": r.status_code >= 400}
    except Exception as exc:
        return {"result": f"MCP error: {exc}", "is_error": True}


# ── CRM tool endpoints ────────────────────────────────────────────────────────

async def _get_agent_crm_creds(agent: Agent) -> tuple[str, dict]:
    tool_configs = agent.tool_configs or {}
    crm_cfg = tool_configs.get("check_crm_record") or tool_configs.get("update_crm_record") or {}
    return crm_cfg.get("provider", ""), crm_cfg.get("credentials", {})


@router.post("/check_crm_record")
async def tool_crm_lookup(
    body: dict,
    x_voxara_secret: str = Header(...),
    x_agent_id: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    agent = await _load_agent(x_agent_id, x_voxara_secret, db)
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
        return {"result": str(contact) if contact else f"No CRM record found for {phone}"}
    except Exception as exc:
        return {"result": f"CRM lookup error: {exc}", "is_error": True}


@router.post("/update_crm_record")
async def tool_crm_update(
    body: dict,
    x_voxara_secret: str = Header(...),
    x_agent_id: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    agent = await _load_agent(x_agent_id, x_voxara_secret, db)
    params = body.get("parameters", {})
    crm_id = params.get("crm_id", "")
    if not crm_id:
        return {"result": "crm_id is required"}
    provider, credentials = await _get_agent_crm_creds(agent)
    if not provider or not credentials:
        return {"result": "CRM not configured for this agent"}
    try:
        from app.services.crm_service import get_crm_service
        crm = get_crm_service(provider, credentials)
        properties = params.get("properties", {})
        note = params.get("note", "")
        if properties:
            await crm.update_contact(crm_id, properties)
        if note and hasattr(crm, "create_note"):
            await crm.create_note(crm_id, note)
        return {"result": f"CRM record {crm_id} updated"}
    except Exception as exc:
        return {"result": f"CRM update error: {exc}", "is_error": True}


# ── KB query tool endpoint ────────────────────────────────────────────────────

@router.post("/kb_query/{agent_id_path}")
async def tool_kb_query(
    agent_id_path: str,
    body: dict,
    x_voxara_secret: str = Header(...),
    x_agent_id: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    agent = await _load_agent(x_agent_id, x_voxara_secret, db)
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
    except Exception as exc:
        return {"result": f"KB query error: {exc}", "is_error": True}
