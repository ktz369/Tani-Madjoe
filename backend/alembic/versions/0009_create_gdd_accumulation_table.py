"""Create gdd_accumulation table for thermal time tracking and crop phenology predictions

Revision ID: 0009_create_gdd_accumulation_table
Revises: 0008_create_spectral_indices_table
Create Date: 2026-09-04 23:45:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0009_create_gdd_accumulation_table"
down_revision: Union[str, None] = "0008_create_spectral_indices_table"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create gdd_accumulation table
    op.create_table(
        "gdd_accumulation",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "plot_id",
            sa.Integer(),
            sa.ForeignKey("plots.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("observation_date", sa.Date(), nullable=False),
        sa.Column(
            "gdd_daily",
            sa.Float(),
            server_default="0.0",
            nullable=False,
        ),
        sa.Column(
            "gdd_cumulative",
            sa.Float(),
            server_default="0.0",
            nullable=False,
        ),
        sa.Column("etc_mm", sa.Float(), nullable=True),
        sa.Column("predicted_phase", sa.String(length=50), nullable=True),
        sa.Column("predicted_harvest_date", sa.Date(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "plot_id",
            "observation_date",
            name="uq_plot_gdd_obs_date",
        ),
    )

    # 2. Create indexes
    op.create_index(op.f("ix_gdd_accumulation_id"), "gdd_accumulation", ["id"], unique=False)
    op.create_index(op.f("ix_gdd_accumulation_plot_id"), "gdd_accumulation", ["plot_id"], unique=False)
    op.create_index(op.f("ix_gdd_accumulation_observation_date"), "gdd_accumulation", ["observation_date"], unique=False)
    op.create_index(
        op.f("ix_gdd_accumulation_plot_date"),
        "gdd_accumulation",
        ["plot_id", "observation_date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_gdd_accumulation_plot_date"), table_name="gdd_accumulation")
    op.drop_index(op.f("ix_gdd_accumulation_observation_date"), table_name="gdd_accumulation")
    op.drop_index(op.f("ix_gdd_accumulation_plot_id"), table_name="gdd_accumulation")
    op.drop_index(op.f("ix_gdd_accumulation_id"), table_name="gdd_accumulation")
    op.drop_table("gdd_accumulation")
