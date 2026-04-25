"""Add elevenlabs_conversation_id to calls table

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-25
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "calls",
        sa.Column("elevenlabs_conversation_id", sa.String(255), nullable=True),
    )
    op.create_index(
        "ix_calls_elevenlabs_conversation_id",
        "calls",
        ["elevenlabs_conversation_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_calls_elevenlabs_conversation_id", table_name="calls")
    op.drop_column("calls", "elevenlabs_conversation_id")
