"""
HTTP endpoints for ElevenLabs → Voxara server-side tool callbacks.

In the native Twilio integration flow ElevenLabs calls these URLs when the
conversational agent wants to execute a tool. The bridge is gone — EL is the
bridge and we are purely the tool executor.

Request (from ElevenLabs):
    POST /api/v1/el/tools/{tool_name}
    X-Voxara-Secret: <agent.signing_secret>
    X-Agent-Id:      <agent.id>
    {
        "tool_call_id":   "xxx",
        "tool_name":      "save_lead",
        "parameters":     { ... },
        "conversation_id":"conv_..."
    }

Response (to ElevenLabs):
    { "result": "...", "is_error": false }
"""
import json
import structlog
from fastapi import APIRouter, Header, HTTPException, Request
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.db.redis import get_redis_pool
from app.models.agent import Agent
from app.tools.registry import get_tool
from app.tools.schemas import CallContext

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/el/tools", tags=["el-tools"])


async def _build_context(conversation_id: str, redis) -> CallContext | None:
    """Resolve EL conversation_id → call_record_id → full CallContext from Redis."""
    call_record_id = await redis.get(f"conv:{conversation_id}")
    if not call_record_id:
        log.warning("el_tool_context_miss", conversation_id=conversation_id)
        return None

    raw = await redis.hgetall(f"call:{call_record_id}")
    if not raw:
        log.warning("el_tool_context_empty", call_record_id=call_record_id)
        return None

    return CallContext(
        call_record_id=call_record_id,
        call_sid=raw.get("call_sid", ""),
        agent_id=raw.get("agent_id", ""),
        user_id=raw.get("user_id", ""),
        agent_config=json.loads(raw.get("agent_config", "{}")),
        enabled_tools=json.loads(raw.get("enabled_tools", "[]")),
        tool_configs=json.loads(raw.get("tool_configs", "{}")),
        lead_data=json.loads(raw.get("lead_data", "{}")),
        direction=raw.get("direction", "outbound"),
    )


async def _verify_agent_secret(agent_id: str, secret: str) -> bool:
    """Validate X-Voxara-Secret against the agent's stored signing_secret."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Agent).where(Agent.id == agent_id))
        agent = result.scalar_one_or_none()
        if not agent:
            return False
        return agent.signing_secret == secret


@router.post("/{tool_name}")
async def execute_el_tool(
    tool_name: str,
    request: Request,
    x_voxara_secret: str = Header(..., alias="X-Voxara-Secret"),
    x_agent_id: str = Header(..., alias="X-Agent-Id"),
):
    """Receive a tool call from ElevenLabs, execute it, and return the result."""
    # 1. Parse request body
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    conversation_id = body.get("conversation_id", "")
    tool_call_id    = body.get("tool_call_id", "")
    parameters      = body.get("parameters", {})

    log.info("el_tool_received",
             tool=tool_name,
             agent_id=x_agent_id,
             conv_id=conversation_id,
             tool_call_id=tool_call_id)

    # 2. Verify agent signing secret
    if not await _verify_agent_secret(x_agent_id, x_voxara_secret):
        log.warning("el_tool_auth_failed", tool=tool_name, agent_id=x_agent_id)
        raise HTTPException(status_code=403, detail="Invalid agent secret")

    # 3. Resolve tool
    tool = get_tool(tool_name)
    if not tool:
        log.warning("el_tool_not_found", tool=tool_name)
        return {"result": f"Tool '{tool_name}' is not registered", "is_error": True}

    # 4. Build call context from Redis via conversation_id
    redis = await get_redis_pool()
    ctx = await _build_context(conversation_id, redis)
    if not ctx:
        log.error("el_tool_no_context", tool=tool_name, conv_id=conversation_id)
        return {"result": "Call context not found — conversation may have already ended", "is_error": True}

    # 5. Execute tool
    async with AsyncSessionLocal() as db:
        try:
            result = await tool["handler"](parameters, ctx, db, redis)
            log.info("el_tool_success", tool=tool_name, conv_id=conversation_id)
            return {"result": str(result), "is_error": False}
        except Exception as exc:
            log.error("el_tool_error",
                      tool=tool_name, conv_id=conversation_id, error=str(exc))
            return {"result": f"Tool execution failed: {exc}", "is_error": True}
