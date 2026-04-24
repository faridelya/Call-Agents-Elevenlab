from datetime import datetime

from pydantic import BaseModel


class OutboundCallRequest(BaseModel):
    agent_id: str
    to_number: str
    lead_data: dict | None = None  # pre-seed contact info for dynamic variables


class CallResponse(BaseModel):
    id: str
    user_id: str
    agent_id: str | None
    agent_name: str | None = None
    campaign_id: str | None
    twilio_call_sid: str | None
    from_number: str
    to_number: str
    direction: str
    status: str
    outcome: str | None
    duration_seconds: int | None
    started_at: str | None
    answered_at: str | None
    ended_at: str | None
    sentiment_score: float | None
    auto_summary: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class CallDetailResponse(CallResponse):
    transcript: list
    stage_timeline: list
    key_moments: list
    disposition_notes: str | None
    recording_url: str | None
    talk_ratio: float | None
    follow_up_date: str | None
    next_action: str | None


class EndCallRequest(BaseModel):
    reason: str = "manual"
