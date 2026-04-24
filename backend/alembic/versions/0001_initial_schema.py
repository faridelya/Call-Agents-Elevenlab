"""Initial schema — all tables

Revision ID: 0001
Revises:
Create Date: 2026-04-23

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255)),
        sa.Column("company_name", sa.String(255)),
        sa.Column("subscription_tier", sa.String(50), server_default="free"),
        sa.Column("subscription_status", sa.String(50), server_default="active"),
        sa.Column("stripe_customer_id", sa.String(255)),
        sa.Column("stripe_subscription_id", sa.String(255)),
        sa.Column("twilio_account_sid", sa.String(255)),
        sa.Column("twilio_auth_token", sa.Text()),
        sa.Column("timezone", sa.String(100), server_default="UTC"),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("is_superuser", sa.Boolean(), server_default="false"),
        sa.Column("email_verified", sa.Boolean(), server_default="false"),
        sa.Column("last_login_at", sa.String(50)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(255), nullable=False),
        sa.Column("expires_at", sa.String(50), nullable=False),
        sa.Column("revoked", sa.Boolean(), server_default="false"),
        sa.Column("created_at", sa.String(50), nullable=False),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
    op.create_index("uq_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"], unique=True)

    op.create_table(
        "agents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("elevenlabs_agent_id", sa.String(255)),
        sa.Column("voice_id", sa.String(255), nullable=False),
        sa.Column("language", sa.String(10), server_default="en"),
        sa.Column("system_prompt", sa.Text(), nullable=False),
        sa.Column("first_message", sa.Text()),
        sa.Column("agent_role", sa.String(255)),
        sa.Column("company_name", sa.String(255)),
        sa.Column("product_name", sa.String(255)),
        sa.Column("call_type", sa.String(50), nullable=False, server_default="outbound"),
        sa.Column("max_call_duration_seconds", sa.Integer(), server_default="1800"),
        sa.Column("silence_timeout_seconds", sa.Integer(), server_default="10"),
        sa.Column("call_script", sa.JSON(), server_default=sa.text("'{}'")),
        sa.Column("enabled_tools", sa.JSON(), server_default=sa.text("'[]'")),
        sa.Column("tool_configs", sa.JSON(), server_default=sa.text("'{}'")),
        sa.Column("product_catalog", sa.JSON(), server_default=sa.text("'[]'")),
        sa.Column("qualification_criteria", sa.JSON(), server_default=sa.text("'{}'")),
        sa.Column("el_config_snapshot", sa.JSON()),
        sa.Column("el_last_synced_at", sa.String(50)),
        sa.Column("signing_secret", sa.String(64), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_agents_user_id", "agents", ["user_id"])
    op.create_index("ix_agents_elevenlabs_agent_id", "agents", ["elevenlabs_agent_id"])

    op.create_table(
        "phone_numbers",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("phone_number", sa.String(50), nullable=False),
        sa.Column("friendly_name", sa.String(255)),
        sa.Column("country_code", sa.String(10)),
        sa.Column("capabilities", sa.JSON(), server_default=sa.text("'{}'")),
        sa.Column("twilio_sid", sa.String(255), nullable=False),
        sa.Column("twilio_account_sid", sa.String(255)),
        sa.Column("inbound_enabled", sa.Boolean(), server_default="false"),
        sa.Column("inbound_agent_id", sa.String(36), sa.ForeignKey("agents.id")),
        sa.Column("inbound_fallback_url", sa.Text()),
        sa.Column("monthly_cost", sa.Numeric(10, 4)),
        sa.Column("purchased_at", sa.String(50)),
        sa.Column("released_at", sa.String(50)),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_phone_numbers_user_id", "phone_numbers", ["user_id"])
    op.create_index("uq_phone_numbers_phone_number", "phone_numbers", ["phone_number"], unique=True)
    op.create_index("uq_phone_numbers_twilio_sid", "phone_numbers", ["twilio_sid"], unique=True)

    op.create_table(
        "leads",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("first_name", sa.String(255)),
        sa.Column("last_name", sa.String(255)),
        sa.Column("email", sa.String(255)),
        sa.Column("phone", sa.String(50), nullable=False),
        sa.Column("phone_alt", sa.String(50)),
        sa.Column("company", sa.String(255)),
        sa.Column("title", sa.String(255)),
        sa.Column("industry", sa.String(255)),
        sa.Column("company_size", sa.String(50)),
        sa.Column("website", sa.String(255)),
        sa.Column("lead_source", sa.String(100)),
        sa.Column("lead_status", sa.String(50), server_default="new"),
        sa.Column("qualification_score", sa.Integer()),
        sa.Column("qualified_at", sa.String(50)),
        sa.Column("crm_provider", sa.String(50)),
        sa.Column("crm_id", sa.String(255)),
        sa.Column("crm_synced_at", sa.String(50)),
        sa.Column("tags", sa.JSON(), server_default=sa.text("'[]'")),
        sa.Column("custom_fields", sa.JSON(), server_default=sa.text("'{}'")),
        sa.Column("notes", sa.Text()),
        sa.Column("do_not_call", sa.Boolean(), server_default="false"),
        sa.Column("do_not_call_reason", sa.Text()),
        sa.Column("timezone", sa.String(100)),
        sa.Column("total_calls", sa.Integer(), server_default="0"),
        sa.Column("last_called_at", sa.String(50)),
        sa.Column("last_agent_id", sa.String(36), sa.ForeignKey("agents.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "phone", name="uq_lead_user_phone"),
    )
    op.create_index("ix_leads_user_id", "leads", ["user_id"])
    op.create_index("ix_leads_email", "leads", ["email"])
    op.create_index("ix_leads_lead_status", "leads", ["lead_status"])
    op.create_index("ix_leads_do_not_call", "leads", ["do_not_call"])

    op.create_table(
        "campaigns",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agent_id", sa.String(36), sa.ForeignKey("agents.id"), nullable=False),
        sa.Column("phone_number_id", sa.String(36), sa.ForeignKey("phone_numbers.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("status", sa.String(50), server_default="draft"),
        sa.Column("scheduled_start_at", sa.String(50)),
        sa.Column("scheduled_end_at", sa.String(50)),
        sa.Column("call_window_start", sa.String(10)),
        sa.Column("call_window_end", sa.String(10)),
        sa.Column("call_window_timezone", sa.String(100), server_default="UTC"),
        sa.Column("call_days", sa.JSON(), server_default=sa.text("'[1,2,3,4,5]'")),
        sa.Column("max_concurrent_calls", sa.Integer(), server_default="1"),
        sa.Column("retry_attempts", sa.Integer(), server_default="2"),
        sa.Column("retry_delay_minutes", sa.Integer(), server_default="60"),
        sa.Column("call_interval_seconds", sa.Integer(), server_default="5"),
        sa.Column("contacts", sa.JSON(), server_default=sa.text("'[]'")),
        sa.Column("total_contacts", sa.Integer(), server_default="0"),
        sa.Column("contacts_called", sa.Integer(), server_default="0"),
        sa.Column("contacts_answered", sa.Integer(), server_default="0"),
        sa.Column("contacts_completed", sa.Integer(), server_default="0"),
        sa.Column("contacts_failed", sa.Integer(), server_default="0"),
        sa.Column("contacts_dnc", sa.Integer(), server_default="0"),
        sa.Column("conversion_rate", sa.Float()),
        sa.Column("avg_call_duration", sa.Float()),
        sa.Column("started_at", sa.String(50)),
        sa.Column("completed_at", sa.String(50)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_campaigns_user_id", "campaigns", ["user_id"])
    op.create_index("ix_campaigns_status", "campaigns", ["status"])
    op.create_index("ix_campaigns_agent_id", "campaigns", ["agent_id"])

    op.create_table(
        "calls",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("agent_id", sa.String(36), sa.ForeignKey("agents.id")),
        sa.Column("campaign_id", sa.String(36), sa.ForeignKey("campaigns.id")),
        sa.Column("phone_number_id", sa.String(36), sa.ForeignKey("phone_numbers.id")),
        sa.Column("lead_id", sa.String(36), sa.ForeignKey("leads.id")),
        sa.Column("twilio_call_sid", sa.String(255)),
        sa.Column("twilio_parent_call_sid", sa.String(255)),
        sa.Column("from_number", sa.String(50), nullable=False),
        sa.Column("to_number", sa.String(50), nullable=False),
        sa.Column("direction", sa.String(20), nullable=False),
        sa.Column("started_at", sa.String(50)),
        sa.Column("answered_at", sa.String(50)),
        sa.Column("ended_at", sa.String(50)),
        sa.Column("duration_seconds", sa.Integer()),
        sa.Column("status", sa.String(50), server_default="initiated"),
        sa.Column("outcome", sa.String(100)),
        sa.Column("disposition_notes", sa.Text()),
        sa.Column("transcript", sa.JSON(), server_default=sa.text("'[]'")),
        sa.Column("stage_timeline", sa.JSON(), server_default=sa.text("'[]'")),
        sa.Column("recording_url", sa.Text()),
        sa.Column("recording_sid", sa.String(255)),
        sa.Column("sentiment_score", sa.Float()),
        sa.Column("talk_ratio", sa.Float()),
        sa.Column("key_moments", sa.JSON(), server_default=sa.text("'[]'")),
        sa.Column("auto_summary", sa.Text()),
        sa.Column("follow_up_date", sa.String(50)),
        sa.Column("next_action", sa.Text()),
        sa.Column("crm_synced_at", sa.String(50)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_calls_user_id", "calls", ["user_id"])
    op.create_index("ix_calls_agent_id", "calls", ["agent_id"])
    op.create_index("ix_calls_campaign_id", "calls", ["campaign_id"])
    op.create_index("uq_calls_twilio_call_sid", "calls", ["twilio_call_sid"], unique=True)
    op.create_index("ix_calls_created_at", "calls", ["created_at"])

    op.create_table(
        "tools",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agent_id", sa.String(36), sa.ForeignKey("agents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tool_type", sa.String(50), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("parameters_schema", sa.JSON(), nullable=False),
        sa.Column("config", sa.JSON(), server_default=sa.text("'{}'")),
        sa.Column("config_encrypted", sa.Text()),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_tools_agent_id", "tools", ["agent_id"])
    op.create_index("ix_tools_user_id", "tools", ["user_id"])

    op.create_table(
        "documents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agent_id", sa.String(36), sa.ForeignKey("agents.id")),
        sa.Column("tool_id", sa.String(36), sa.ForeignKey("tools.id")),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("file_type", sa.String(50)),
        sa.Column("file_size_bytes", sa.Integer()),
        sa.Column("storage_path", sa.Text()),
        sa.Column("chunk_count", sa.Integer(), server_default="0"),
        sa.Column("status", sa.String(50), server_default="processing"),
        sa.Column("error_message", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "document_chunks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("document_id", sa.String(36), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("metadata", sa.JSON(), server_default=sa.text("'{}'")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_document_chunks_document_id", "document_chunks", ["document_id"])
    # Embedding column added separately — requires pgvector installed
    op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS embedding vector(1536)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_doc_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)")


def downgrade() -> None:
    op.drop_table("document_chunks")
    op.drop_table("documents")
    op.drop_table("tools")
    op.drop_table("calls")
    op.drop_table("campaigns")
    op.drop_table("leads")
    op.drop_table("phone_numbers")
    op.drop_table("agents")
    op.drop_table("refresh_tokens")
    op.drop_table("users")
    op.execute("DROP EXTENSION IF EXISTS vector")
