"""Create planting_seasons table with proper indexes and constraints

Revision ID: 0007_create_planting_seasons_table
Revises: 0006_create_weather_data_table
Create Date: 2026-09-04 23:25:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0007_create_planting_seasons_table"
down_revision: Union[str, None] = "0006_create_weather_data_table"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create planting_seasons table
    op.create_table(
        "planting_seasons",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "plot_id",
            sa.Integer(),
            sa.ForeignKey("plots.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "variety_id",
            sa.Integer(),
            sa.ForeignKey("crop_varieties.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("planting_date", sa.Date(), nullable=False),
        sa.Column("harvest_date", sa.Date(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=50),
            server_default="active",
            nullable=False,
        ),
        sa.Column("yield_estimate_ton_per_ha", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # 2. Create indexes
    op.create_index(op.f("ix_planting_seasons_id"), "planting_seasons", ["id"], unique=False)
    op.create_index(op.f("ix_planting_seasons_plot_id"), "planting_seasons", ["plot_id"], unique=False)
    op.create_index(op.f("ix_planting_seasons_variety_id"), "planting_seasons", ["variety_id"], unique=False)
    op.create_index(op.f("ix_planting_seasons_planting_date"), "planting_seasons", ["planting_date"], unique=False)
    op.create_index(op.f("ix_planting_seasons_status"), "planting_seasons", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_planting_seasons_status"), table_name="planting_seasons")
    op.drop_index(op.f("ix_planting_seasons_planting_date"), table_name="planting_seasons")
    op.drop_index(op.f("ix_planting_seasons_variety_id"), table_name="planting_seasons")
    op.drop_index(op.f("ix_planting_seasons_plot_id"), table_name="planting_seasons")
    op.drop_index(op.f("ix_planting_seasons_id"), table_name="planting_seasons")
    op.drop_table("planting_seasons")
