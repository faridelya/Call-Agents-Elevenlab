from sqlalchemy import String, Boolean, Text, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin, new_uuid


class Tool(Base, TimestampMixin):
    __tablename__ = "tools"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_id: Mapped[str] = mapped_column(String(36), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True)

    # Tool type: custom_webhook | rag_kb | custom_api | dynamic_data
    tool_type: Mapped[str] = mapped_column(String(50), nullable=False)

    # What ElevenLabs sees
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    parameters_schema: Mapped[dict] = mapped_column(JSON, nullable=False)

    # Type-specific config
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    config_encrypted: Mapped[str | None] = mapped_column(Text)  # Fernet-encrypted sensitive fields

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    agent: Mapped["Agent"] = relationship(back_populates="tools")  # noqa: F821
