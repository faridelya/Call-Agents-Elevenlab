from datetime import datetime

from pydantic import BaseModel, field_validator
import re


class LeadCreate(BaseModel):
    phone: str
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    company: str | None = None
    title: str | None = None
    industry: str | None = None
    notes: str | None = None
    tags: list[str] = []
    custom_fields: dict = {}
    lead_source: str | None = None


class LeadUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    company: str | None = None
    title: str | None = None
    industry: str | None = None
    company_size: str | None = None
    website: str | None = None
    lead_status: str | None = None
    notes: str | None = None
    tags: list[str] | None = None
    custom_fields: dict | None = None
    timezone: str | None = None


class LeadResponse(BaseModel):
    id: str
    phone: str
    first_name: str | None
    last_name: str | None
    email: str | None
    company: str | None
    title: str | None
    lead_status: str
    qualification_score: int | None
    do_not_call: bool
    tags: list
    total_calls: int
    last_called_at: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DoNotCallRequest(BaseModel):
    reason: str | None = None
