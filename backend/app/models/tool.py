from sqlalchemy import String, Boolean, Text, Integer, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin, new_uuid


class Tool(Base, TimestampMixin):
    __tablename__ = "tools"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_id: Mapped[str] = mapped_column(String(36), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True)

    # Legacy category: custom_webhook | rag_kb | custom_api | dynamic_data
    tool_type: Mapped[str] = mapped_column(String(50), nullable=False)

    # How this tool is registered with ElevenLabs: webhook | client | mcp
    el_tool_type: Mapped[str] = mapped_column(String(50), nullable=False, default="webhook")

    # What ElevenLabs sees
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    # For webhook tools: JSON Schema describing the request body
    parameters_schema: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    # For client tools: list of EL-format parameter definition objects
    tool_parameters: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    # Tool-type-specific runtime config (URL, headers, auth, mocks, etc.)
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    config_encrypted: Mapped[str | None] = mapped_column(Text)

    # EL tool behavior
    disable_interruptions: Mapped[bool] = mapped_column(Boolean, default=False)
    execution_mode: Mapped[str] = mapped_column(String(50), default="immediate")
    pre_tool_speech: Mapped[str] = mapped_column(String(50), default="auto")
    expects_response: Mapped[bool] = mapped_column(Boolean, default=False)
    response_timeout_secs: Mapped[int] = mapped_column(Integer, default=20)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    agent: Mapped["Agent"] = relationship(back_populates="tools")  # noqa: F821
