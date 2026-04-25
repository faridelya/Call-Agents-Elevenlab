from sqlalchemy import String, Boolean, Text, ForeignKey, JSON, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin, new_uuid


class PhoneNumber(Base, TimestampMixin):
    __tablename__ = "phone_numbers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    phone_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    friendly_name: Mapped[str | None] = mapped_column(String(255))
    country_code: Mapped[str | None] = mapped_column(String(10))
    capabilities: Mapped[dict] = mapped_column(JSON, default=dict)  # {voice: true, sms: true}

    # Twilio
    twilio_sid: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    twilio_account_sid: Mapped[str | None] = mapped_column(String(255))

    # Inbound routing
    inbound_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    inbound_agent_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("agents.id"))
    inbound_fallback_url: Mapped[str | None] = mapped_column(Text)

    # Billing
    monthly_cost: Mapped[float | None] = mapped_column(Numeric(10, 4))
    purchased_at: Mapped[str | None] = mapped_column(String(50))
    released_at: Mapped[str | None] = mapped_column(String(50))

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    user: Mapped["User"] = relationship(back_populates="phone_numbers")  # noqa: F821
    inbound_agent: Mapped["Agent"] = relationship(back_populates="phone_numbers", foreign_keys=[inbound_agent_id])  # noqa: F821
