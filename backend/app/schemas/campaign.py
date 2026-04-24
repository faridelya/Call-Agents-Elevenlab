from datetime import datetime

from pydantic import BaseModel, Field


class CampaignCreate(BaseModel):
    name: str
    description: str | None = None
    agent_id: str
    phone_number_id: str
    contacts: list[dict] = Field(default_factory=list)
    scheduled_start_at: str | None = None
    call_window_start: str | None = "09:00"
    call_window_end: str | None = "17:00"
    call_window_timezone: str = "UTC"
    call_days: list[int] = Field(default_factory=lambda: [1, 2, 3, 4, 5])
    max_concurrent_calls: int = 1
    retry_attempts: int = 2
    retry_delay_minutes: int = 60
    call_interval_seconds: int = 5


class CampaignUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    agent_id: str | None = None
    phone_number_id: str | None = None
    scheduled_start_at: str | None = None
    call_window_start: str | None = None
    call_window_end: str | None = None
    call_window_timezone: str | None = None
    call_days: list[int] | None = None
    max_concurrent_calls: int | None = None
    retry_attempts: int | None = None
    retry_delay_minutes: int | None = None
    call_interval_seconds: int | None = None


class CampaignResponse(BaseModel):
    id: str
    name: str
    description: str | None
    agent_id: str
    phone_number_id: str
    status: str
    total_contacts: int
    contacts_called: int
    contacts_answered: int
    contacts_completed: int
    contacts_failed: int
    contacts_dnc: int
    conversion_rate: float | None
    avg_call_duration: float | None
    scheduled_start_at: str | None
    call_window_start: str | None
    call_window_end: str | None
    call_window_timezone: str
    call_days: list
    max_concurrent_calls: int
    retry_attempts: int
    started_at: str | None
    completed_at: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
