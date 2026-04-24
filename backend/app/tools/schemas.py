from dataclasses import dataclass
from typing import Any


@dataclass
class ToolCall:
    tool_name: str
    tool_call_id: str
    parameters: dict[str, Any]


@dataclass
class ToolResult:
    tool_call_id: str
    result: str
    error: bool = False


@dataclass
class CallContext:
    call_record_id: str
    call_sid: str
    agent_id: str
    user_id: str
    agent_config: dict
    enabled_tools: list[str]
    tool_configs: dict
    lead_data: dict
    direction: str
