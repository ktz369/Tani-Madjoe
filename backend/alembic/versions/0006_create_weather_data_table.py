"""Create weather_data table with proper indexes and constraints

Revision ID: 0006_create_weather_data_table
Revises: 0005_create_plots_table
Create Date: 2026-09-01 03:15:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0006_create_weather_data_table"
down_revision: Union[str, None] = "0005_create_plots_table"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create weather_data table
    op.create_table(
        "weather_data",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "estate_id",
            sa.Integer(),
            sa.ForeignKey("estates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("observation_date", sa.Date(), nullable=False),
        sa.Column("temp_max_c", sa.Float(), nullable=True),
        sa.Column("temp_min_c", sa.Float(), nullable=True),
        sa.Column("humidity_pct", sa.Float(), nullable=True),
        sa.Column("wind_speed_ms", sa.Float(), nullable=True),
        sa.Column("solar_radiation_mjm2", sa.Float(), nullable=True),
        sa.Column("rainfall_mm", sa.Float(), nullable=True),
        sa.Column("et0_mm", sa.Float(), nullable=True),
        sa.Column(
            "is_forecast",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "estate_id",
            "observation_date",
            "is_forecast",
            name="uq_estate_weather_observation",
        ),
    )

    # 2. Create indexes
    op.create_index(op.f("ix_weather_data_id"), "weather_data", ["id"], unique=False)
    op.create_index(op.f("ix_weather_data_estate_id"), "weather_data", ["estate_id"], unique=False)
    op.create_index(op.f("ix_weather_data_observation_date"), "weather_data", ["observation_date"], unique=False)
    op.create_index(op.f("ix_weather_data_is_forecast"), "weather_data", ["is_forecast"], unique=False)
    op.create_index(
        op.f("ix_weather_data_estate_date"),
        "weather_data",
        ["estate_id", "observation_date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_weather_data_estate_date"), table_name="weather_data")
    op.drop_index(op.f("ix_weather_data_is_forecast"), table_name="weather_data")
    op.drop_index(op.f("ix_weather_data_observation_date"), table_name="weather_data")
    op.drop_index(op.f("ix_weather_data_estate_id"), table_name="weather_data")
    op.drop_index(op.f("ix_weather_data_id"), table_name="weather_data")
    op.drop_table("weather_data")
