"""Create crop varieties and phenology phases tables and seed data

Revision ID: 0004_create_variety_tables
Revises: 0003_create_org_tables
Create Date: 2026-09-01 02:45:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0004_create_variety_tables"
down_revision: Union[str, None] = "0003_create_org_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create crop_varieties table
    varieties_table = op.create_table(
        "crop_varieties",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("crop_type", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("cycle_days", sa.Integer(), nullable=False),
        sa.Column("t_base", sa.Float(), server_default="10.0", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("crop_type", "name", name="uq_crop_variety_name_per_type"),
    )
    op.create_index(op.f("ix_crop_varieties_id"), "crop_varieties", ["id"], unique=False)
    op.create_index(op.f("ix_crop_varieties_crop_type"), "crop_varieties", ["crop_type"], unique=False)
    op.create_index(op.f("ix_crop_varieties_name"), "crop_varieties", ["name"], unique=False)

    # 2. Create phenology_phases table
    phases_table = op.create_table(
        "phenology_phases",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("variety_id", sa.Integer(), nullable=False),
        sa.Column("phase_code", sa.String(length=50), nullable=False),
        sa.Column("phase_name", sa.String(length=255), nullable=False),
        sa.Column("hst_start", sa.Integer(), nullable=False),
        sa.Column("hst_end", sa.Integer(), nullable=False),
        sa.Column("ndvi_expected_min", sa.Float(), nullable=False),
        sa.Column("ndvi_expected_max", sa.Float(), nullable=False),
        sa.Column("ndre_threshold", sa.Float(), nullable=False),
        sa.Column("kc_value", sa.Float(), nullable=False),
        sa.Column("gdd_target", sa.Float(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["variety_id"], ["crop_varieties.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("variety_id", "phase_code", name="uq_variety_phase_code"),
        sa.CheckConstraint("hst_start <= hst_end", name="chk_phase_hst_range"),
        sa.CheckConstraint("kc_value > 0", name="chk_phase_kc_positive"),
    )
    op.create_index(op.f("ix_phenology_phases_id"), "phenology_phases", ["id"], unique=False)
    op.create_index(op.f("ix_phenology_phases_variety_id"), "phenology_phases", ["variety_id"], unique=False)

    # 3. Seed data: Varietas Padi & Jagung
    op.bulk_insert(
        varieties_table,
        [
            {"id": 1, "crop_type": "padi", "name": "Inpari 32", "cycle_days": 120, "t_base": 10.0},
            {"id": 2, "crop_type": "padi", "name": "Ciherang", "cycle_days": 116, "t_base": 10.0},
            {"id": 3, "crop_type": "jagung", "name": "BISI 18", "cycle_days": 95, "t_base": 10.0},
            {"id": 4, "crop_type": "jagung", "name": "Pioneer P35", "cycle_days": 100, "t_base": 10.0},
        ],
    )

    # Seed data: Fase Fenologi Inpari 32 (Padi, 120 HST)
    phases_inpari_32 = [
        {"variety_id": 1, "phase_code": "P0", "phase_name": "Olah Tanah & Pembibitan", "hst_start": 0, "hst_end": 0, "ndvi_expected_min": 0.05, "ndvi_expected_max": 0.15, "ndre_threshold": 0.05, "kc_value": 1.05, "gdd_target": 50.0},
        {"variety_id": 1, "phase_code": "V1", "phase_name": "Transplanting / Tabela & Pemulihan", "hst_start": 1, "hst_end": 10, "ndvi_expected_min": 0.10, "ndvi_expected_max": 0.20, "ndre_threshold": 0.10, "kc_value": 1.05, "gdd_target": 150.0},
        {"variety_id": 1, "phase_code": "V2", "phase_name": "Pertunasan / Anakan Aktif (Tillering)", "hst_start": 11, "hst_end": 30, "ndvi_expected_min": 0.25, "ndvi_expected_max": 0.55, "ndre_threshold": 0.25, "kc_value": 1.10, "gdd_target": 450.0},
        {"variety_id": 1, "phase_code": "V3", "phase_name": "Anakan Maksimum & Inisiasi Malai (PI)", "hst_start": 31, "hst_end": 50, "ndvi_expected_min": 0.55, "ndvi_expected_max": 0.75, "ndre_threshold": 0.40, "kc_value": 1.15, "gdd_target": 750.0},
        {"variety_id": 1, "phase_code": "R1", "phase_name": "Fase Bunting (Booting)", "hst_start": 51, "hst_end": 65, "ndvi_expected_min": 0.75, "ndvi_expected_max": 0.88, "ndre_threshold": 0.50, "kc_value": 1.20, "gdd_target": 1000.0},
        {"variety_id": 1, "phase_code": "R2", "phase_name": "Keluar Malai (Heading) & Berbunga (Anthesis)", "hst_start": 66, "hst_end": 75, "ndvi_expected_min": 0.75, "ndvi_expected_max": 0.85, "ndre_threshold": 0.48, "kc_value": 1.20, "gdd_target": 1200.0},
        {"variety_id": 1, "phase_code": "R3", "phase_name": "Pengisian Bulir (Masak Susu & Masak Kuning)", "hst_start": 76, "hst_end": 95, "ndvi_expected_min": 0.55, "ndvi_expected_max": 0.80, "ndre_threshold": 0.38, "kc_value": 1.05, "gdd_target": 1500.0},
        {"variety_id": 1, "phase_code": "R4", "phase_name": "Masak Penuh / Fisiologis (Maturity)", "hst_start": 96, "hst_end": 115, "ndvi_expected_min": 0.30, "ndvi_expected_max": 0.45, "ndre_threshold": 0.25, "kc_value": 0.90, "gdd_target": 1800.0},
        {"variety_id": 1, "phase_code": "P1", "phase_name": "Pasca-Panen (Harvesting & Fallow)", "hst_start": 116, "hst_end": 125, "ndvi_expected_min": 0.10, "ndvi_expected_max": 0.20, "ndre_threshold": 0.10, "kc_value": 0.50, "gdd_target": 1950.0},
    ]

    # Seed data: Fase Fenologi Ciherang (Padi, 116 HST)
    phases_ciherang = [
        {"variety_id": 2, "phase_code": "P0", "phase_name": "Olah Tanah & Pembibitan", "hst_start": 0, "hst_end": 0, "ndvi_expected_min": 0.05, "ndvi_expected_max": 0.15, "ndre_threshold": 0.05, "kc_value": 1.05, "gdd_target": 50.0},
        {"variety_id": 2, "phase_code": "V1", "phase_name": "Transplanting / Tabela & Pemulihan", "hst_start": 1, "hst_end": 10, "ndvi_expected_min": 0.10, "ndvi_expected_max": 0.20, "ndre_threshold": 0.10, "kc_value": 1.05, "gdd_target": 150.0},
        {"variety_id": 2, "phase_code": "V2", "phase_name": "Pertunasan / Anakan Aktif (Tillering)", "hst_start": 11, "hst_end": 28, "ndvi_expected_min": 0.25, "ndvi_expected_max": 0.55, "ndre_threshold": 0.25, "kc_value": 1.10, "gdd_target": 420.0},
        {"variety_id": 2, "phase_code": "V3", "phase_name": "Anakan Maksimum & Inisiasi Malai (PI)", "hst_start": 29, "hst_end": 48, "ndvi_expected_min": 0.55, "ndvi_expected_max": 0.75, "ndre_threshold": 0.40, "kc_value": 1.15, "gdd_target": 720.0},
        {"variety_id": 2, "phase_code": "R1", "phase_name": "Fase Bunting (Booting)", "hst_start": 49, "hst_end": 62, "ndvi_expected_min": 0.75, "ndvi_expected_max": 0.88, "ndre_threshold": 0.50, "kc_value": 1.20, "gdd_target": 960.0},
        {"variety_id": 2, "phase_code": "R2", "phase_name": "Keluar Malai (Heading) & Berbunga (Anthesis)", "hst_start": 63, "hst_end": 72, "ndvi_expected_min": 0.75, "ndvi_expected_max": 0.85, "ndre_threshold": 0.48, "kc_value": 1.20, "gdd_target": 1150.0},
        {"variety_id": 2, "phase_code": "R3", "phase_name": "Pengisian Bulir (Masak Susu & Masak Kuning)", "hst_start": 73, "hst_end": 92, "ndvi_expected_min": 0.55, "ndvi_expected_max": 0.80, "ndre_threshold": 0.38, "kc_value": 1.05, "gdd_target": 1450.0},
        {"variety_id": 2, "phase_code": "R4", "phase_name": "Masak Penuh / Fisiologis (Maturity)", "hst_start": 93, "hst_end": 110, "ndvi_expected_min": 0.30, "ndvi_expected_max": 0.45, "ndre_threshold": 0.25, "kc_value": 0.90, "gdd_target": 1720.0},
        {"variety_id": 2, "phase_code": "P1", "phase_name": "Pasca-Panen (Harvesting & Fallow)", "hst_start": 111, "hst_end": 120, "ndvi_expected_min": 0.10, "ndvi_expected_max": 0.20, "ndre_threshold": 0.10, "kc_value": 0.50, "gdd_target": 1880.0},
    ]

    # Seed data: Fase Fenologi BISI 18 (Jagung, 95 HST)
    phases_bisi_18 = [
        {"variety_id": 3, "phase_code": "P0", "phase_name": "Persiapan Lahan & Tugal Benih", "hst_start": 0, "hst_end": 0, "ndvi_expected_min": 0.05, "ndvi_expected_max": 0.15, "ndre_threshold": 0.05, "kc_value": 0.30, "gdd_target": 50.0},
        {"variety_id": 3, "phase_code": "VE-V2", "phase_name": "Muncul Tunas (Emergence) s.d Daun ke-2", "hst_start": 1, "hst_end": 12, "ndvi_expected_min": 0.12, "ndvi_expected_max": 0.25, "ndre_threshold": 0.10, "kc_value": 0.40, "gdd_target": 180.0},
        {"variety_id": 3, "phase_code": "V3-V5", "phase_name": "Fase Daun ke-3 s.d ke-5", "hst_start": 13, "hst_end": 25, "ndvi_expected_min": 0.20, "ndvi_expected_max": 0.40, "ndre_threshold": 0.20, "kc_value": 0.60, "gdd_target": 380.0},
        {"variety_id": 3, "phase_code": "V6-V8", "phase_name": "Inisiasi Jumlah Baris Biji & Pertumbuhan Cepat", "hst_start": 26, "hst_end": 40, "ndvi_expected_min": 0.40, "ndvi_expected_max": 0.70, "ndre_threshold": 0.38, "kc_value": 0.90, "gdd_target": 620.0},
        {"variety_id": 3, "phase_code": "V10-V14", "phase_name": "Elongasi Batang (Stem Elongation)", "hst_start": 41, "hst_end": 55, "ndvi_expected_min": 0.70, "ndvi_expected_max": 0.85, "ndre_threshold": 0.48, "kc_value": 1.10, "gdd_target": 880.0},
        {"variety_id": 3, "phase_code": "VT/R1", "phase_name": "Berbunga (Tasseling) & Keluar Rambut (Silking)", "hst_start": 56, "hst_end": 65, "ndvi_expected_min": 0.75, "ndvi_expected_max": 0.88, "ndre_threshold": 0.52, "kc_value": 1.15, "gdd_target": 1100.0},
        {"variety_id": 3, "phase_code": "R2-R4", "phase_name": "Pengisian Biji (Blister, Milk, Dough)", "hst_start": 66, "hst_end": 82, "ndvi_expected_min": 0.60, "ndvi_expected_max": 0.80, "ndre_threshold": 0.42, "kc_value": 1.00, "gdd_target": 1400.0},
        {"variety_id": 3, "phase_code": "R5-R6", "phase_name": "Pembentukan Lekukan & Masak Fisiologis", "hst_start": 83, "hst_end": 95, "ndvi_expected_min": 0.30, "ndvi_expected_max": 0.55, "ndre_threshold": 0.25, "kc_value": 0.70, "gdd_target": 1650.0},
        {"variety_id": 3, "phase_code": "P1", "phase_name": "Panen (Harvesting)", "hst_start": 96, "hst_end": 105, "ndvi_expected_min": 0.10, "ndvi_expected_max": 0.20, "ndre_threshold": 0.10, "kc_value": 0.40, "gdd_target": 1780.0},
    ]

    # Seed data: Fase Fenologi Pioneer P35 (Jagung, 100 HST)
    phases_pioneer_p35 = [
        {"variety_id": 4, "phase_code": "P0", "phase_name": "Persiapan Lahan & Tugal Benih", "hst_start": 0, "hst_end": 0, "ndvi_expected_min": 0.05, "ndvi_expected_max": 0.15, "ndre_threshold": 0.05, "kc_value": 0.30, "gdd_target": 50.0},
        {"variety_id": 4, "phase_code": "VE-V2", "phase_name": "Muncul Tunas (Emergence) s.d Daun ke-2", "hst_start": 1, "hst_end": 12, "ndvi_expected_min": 0.12, "ndvi_expected_max": 0.25, "ndre_threshold": 0.10, "kc_value": 0.40, "gdd_target": 185.0},
        {"variety_id": 4, "phase_code": "V3-V5", "phase_name": "Fase Daun ke-3 s.d ke-5", "hst_start": 13, "hst_end": 26, "ndvi_expected_min": 0.20, "ndvi_expected_max": 0.40, "ndre_threshold": 0.20, "kc_value": 0.60, "gdd_target": 400.0},
        {"variety_id": 4, "phase_code": "V6-V8", "phase_name": "Inisiasi Jumlah Baris Biji & Pertumbuhan Cepat", "hst_start": 27, "hst_end": 42, "ndvi_expected_min": 0.40, "ndvi_expected_max": 0.70, "ndre_threshold": 0.38, "kc_value": 0.90, "gdd_target": 650.0},
        {"variety_id": 4, "phase_code": "V10-V14", "phase_name": "Elongasi Batang (Stem Elongation)", "hst_start": 43, "hst_end": 57, "ndvi_expected_min": 0.70, "ndvi_expected_max": 0.85, "ndre_threshold": 0.48, "kc_value": 1.10, "gdd_target": 920.0},
        {"variety_id": 4, "phase_code": "VT/R1", "phase_name": "Berbunga (Tasseling) & Keluar Rambut (Silking)", "hst_start": 58, "hst_end": 68, "ndvi_expected_min": 0.75, "ndvi_expected_max": 0.88, "ndre_threshold": 0.52, "kc_value": 1.15, "gdd_target": 1150.0},
        {"variety_id": 4, "phase_code": "R2-R4", "phase_name": "Pengisian Biji (Blister, Milk, Dough)", "hst_start": 69, "hst_end": 86, "ndvi_expected_min": 0.60, "ndvi_expected_max": 0.80, "ndre_threshold": 0.42, "kc_value": 1.00, "gdd_target": 1480.0},
        {"variety_id": 4, "phase_code": "R5-R6", "phase_name": "Pembentukan Lekukan & Masak Fisiologis", "hst_start": 87, "hst_end": 100, "ndvi_expected_min": 0.30, "ndvi_expected_max": 0.55, "ndre_threshold": 0.25, "kc_value": 0.70, "gdd_target": 1740.0},
        {"variety_id": 4, "phase_code": "P1", "phase_name": "Panen (Harvesting)", "hst_start": 101, "hst_end": 110, "ndvi_expected_min": 0.10, "ndvi_expected_max": 0.20, "ndre_threshold": 0.10, "kc_value": 0.40, "gdd_target": 1850.0},
    ]

    all_phases = phases_inpari_32 + phases_ciherang + phases_bisi_18 + phases_pioneer_p35
    op.bulk_insert(phases_table, all_phases)


def downgrade() -> None:
    op.drop_index(op.f("ix_phenology_phases_variety_id"), table_name="phenology_phases")
    op.drop_index(op.f("ix_phenology_phases_id"), table_name="phenology_phases")
    op.drop_table("phenology_phases")

    op.drop_index(op.f("ix_crop_varieties_name"), table_name="crop_varieties")
    op.drop_index(op.f("ix_crop_varieties_crop_type"), table_name="crop_varieties")
    op.drop_index(op.f("ix_crop_varieties_id"), table_name="crop_varieties")
    op.drop_table("crop_varieties")
