"""MCP Server management — register ElevenLabs MCP servers and attach them to agents."""
from datetime import datetime, timezone
from typing import Optional

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.base import new_uuid
from app.models.mcp_server import McpServer
from app.models.user import User

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/mcp-servers", tags=["mcp-servers"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class McpServerCreate(BaseModel):
    name: str
    description: Optional[str] = None
    url: str
    transport: str = "sse"          # "sse" | "http"
    secret_token: Optional[str] = None  # forwarded to EL for auth


class McpServerResponse(BaseModel):
    id: str
    user_id: str
    name: str
    description: Optional[str]
    url: str
    transport: str
    el_mcp_server_id: Optional[str]
    config: Optional[dict]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── EL helper ─────────────────────────────────────────────────────────────────

_EL_HEADERS = lambda: {  # noqa: E731
    "xi-api-key": settings.elevenlabs_api_key,
    "Content-Type": "application/json",
}


async def _register_with_el(data: McpServerCreate) -> Optional[str]:
    """Register the MCP server with ElevenLabs and return el_mcp_server_id."""
    payload: dict = {
        "config": {
            "url": data.url,
            "name": data.name,
            "description": data.description or "",
            "transport": data.transport.upper(),  # EL expects "SSE" or "HTTP"
        }
    }
    if data.secret_token:
        payload["config"]["secret_token"] = data.secret_token

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                f"{settings.elevenlabs_base_url}/convai/mcp-servers",
                json=payload,
                headers=_EL_HEADERS(),
            )
        if r.status_code in (200, 201):
            body = r.json()
            el_id = body.get("mcp_server_id") or body.get("id")
            log.info("el_mcp_server_registered", name=data.name, el_id=el_id)
            return el_id
        log.warning(
            "el_mcp_server_register_failed",
            name=data.name,
            status=r.status_code,
            body=r.text[:300],
        )
    except Exception as exc:
        log.error("el_mcp_server_register_error", name=data.name, error=str(exc))
    return None


async def _delete_from_el(el_mcp_server_id: str) -> None:
    """Best-effort delete of an MCP server from ElevenLabs."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.delete(
                f"{settings.elevenlabs_base_url}/convai/mcp-servers/{el_mcp_server_id}",
                headers=_EL_HEADERS(),
            )
        if r.status_code not in (200, 204, 404):
            log.warning(
                "el_mcp_server_delete_failed",
                el_id=el_mcp_server_id,
                status=r.status_code,
                body=r.text[:200],
            )
    except Exception as exc:
        log.error("el_mcp_server_delete_error", el_id=el_mcp_server_id, error=str(exc))


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/", response_model=McpServerResponse, status_code=status.HTTP_201_CREATED)
async def create_mcp_server(
    body: McpServerCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Register a new MCP server with ElevenLabs and save it to the database."""
    el_id = await _register_with_el(body)

    server = McpServer(
        id=new_uuid(),
        user_id=current_user.id,
        name=body.name,
        description=body.description,
        url=body.url,
        transport=body.transport.lower(),
        el_mcp_server_id=el_id,
        config={"secret_token_set": bool(body.secret_token)} if body.secret_token else None,
    )
    db.add(server)
    await db.commit()
    await db.refresh(server)
    log.info("mcp_server_created", server_id=server.id, el_id=el_id, name=body.name)
    return server


@router.get("/", response_model=list[McpServerResponse])
async def list_mcp_servers(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all MCP servers belonging to the current user."""
    result = await db.execute(
        select(McpServer)
        .where(McpServer.user_id == current_user.id)
        .order_by(McpServer.created_at.desc())
    )
    return result.scalars().all()


@router.delete("/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_mcp_server(
    server_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete an MCP server from the database, and from ElevenLabs if registered."""
    result = await db.execute(
        select(McpServer).where(
            McpServer.id == server_id,
            McpServer.user_id == current_user.id,
        )
    )
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MCP server not found")

    if server.el_mcp_server_id:
        await _delete_from_el(server.el_mcp_server_id)

    await db.delete(server)
    await db.commit()
    log.info("mcp_server_deleted", server_id=server_id)
