"""Dynamic tool system: el_tool_type, tool_parameters, behavior cols + KB on agents

Extends the tools table with:
  - el_tool_type: how the tool registers with EL (webhook|client|mcp)
  - tool_parameters: client-tool parameter definitions (JSON array)
  - disable_interruptions, execution_mode, pre_tool_speech, expects_response, response_timeout_secs

Adds to agents:
  - knowledge_base_id / knowledge_base_name: EL KB attachment

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-08
"""
from alembic import op
import sqlalchemy as sa

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── tools table ──────────────────────────────────────────────────────────
    op.add_column("tools", sa.Column("el_tool_type", sa.String(50), nullable=False, server_default="webhook"))
    op.add_column("tools", sa.Column("tool_parameters", sa.JSON(), nullable=False, server_default=sa.text("'[]'")))
    op.add_column("tools", sa.Column("disable_interruptions", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("tools", sa.Column("execution_mode", sa.String(50), nullable=False, server_default="immediate"))
    op.add_column("tools", sa.Column("pre_tool_speech", sa.String(50), nullable=False, server_default="auto"))
    op.add_column("tools", sa.Column("expects_response", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("tools", sa.Column("response_timeout_secs", sa.Integer(), nullable=False, server_default="20"))

    # Make parameters_schema nullable-safe (existing rows may lack it) — add default
    op.execute("UPDATE tools SET parameters_schema = '{}' WHERE parameters_schema IS NULL")

    # ── agents table ─────────────────────────────────────────────────────────
    op.add_column("agents", sa.Column("knowledge_base_id", sa.String(255), nullable=True))
    op.add_column("agents", sa.Column("knowledge_base_name", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("agents", "knowledge_base_name")
    op.drop_column("agents", "knowledge_base_id")
    op.drop_column("tools", "response_timeout_secs")
    op.drop_column("tools", "expects_response")
    op.drop_column("tools", "pre_tool_speech")
    op.drop_column("tools", "execution_mode")
    op.drop_column("tools", "disable_interruptions")
    op.drop_column("tools", "tool_parameters")
    op.drop_column("tools", "el_tool_type")
