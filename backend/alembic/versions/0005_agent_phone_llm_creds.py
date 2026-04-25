"""Per-agent phone number; add google_api_key, anthropic_api_key to users; drop users.twilio_phone_number

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-25
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("agents", sa.Column("twilio_phone_number", sa.String(50), nullable=True))
    op.add_column("users", sa.Column("google_api_key", sa.Text, nullable=True))
    op.add_column("users", sa.Column("anthropic_api_key", sa.Text, nullable=True))
    op.drop_column("users", "twilio_phone_number")


def downgrade() -> None:
    op.add_column("users", sa.Column("twilio_phone_number", sa.String(50), nullable=True))
    op.drop_column("users", "anthropic_api_key")
    op.drop_column("users", "google_api_key")
    op.drop_column("agents", "twilio_phone_number")
