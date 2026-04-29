from sqlalchemy import String, Boolean, Text, Integer, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin, new_uuid


class Agent(Base, TimestampMixin):
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)

    # ElevenLabs
    elevenlabs_agent_id: Mapped[str | None] = mapped_column(String(255), index=True)
    voice_id: Mapped[str] = mapped_column(String(255), nullable=False)
    language: Mapped[str] = mapped_column(String(10), default="en")

    # Persona / prompt
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    first_message: Mapped[str | None] = mapped_column(Text)
    agent_role: Mapped[str | None] = mapped_column(String(255))
    company_name: Mapped[str | None] = mapped_column(String(255))
    product_name: Mapped[str | None] = mapped_column(String(255))

    # Call behavior
    call_type: Mapped[str] = mapped_column(String(50), nullable=False, default="outbound")
    max_call_duration_seconds: Mapped[int] = mapped_column(Integer, default=1800)
    silence_timeout_seconds: Mapped[int] = mapped_column(Integer, default=10)

    # ElevenLabs model / voice tuning (surfaced to user)
    llm_model: Mapped[str] = mapped_column(String(100), default="gemini-2.0-flash")
    llm_temperature: Mapped[float] = mapped_column(default=0.7)
    tts_model: Mapped[str] = mapped_column(String(100), default="eleven_v3_conversational")
    stt_provider: Mapped[str] = mapped_column(String(100), default="elevenlabs")
    voice_stability: Mapped[float | None] = mapped_column(default=0.5)
    voice_similarity: Mapped[float | None] = mapped_column(default=0.75)

    # Script sections: {opener, discovery, pitch, objection_handling, closing, faq}
    call_script: Mapped[dict] = mapped_column(JSON, default=dict)

    # Tools
    enabled_tools: Mapped[list] = mapped_column(JSON, default=list)
    tool_configs: Mapped[dict] = mapped_column(JSON, default=dict)

    # Product catalog & qualification
    product_catalog: Mapped[list] = mapped_column(JSON, default=list)
    qualification_criteria: Mapped[dict] = mapped_column(JSON, default=dict)

    # EL sync state
    el_config_snapshot: Mapped[dict | None] = mapped_column(JSON)
    el_last_synced_at: Mapped[str | None] = mapped_column(String(50))

    # Telephony — the Twilio number used for calls with this agent (E.164 format)
    twilio_phone_number: Mapped[str | None] = mapped_column(String(50))

    # Security: per-agent secret sent in server tool HTTP calls
    signing_secret: Mapped[str] = mapped_column(String(64), default=new_uuid)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    user: Mapped["User"] = relationship(back_populates="agents")  # noqa: F821
    calls: Mapped[list["Call"]] = relationship(back_populates="agent")  # noqa: F821
    campaigns: Mapped[list["Campaign"]] = relationship(back_populates="agent")  # noqa: F821
    phone_numbers: Mapped[list["PhoneNumber"]] = relationship(back_populates="inbound_agent", foreign_keys="PhoneNumber.inbound_agent_id")  # noqa: F821
    tools: Mapped[list["Tool"]] = relationship(back_populates="agent", cascade="all, delete-orphan")  # noqa: F821
