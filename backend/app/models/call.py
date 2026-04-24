from sqlalchemy import String, Boolean, Text, Integer, Float, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin, new_uuid


class Call(Base, TimestampMixin):
    __tablename__ = "calls"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    agent_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("agents.id"), index=True)
    campaign_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("campaigns.id"), index=True)
    phone_number_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("phone_numbers.id"))
    lead_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("leads.id"))

    # Twilio
    twilio_call_sid: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    twilio_parent_call_sid: Mapped[str | None] = mapped_column(String(255))
    from_number: Mapped[str] = mapped_column(String(50), nullable=False)
    to_number: Mapped[str] = mapped_column(String(50), nullable=False)
    direction: Mapped[str] = mapped_column(String(20), nullable=False)  # inbound | outbound

    # Timing (stored as ISO strings for simplicity across timezones)
    started_at: Mapped[str | None] = mapped_column(String(50))
    answered_at: Mapped[str | None] = mapped_column(String(50))
    ended_at: Mapped[str | None] = mapped_column(String(50))
    duration_seconds: Mapped[int | None] = mapped_column(Integer)

    # Status & outcome
    status: Mapped[str] = mapped_column(String(50), default="initiated")
    outcome: Mapped[str | None] = mapped_column(String(100))
    disposition_notes: Mapped[str | None] = mapped_column(Text)

    # Content
    transcript: Mapped[list] = mapped_column(JSON, default=list)
    stage_timeline: Mapped[list] = mapped_column(JSON, default=list)
    recording_url: Mapped[str | None] = mapped_column(Text)
    recording_sid: Mapped[str | None] = mapped_column(String(255))

    # Post-call analysis
    sentiment_score: Mapped[float | None] = mapped_column(Float)
    talk_ratio: Mapped[float | None] = mapped_column(Float)
    key_moments: Mapped[list] = mapped_column(JSON, default=list)
    auto_summary: Mapped[str | None] = mapped_column(Text)

    # Next steps
    follow_up_date: Mapped[str | None] = mapped_column(String(50))
    next_action: Mapped[str | None] = mapped_column(Text)
    crm_synced_at: Mapped[str | None] = mapped_column(String(50))

    # Relationships
    user: Mapped["User"] = relationship(back_populates="calls")  # noqa: F821
    agent: Mapped["Agent"] = relationship(back_populates="calls")  # noqa: F821
    lead: Mapped["Lead"] = relationship(back_populates="calls")  # noqa: F821
    campaign: Mapped["Campaign"] = relationship(back_populates="calls")  # noqa: F821
