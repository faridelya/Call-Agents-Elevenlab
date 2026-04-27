from sqlalchemy import String, Boolean, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin, new_uuid


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255))
    company_name: Mapped[str | None] = mapped_column(String(255))

    # Subscription
    subscription_tier: Mapped[str] = mapped_column(String(50), default="free")
    subscription_status: Mapped[str] = mapped_column(String(50), default="active")
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255))
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255))

    # BYO credentials — all encrypted at rest, platform creds used as fallback
    twilio_account_sid: Mapped[str | None] = mapped_column(String(255))
    twilio_auth_token: Mapped[str | None] = mapped_column(Text)
    elevenlabs_api_key: Mapped[str | None] = mapped_column(Text)
    elevenlabs_webhook_secret: Mapped[str | None] = mapped_column(Text)
    openai_api_key: Mapped[str | None] = mapped_column(Text)
    google_api_key: Mapped[str | None] = mapped_column(Text)
    anthropic_api_key: Mapped[str | None] = mapped_column(Text)

    contact_pool: Mapped[list] = mapped_column(JSON, default=list, nullable=True)

    timezone: Mapped[str] = mapped_column(String(100), default="UTC")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    last_login_at: Mapped[str | None] = mapped_column(String(50))

    # Relationships
    agents: Mapped[list["Agent"]] = relationship(back_populates="user", cascade="all, delete-orphan")  # noqa: F821
    calls: Mapped[list["Call"]] = relationship(back_populates="user")  # noqa: F821
    leads: Mapped[list["Lead"]] = relationship(back_populates="user", cascade="all, delete-orphan")  # noqa: F821
    campaigns: Mapped[list["Campaign"]] = relationship(back_populates="user", cascade="all, delete-orphan")  # noqa: F821
    phone_numbers: Mapped[list["PhoneNumber"]] = relationship(back_populates="user", cascade="all, delete-orphan")  # noqa: F821
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(back_populates="user", cascade="all, delete-orphan")  # noqa: F821
