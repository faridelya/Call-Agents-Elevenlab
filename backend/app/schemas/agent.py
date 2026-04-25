from datetime import datetime

from pydantic import BaseModel, Field, computed_field
from typing import Any


class AgentCreate(BaseModel):
    name: str
    description: str | None = None
    voice_id: str
    language: str = "en"
    system_prompt: str
    first_message: str | None = None
    agent_role: str | None = None
    company_name: str | None = None
    product_name: str | None = None
    call_type: str = "outbound"
    max_call_duration_seconds: int = 1800
    silence_timeout_seconds: int = 10
    llm_model: str = "gemini-1.5-flash"
    llm_temperature: float = 0.7
    voice_stability: float = 0.5
    voice_similarity: float = 0.75
    call_script: dict = Field(default_factory=dict)
    enabled_tools: list[str] = Field(default_factory=list)
    tool_configs: dict = Field(default_factory=dict)
    product_catalog: list = Field(default_factory=list)
    qualification_criteria: dict = Field(default_factory=dict)


class AgentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    voice_id: str | None = None
    language: str | None = None
    system_prompt: str | None = None
    first_message: str | None = None
    agent_role: str | None = None
    company_name: str | None = None
    product_name: str | None = None
    call_type: str | None = None
    max_call_duration_seconds: int | None = None
    silence_timeout_seconds: int | None = None
    llm_model: str | None = None
    llm_temperature: float | None = None
    voice_stability: float | None = None
    voice_similarity: float | None = None
    call_script: dict | None = None
    enabled_tools: list[str] | None = None
    tool_configs: dict | None = None
    product_catalog: list | None = None
    qualification_criteria: dict | None = None
    is_active: bool | None = None


class AgentToolsUpdate(BaseModel):
    enabled_tools: list[str]
    tool_configs: dict = Field(default_factory=dict)


class AgentResponse(BaseModel):
    id: str
    name: str
    description: str | None
    voice_id: str
    language: str
    system_prompt: str
    first_message: str | None
    agent_role: str | None
    company_name: str | None
    product_name: str | None
    call_type: str
    max_call_duration_seconds: int
    silence_timeout_seconds: int
    llm_model: str
    llm_temperature: float
    voice_stability: float
    voice_similarity: float
    call_script: dict
    enabled_tools: list
    tool_configs: dict
    product_catalog: list
    qualification_criteria: dict
    elevenlabs_agent_id: str | None
    el_last_synced_at: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def status(self) -> str:
        return "active" if self.is_active else "inactive"

    class Config:
        from_attributes = True


class VoiceOption(BaseModel):
    voice_id: str
    name: str
    preview_url: str | None = None
    labels: dict = Field(default_factory=dict)
