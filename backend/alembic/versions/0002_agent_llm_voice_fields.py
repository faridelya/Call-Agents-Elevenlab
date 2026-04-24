"""Add LLM and voice tuning fields to agents

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-23

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("agents", sa.Column("llm_model", sa.String(100), server_default="gemini-1.5-flash", nullable=False))
    op.add_column("agents", sa.Column("llm_temperature", sa.Float(), server_default="0.7", nullable=False))
    op.add_column("agents", sa.Column("voice_stability", sa.Float(), server_default="0.5", nullable=False))
    op.add_column("agents", sa.Column("voice_similarity", sa.Float(), server_default="0.75", nullable=False))


def downgrade() -> None:
    op.drop_column("agents", "voice_similarity")
    op.drop_column("agents", "voice_stability")
    op.drop_column("agents", "llm_temperature")
    op.drop_column("agents", "llm_model")
