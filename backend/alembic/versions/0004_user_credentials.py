"""Add per-user credential fields: elevenlabs_api_key, openai_api_key, twilio_phone_number

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-25
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("twilio_phone_number", sa.String(50), nullable=True))
    op.add_column("users", sa.Column("elevenlabs_api_key", sa.Text, nullable=True))
    op.add_column("users", sa.Column("openai_api_key", sa.Text, nullable=True))


def downgrade() -> None:
    op.drop_column("users", "openai_api_key")
    op.drop_column("users", "elevenlabs_api_key")
    op.drop_column("users", "twilio_phone_number")
