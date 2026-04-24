from datetime import datetime

from pydantic import BaseModel
from typing import Any


class ToolCreate(BaseModel):
    agent_id: str
    tool_type: str  # custom_webhook | rag_kb | custom_api | dynamic_data
    name: str
    description: str
    parameters_schema: dict
    config: dict = {}


class ToolUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    parameters_schema: dict | None = None
    config: dict | None = None
    is_active: bool | None = None


class ToolResponse(BaseModel):
    id: str
    agent_id: str
    tool_type: str
    name: str
    description: str
    parameters_schema: dict
    config: dict
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ToolTestRequest(BaseModel):
    parameters: dict


class BuiltinToolInfo(BaseModel):
    name: str
    tier: int
    execution: str  # "client" | "server"
    description: str
    parameters: dict
    requires_config: list[str] = []
