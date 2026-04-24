"""Called by the bridge to dispatch client tool calls."""
import structlog
from app.tools.schemas import ToolCall, ToolResult, CallContext
from app.tools.registry import get_tool

log = structlog.get_logger(__name__)


async def execute(tool_call: ToolCall, ctx: CallContext, db, redis) -> ToolResult:
    tool = get_tool(tool_call.tool_name)

    if tool is None:
        log.warning("unknown_tool", tool_name=tool_call.tool_name, call_id=ctx.call_record_id)
        return ToolResult(
            tool_call_id=tool_call.tool_call_id,
            result=f"Tool '{tool_call.tool_name}' not found",
            error=True,
        )

    if tool["execution"] != "client":
        log.warning("server_tool_called_on_bridge", tool_name=tool_call.tool_name)
        return ToolResult(
            tool_call_id=tool_call.tool_call_id,
            result="This tool runs server-side",
            error=True,
        )

    try:
        result = await tool["handler"](tool_call.parameters, ctx, db, redis)
        return ToolResult(tool_call_id=tool_call.tool_call_id, result=str(result))
    except Exception as exc:
        log.error("tool_execution_error", tool_name=tool_call.tool_name, error=str(exc))
        return ToolResult(
            tool_call_id=tool_call.tool_call_id,
            result=f"Tool execution failed: {exc}",
            error=True,
        )
