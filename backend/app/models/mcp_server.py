from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import String, Text, JSON, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, new_uuid


class McpServer(Base):
    __tablename__ = "mcp_servers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    url: Mapped[str] = mapped_column(String(2000), nullable=False)
    # Transport type expected by EL: sse | http
    transport: Mapped[str] = mapped_column(String(20), nullable=False, default="sse")
    # ID returned by ElevenLabs after registration
    el_mcp_server_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # Extra config (e.g. headers, notes)
    config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
