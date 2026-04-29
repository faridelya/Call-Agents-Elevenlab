"""Agent voice/STT model selection + nullable voice tuning

- voice_stability / voice_similarity: now nullable (None = use EL voice defaults)
- tts_model: new column — which EL TTS model to use (eleven_v3_conversational etc.)
- stt_provider: new column — elevenlabs (default) or scribe_realtime

Revision ID: 0009
Revises: 0008
Create Date: 2026-04-30
"""
from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("agents", "voice_stability", existing_type=sa.Float(), nullable=True)
    op.alter_column("agents", "voice_similarity", existing_type=sa.Float(), nullable=True)
    op.add_column("agents", sa.Column("tts_model",    sa.String(100), nullable=False, server_default="eleven_v3_conversational"))
    op.add_column("agents", sa.Column("stt_provider", sa.String(100), nullable=False, server_default="elevenlabs"))


def downgrade() -> None:
    op.drop_column("agents", "stt_provider")
    op.drop_column("agents", "tts_model")
    op.execute("UPDATE agents SET voice_stability = 0.5 WHERE voice_stability IS NULL")
    op.execute("UPDATE agents SET voice_similarity = 0.75 WHERE voice_similarity IS NULL")
    op.alter_column("agents", "voice_stability", existing_type=sa.Float(), nullable=False)
    op.alter_column("agents", "voice_similarity", existing_type=sa.Float(), nullable=False)
