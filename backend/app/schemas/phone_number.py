from datetime import datetime

from pydantic import BaseModel


class PhoneNumberProvision(BaseModel):
    phone_number: str
    friendly_name: str | None = None
    inbound_agent_id: str | None = None


class PhoneNumberUpdate(BaseModel):
    friendly_name: str | None = None
    inbound_enabled: bool | None = None
    inbound_agent_id: str | None = None
    inbound_fallback_url: str | None = None


class PhoneNumberResponse(BaseModel):
    id: str
    phone_number: str
    friendly_name: str | None
    country_code: str | None
    capabilities: dict
    twilio_sid: str
    inbound_enabled: bool
    inbound_agent_id: str | None
    monthly_cost: float | None
    is_active: bool
    purchased_at: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class AvailableNumberSearch(BaseModel):
    country: str = "US"
    area_code: str | None = None
    contains: str | None = None
    limit: int = 20
