"""Create generated_reports table for PDF and CSV report archives

Revision ID: 0011_create_generated_reports_table
Revises: 0010_create_alerts_table
Create Date: 2026-09-05 00:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0011_create_generated_reports_table"
down_revision: Union[str, None] = "0010_create_alerts_table"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "generated_reports",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "estate_id",
            sa.Integer(),
            sa.ForeignKey("estates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("report_type", sa.String(length=50), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("file_path", sa.String(length=500), nullable=False),
        sa.Column(
            "file_size_bytes",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("period_start", sa.Date(), nullable=True),
        sa.Column("period_end", sa.Date(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(op.f("ix_generated_reports_id"), "generated_reports", ["id"], unique=False)
    op.create_index(op.f("ix_generated_reports_estate_id"), "generated_reports", ["estate_id"], unique=False)
    op.create_index(op.f("ix_generated_reports_report_type"), "generated_reports", ["report_type"], unique=False)
    op.create_index(op.f("ix_generated_reports_created_at"), "generated_reports", ["created_at"], unique=False)
    op.create_index(
        op.f("ix_generated_reports_estate_type"),
        "generated_reports",
        ["estate_id", "report_type"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_generated_reports_estate_type"), table_name="generated_reports")
    op.drop_index(op.f("ix_generated_reports_created_at"), table_name="generated_reports")
    op.drop_index(op.f("ix_generated_reports_report_type"), table_name="generated_reports")
    op.drop_index(op.f("ix_generated_reports_estate_id"), table_name="generated_reports")
    op.drop_index(op.f("ix_generated_reports_id"), table_name="generated_reports")
    op.drop_table("generated_reports")
