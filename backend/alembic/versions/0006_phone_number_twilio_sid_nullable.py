"""Make phone_numbers.twilio_sid nullable to support manually-entered BYO numbers

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-25
"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("phone_numbers", "twilio_sid", nullable=True)


def downgrade() -> None:
    op.alter_column("phone_numbers", "twilio_sid", nullable=False)
