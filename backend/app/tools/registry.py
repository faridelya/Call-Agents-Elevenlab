"""
Tool registry — maps tool names to handlers and metadata.
Tier 1 tools are client tools (executed by the bridge).
Tier 2/3 tools can be client or server depending on the tool.
"""
from typing import Callable, Any
from app.tools.schemas import ToolCall, ToolResult, CallContext

# {tool_name: {"handler": fn, "tier": int, "execution": "client"|"server"}}
_registry: dict[str, dict] = {}


def register_tool(name: str, tier: int, execution: str, description: str, parameters: dict):
    def decorator(fn: Callable):
        _registry[name] = {
            "handler": fn,
            "tier": tier,
            "execution": execution,
            "description": description,
            "parameters": parameters,
        }
        return fn
    return decorator


def get_tool(name: str) -> dict | None:
    return _registry.get(name)


def list_tools() -> list[dict]:
    return [{"name": k, **{k2: v2 for k2, v2 in v.items() if k2 != "handler"}} for k, v in _registry.items()]


def is_client_tool(name: str) -> bool:
    tool = _registry.get(name)
    return tool is not None and tool["execution"] == "client"


# Import all tools so they self-register via @register_tool decorator
def load_tools():
    from app.tools.tier1 import save_lead, get_contact_info, end_call, log_call_outcome, get_call_script, update_call_stage  # noqa
    from app.tools.tier2 import transfer_to_human, leave_voicemail  # noqa (client tools only for now)
