"""Add contact_pool JSON column to users table

Revision ID: 0007
Revises: 0006
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "7ac2495c59be"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("contact_pool", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "contact_pool")
