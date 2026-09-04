"""Create plots table with PostGIS polygon geometry and spatial index

Revision ID: 0005_create_plots_table
Revises: 0004_create_variety_tables
Create Date: 2026-09-01 03:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
import geoalchemy2

revision: str = "0005_create_plots_table"
down_revision: Union[str, None] = "0004_create_variety_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create plots table
    plots_table = op.create_table(
        "plots",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("division_id", sa.Integer(), nullable=False),
        sa.Column("variety_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column(
            "polygon",
            geoalchemy2.types.Geometry(
                geometry_type="POLYGON",
                srid=4326,
                from_text="ST_GeomFromEWKT",
                name="geometry",
                nullable=False,
            ),
            nullable=False,
        ),
        sa.Column("area_hectares", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("planting_date", sa.Date(), nullable=True),
        sa.Column("crop_type", sa.String(length=50), server_default="padi", nullable=False),
        sa.Column("current_phase", sa.String(length=50), nullable=True),
        sa.Column("current_hst", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["division_id"],
            ["divisions.id"],
            name="fk_plots_division_id_divisions",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["variety_id"],
            ["crop_varieties.id"],
            name="fk_plots_variety_id_crop_varieties",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(op.f("ix_plots_id"), "plots", ["id"], unique=False)
    op.create_index(op.f("ix_plots_division_id"), "plots", ["division_id"], unique=False)
    op.create_index(op.f("ix_plots_variety_id"), "plots", ["variety_id"], unique=False)
    op.create_index(op.f("ix_plots_name"), "plots", ["name"], unique=False)
    op.create_index(op.f("ix_plots_crop_type"), "plots", ["crop_type"], unique=False)

    # Spatial index using GiST
    op.create_index(
        "idx_plots_polygon",
        "plots",
        ["polygon"],
        unique=False,
        postgresql_using="gist",
    )

    # 2. Seed initial demo plots for Estate Riau Permai (Estate 1)
    op.execute(
        """
        INSERT INTO plots (id, division_id, variety_id, name, polygon, area_hectares, planting_date, crop_type, current_phase, current_hst, created_at)
        VALUES 
            (
                1, 1, 1, 'Petak A1 - Ciherang Prima',
                ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[101.8500,0.5510],[101.8535,0.5510],[101.8535,0.5540],[101.8500,0.5540],[101.8500,0.5510]]]}'), 4326),
                12.85, CURRENT_DATE - INTERVAL '35 days', 'padi', 'Vegetatif Maksimum', 35, now()
            ),
            (
                2, 1, 2, 'Petak A2 - Inpari Berkah',
                ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[101.8540,0.5510],[101.8575,0.5510],[101.8575,0.5540],[101.8540,0.5540],[101.8540,0.5510]]]}'), 4326),
                12.85, CURRENT_DATE - INTERVAL '65 days', 'padi', 'Bunting (Booting)', 65, now()
            ),
            (
                3, 2, 4, 'Petak B1 - Pioneer Emas',
                ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[101.8500,0.5550],[101.8535,0.5550],[101.8535,0.5580],[101.8500,0.5580],[101.8500,0.5550]]]}'), 4326),
                12.85, CURRENT_DATE - INTERVAL '45 days', 'jagung', 'Inisiasi Pembungaan (V12-VT)', 45, now()
            ),
            (
                4, 2, 5, 'Petak B2 - Bisi Makmur',
                ST_SetSRID(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[101.8540,0.5550],[101.8575,0.5550],[101.8575,0.5580],[101.8540,0.5580],[101.8540,0.5550]]]}'), 4326),
                12.85, CURRENT_DATE - INTERVAL '20 days', 'jagung', 'Vegetatif Awal (V3-V6)', 20, now()
            )
        ON CONFLICT (id) DO NOTHING;
        """
    )
    op.execute("SELECT setval(pg_get_serial_sequence('plots', 'id'), coalesce(max(id), 1)) FROM plots;")


def downgrade() -> None:
    op.drop_index("idx_plots_polygon", table_name="plots", postgresql_using="gist")
    op.drop_index(op.f("ix_plots_crop_type"), table_name="plots")
    op.drop_index(op.f("ix_plots_name"), table_name="plots")
    op.drop_index(op.f("ix_plots_variety_id"), table_name="plots")
    op.drop_index(op.f("ix_plots_division_id"), table_name="plots")
    op.drop_index(op.f("ix_plots_id"), table_name="plots")
    op.drop_table("plots")
