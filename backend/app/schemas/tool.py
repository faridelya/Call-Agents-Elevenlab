from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# ── Custom tool CRUD schemas ──────────────────────────────────────────────────

class ToolCreate(BaseModel):
    agent_id: str
    # Legacy category kept for compatibility
    tool_type: str = "custom_webhook"
    # How EL sees this tool: webhook | client | mcp
    el_tool_type: str = Field(default="webhook", pattern="^(webhook|client|mcp)$")
    name: str
    description: str
    # For webhook tools: JSON Schema describing the request body sent to EL
    parameters_schema: dict = Field(default_factory=dict)
    # For client tools: list of EL-format parameter definitions
    tool_parameters: list[dict] = Field(default_factory=list)
    # Webhook / runtime config:
    #   webhook → {url, method, headers: [{key,value}], auth: {type,token}, timeout}
    #   client  → {expects_response, response_timeout_secs, response_mocks: [...]}
    #   mcp     → {server_url, auth_type, auth_token}
    config: dict = Field(default_factory=dict)
    # EL tool behavior options
    disable_interruptions: bool = False
    execution_mode: str = "immediate"
    pre_tool_speech: str = "auto"
    expects_response: bool = False       # client tools only
    response_timeout_secs: int = 20


class ToolUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    el_tool_type: str | None = None
    parameters_schema: dict | None = None
    tool_parameters: list[dict] | None = None
    config: dict | None = None
    disable_interruptions: bool | None = None
    execution_mode: str | None = None
    pre_tool_speech: str | None = None
    expects_response: bool | None = None
    response_timeout_secs: int | None = None
    is_active: bool | None = None


class ToolResponse(BaseModel):
    id: str
    agent_id: str
    tool_type: str
    el_tool_type: str
    name: str
    description: str
    parameters_schema: dict
    tool_parameters: list[dict]
    config: dict
    disable_interruptions: bool
    execution_mode: str
    pre_tool_speech: str
    expects_response: bool
    response_timeout_secs: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Catalog schemas ───────────────────────────────────────────────────────────

class ToolTestRequest(BaseModel):
    parameters: dict


class BuiltinToolInfo(BaseModel):
    name: str
    tier: int
    execution: str  # "client" | "server"
    description: str
    parameters: dict
    requires_config: list[str] = []


class SystemToolConfigField(BaseModel):
    key: str
    label: str
    type: str
    description: str = ""


class SystemToolMeta(BaseModel):
    key: str
    label: str
    subtitle: str
    description: str
    icon: str
    color: str
    el_type: str
    system_tool_type: str
    default_config: dict
    config_fields: list[SystemToolConfigField]


class KnowledgeBaseMeta(BaseModel):
    label: str
    subtitle: str
    description: str
    icon: str
    color: str
