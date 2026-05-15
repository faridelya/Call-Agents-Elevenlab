"""Add EL analysis fields, evaluation criteria, data collection, and MCP servers

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-15

Adds:
  agents  : evaluation_criteria (JSON), data_collection (JSON), mcp_server_ids (JSON)
  calls   : el_analysis_results (JSON), el_data_collection (JSON),
            call_summary_title (VARCHAR 500)
  new     : mcp_servers table
"""
from typing import Sequence, Union
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── agents: analysis criteria + data collection + MCP attachment ─────────
    op.add_column("agents", sa.Column("evaluation_criteria", sa.JSON(), nullable=True))
    op.add_column("agents", sa.Column("data_collection", sa.JSON(), nullable=True))
    op.add_column("agents", sa.Column("mcp_server_ids", sa.JSON(), nullable=True))

    # ── calls: EL post-call analysis fields ───────────────────────────────────
    op.add_column("calls", sa.Column("el_analysis_results", sa.JSON(), nullable=True))
    op.add_column("calls", sa.Column("el_data_collection", sa.JSON(), nullable=True))
    op.add_column("calls", sa.Column("call_summary_title", sa.String(500), nullable=True))

    # ── mcp_servers table ─────────────────────────────────────────────────────
    op.create_table(
        "mcp_servers",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.String(1000), nullable=True),
        sa.Column("url", sa.String(2000), nullable=False),
        sa.Column("transport", sa.String(20), nullable=False, server_default="sse"),
        sa.Column("el_mcp_server_id", sa.String(255), nullable=True),
        sa.Column("config", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("NOW()")),
    )
    op.create_index("ix_mcp_servers_user_id", "mcp_servers", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_mcp_servers_user_id", table_name="mcp_servers")
    op.drop_table("mcp_servers")

    op.drop_column("calls", "call_summary_title")
    op.drop_column("calls", "el_data_collection")
    op.drop_column("calls", "el_analysis_results")

    op.drop_column("agents", "mcp_server_ids")
    op.drop_column("agents", "data_collection")
    op.drop_column("agents", "evaluation_criteria")
