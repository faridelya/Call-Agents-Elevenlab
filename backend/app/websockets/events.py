from dataclasses import dataclass


@dataclass
class TwilioConnectedEvent:
    protocol: str
    version: str


@dataclass
class TwilioStartEvent:
    stream_sid: str
    call_sid: str
    account_sid: str
    custom_parameters: dict


@dataclass
class TwilioMediaEvent:
    stream_sid: str
    track: str
    chunk: str
    timestamp: str
    payload: str  # base64 μ-law audio


@dataclass
class TwilioStopEvent:
    stream_sid: str


@dataclass
class ELClientToolCall:
    tool_name: str
    tool_call_id: str
    parameters: dict


@dataclass
class ELToolResult:
    tool_call_id: str
    result: str
