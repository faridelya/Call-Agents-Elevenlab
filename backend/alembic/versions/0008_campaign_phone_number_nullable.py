"""Make campaigns.phone_number_id nullable — agent provides the from-number

Revision ID: 0008
Revises: 0007
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "campaigns",
        "phone_number_id",
        existing_type=sa.VARCHAR(length=36),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "campaigns",
        "phone_number_id",
        existing_type=sa.VARCHAR(length=36),
        nullable=False,
    )
