from sqlalchemy import String, Boolean, Text, Integer, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin, new_uuid


class Lead(Base, TimestampMixin):
    __tablename__ = "leads"
    __table_args__ = (UniqueConstraint("user_id", "phone", name="uq_lead_user_phone"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Identity
    first_name: Mapped[str | None] = mapped_column(String(255))
    last_name: Mapped[str | None] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(255), index=True)
    phone: Mapped[str] = mapped_column(String(50), nullable=False)
    phone_alt: Mapped[str | None] = mapped_column(String(50))

    # Company
    company: Mapped[str | None] = mapped_column(String(255))
    title: Mapped[str | None] = mapped_column(String(255))
    industry: Mapped[str | None] = mapped_column(String(255))
    company_size: Mapped[str | None] = mapped_column(String(50))
    website: Mapped[str | None] = mapped_column(String(255))

    # Sales data
    lead_source: Mapped[str | None] = mapped_column(String(100))
    lead_status: Mapped[str] = mapped_column(String(50), default="new", index=True)
    qualification_score: Mapped[int | None] = mapped_column(Integer)
    qualified_at: Mapped[str | None] = mapped_column(String(50))

    # CRM sync
    crm_provider: Mapped[str | None] = mapped_column(String(50))
    crm_id: Mapped[str | None] = mapped_column(String(255))
    crm_synced_at: Mapped[str | None] = mapped_column(String(50))

    # Metadata
    tags: Mapped[list] = mapped_column(JSON, default=list)
    custom_fields: Mapped[dict] = mapped_column(JSON, default=dict)
    notes: Mapped[str | None] = mapped_column(Text)
    do_not_call: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    do_not_call_reason: Mapped[str | None] = mapped_column(Text)
    timezone: Mapped[str | None] = mapped_column(String(100))

    # Stats
    total_calls: Mapped[int] = mapped_column(Integer, default=0)
    last_called_at: Mapped[str | None] = mapped_column(String(50))
    last_agent_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("agents.id"))

    # Relationships
    user: Mapped["User"] = relationship(back_populates="leads")  # noqa: F821
    calls: Mapped[list["Call"]] = relationship(back_populates="lead")  # noqa: F821
