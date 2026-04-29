from sqlalchemy import String, Boolean, Text, Integer, Float, ForeignKey, JSON, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin, new_uuid


class Campaign(Base, TimestampMixin):
    __tablename__ = "campaigns"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_id: Mapped[str] = mapped_column(String(36), ForeignKey("agents.id"), nullable=False, index=True)
    phone_number_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("phone_numbers.id"), nullable=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)

    # Status
    status: Mapped[str] = mapped_column(String(50), default="draft", index=True)

    # Schedule
    scheduled_start_at: Mapped[str | None] = mapped_column(String(50))
    scheduled_end_at: Mapped[str | None] = mapped_column(String(50))
    call_window_start: Mapped[str | None] = mapped_column(String(10))  # "09:00"
    call_window_end: Mapped[str | None] = mapped_column(String(10))   # "17:00"
    call_window_timezone: Mapped[str] = mapped_column(String(100), default="UTC")
    call_days: Mapped[list] = mapped_column(JSON, default=lambda: [1, 2, 3, 4, 5])

    # Calling config
    max_concurrent_calls: Mapped[int] = mapped_column(Integer, default=1)
    retry_attempts: Mapped[int] = mapped_column(Integer, default=2)
    retry_delay_minutes: Mapped[int] = mapped_column(Integer, default=60)
    call_interval_seconds: Mapped[int] = mapped_column(Integer, default=5)

    # Contacts: [{phone, first_name, last_name, ...custom}]
    contacts: Mapped[list] = mapped_column(JSON, default=list)
    total_contacts: Mapped[int] = mapped_column(Integer, default=0)

    # Progress counters
    contacts_called: Mapped[int] = mapped_column(Integer, default=0)
    contacts_answered: Mapped[int] = mapped_column(Integer, default=0)
    contacts_completed: Mapped[int] = mapped_column(Integer, default=0)
    contacts_failed: Mapped[int] = mapped_column(Integer, default=0)
    contacts_dnc: Mapped[int] = mapped_column(Integer, default=0)

    # Results
    conversion_rate: Mapped[float | None] = mapped_column(Float)
    avg_call_duration: Mapped[float | None] = mapped_column(Float)

    started_at: Mapped[str | None] = mapped_column(String(50))
    completed_at: Mapped[str | None] = mapped_column(String(50))

    # Relationships
    user: Mapped["User"] = relationship(back_populates="campaigns")  # noqa: F821
    agent: Mapped["Agent"] = relationship(back_populates="campaigns")  # noqa: F821
    calls: Mapped[list["Call"]] = relationship(back_populates="campaign")  # noqa: F821
