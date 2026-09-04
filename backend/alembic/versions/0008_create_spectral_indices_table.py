"""Create spectral_indices table for satellite remote sensing and SAR backscatter

Revision ID: 0008_create_spectral_indices_table
Revises: 0006_create_weather_data_table
Create Date: 2026-09-04 23:25:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0008_create_spectral_indices_table"
down_revision: Union[str, None] = "0007_create_planting_seasons_table"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create spectral_indices table
    op.create_table(
        "spectral_indices",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "plot_id",
            sa.Integer(),
            sa.ForeignKey("plots.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("observation_date", sa.Date(), nullable=False),
        sa.Column(
            "satellite",
            sa.String(length=50),
            server_default="sentinel-2",
            nullable=False,
        ),
        sa.Column("ndvi", sa.Float(), nullable=True),
        sa.Column("ndre", sa.Float(), nullable=True),
        sa.Column("ndwi", sa.Float(), nullable=True),
        sa.Column("savi", sa.Float(), nullable=True),
        sa.Column("bsi", sa.Float(), nullable=True),
        sa.Column("sar_vv_db", sa.Float(), nullable=True),
        sa.Column("sar_vh_db", sa.Float(), nullable=True),
        sa.Column(
            "cloud_cover_pct",
            sa.Float(),
            server_default="0.0",
            nullable=True,
        ),
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
            "satellite",
            name="uq_plot_obs_satellite",
        ),
    )

    # 2. Create indexes
    op.create_index(op.f("ix_spectral_indices_id"), "spectral_indices", ["id"], unique=False)
    op.create_index(op.f("ix_spectral_indices_plot_id"), "spectral_indices", ["plot_id"], unique=False)
    op.create_index(op.f("ix_spectral_indices_observation_date"), "spectral_indices", ["observation_date"], unique=False)
    op.create_index(op.f("ix_spectral_indices_satellite"), "spectral_indices", ["satellite"], unique=False)
    op.create_index(
        op.f("ix_spectral_indices_plot_date"),
        "spectral_indices",
        ["plot_id", "observation_date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_spectral_indices_plot_date"), table_name="spectral_indices")
    op.drop_index(op.f("ix_spectral_indices_satellite"), table_name="spectral_indices")
    op.drop_index(op.f("ix_spectral_indices_observation_date"), table_name="spectral_indices")
    op.drop_index(op.f("ix_spectral_indices_plot_id"), table_name="spectral_indices")
    op.drop_index(op.f("ix_spectral_indices_id"), table_name="spectral_indices")
    op.drop_table("spectral_indices")
