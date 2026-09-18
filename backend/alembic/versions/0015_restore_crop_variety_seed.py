"""Restore the deleted crop-variety seeds (4 varietas + fase fenologi).

2026-09-18: seluruh baris `crop_varieties` dan `phenology_phases` terhapus via UI admin,
sehingga semua petak kehilangan varietas, fase fenologi, dan proyeksi hasil (GDD/VRN).
Migrasi ini mengembalikan seed bawaan 0004 secara **idempotent**:
- varietas dilewati bila (crop_type, name) sudah ada;
- fase fenologi hanya dibuat bila varietas tersebut belum punya fase.

Revision ID: 0015_restore_crop_variety_seed
Revises: 0014_seed_saprotan_catalog
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0015_restore_crop_variety_seed"
down_revision: Union[str, None] = "0014_seed_saprotan_catalog"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

VARIETIES = [
    (1, "padi", "Inpari 32", 120, 10.0),
    (2, "padi", "Ciherang", 116, 10.0),
    (3, "jagung", "BISI 18", 95, 10.0),
    (4, "jagung", "Pioneer P35", 100, 10.0),
]

PHASES = {
    1: [
        {'phase_code': 'P0', 'phase_name': 'Olah Tanah & Pembibitan', 'hst_start': 0, 'hst_end': 0, 'ndvi_expected_min': 0.05, 'ndvi_expected_max': 0.15, 'ndre_threshold': 0.05, 'kc_value': 1.05, 'gdd_target': 50.0},
        {'phase_code': 'V1', 'phase_name': 'Transplanting / Tabela & Pemulihan', 'hst_start': 1, 'hst_end': 10, 'ndvi_expected_min': 0.1, 'ndvi_expected_max': 0.2, 'ndre_threshold': 0.1, 'kc_value': 1.05, 'gdd_target': 150.0},
        {'phase_code': 'V2', 'phase_name': 'Pertunasan / Anakan Aktif (Tillering)', 'hst_start': 11, 'hst_end': 30, 'ndvi_expected_min': 0.25, 'ndvi_expected_max': 0.55, 'ndre_threshold': 0.25, 'kc_value': 1.1, 'gdd_target': 450.0},
        {'phase_code': 'V3', 'phase_name': 'Anakan Maksimum & Inisiasi Malai (PI)', 'hst_start': 31, 'hst_end': 50, 'ndvi_expected_min': 0.55, 'ndvi_expected_max': 0.75, 'ndre_threshold': 0.4, 'kc_value': 1.15, 'gdd_target': 750.0},
        {'phase_code': 'R1', 'phase_name': 'Fase Bunting (Booting)', 'hst_start': 51, 'hst_end': 65, 'ndvi_expected_min': 0.75, 'ndvi_expected_max': 0.88, 'ndre_threshold': 0.5, 'kc_value': 1.2, 'gdd_target': 1000.0},
        {'phase_code': 'R2', 'phase_name': 'Keluar Malai (Heading) & Berbunga (Anthesis)', 'hst_start': 66, 'hst_end': 75, 'ndvi_expected_min': 0.75, 'ndvi_expected_max': 0.85, 'ndre_threshold': 0.48, 'kc_value': 1.2, 'gdd_target': 1200.0},
        {'phase_code': 'R3', 'phase_name': 'Pengisian Bulir (Masak Susu & Masak Kuning)', 'hst_start': 76, 'hst_end': 95, 'ndvi_expected_min': 0.55, 'ndvi_expected_max': 0.8, 'ndre_threshold': 0.38, 'kc_value': 1.05, 'gdd_target': 1500.0},
        {'phase_code': 'R4', 'phase_name': 'Masak Penuh / Fisiologis (Maturity)', 'hst_start': 96, 'hst_end': 115, 'ndvi_expected_min': 0.3, 'ndvi_expected_max': 0.45, 'ndre_threshold': 0.25, 'kc_value': 0.9, 'gdd_target': 1800.0},
        {'phase_code': 'P1', 'phase_name': 'Pasca-Panen (Harvesting & Fallow)', 'hst_start': 116, 'hst_end': 125, 'ndvi_expected_min': 0.1, 'ndvi_expected_max': 0.2, 'ndre_threshold': 0.1, 'kc_value': 0.5, 'gdd_target': 1950.0},
    ],
    2: [
        {'phase_code': 'P0', 'phase_name': 'Olah Tanah & Pembibitan', 'hst_start': 0, 'hst_end': 0, 'ndvi_expected_min': 0.05, 'ndvi_expected_max': 0.15, 'ndre_threshold': 0.05, 'kc_value': 1.05, 'gdd_target': 50.0},
        {'phase_code': 'V1', 'phase_name': 'Transplanting / Tabela & Pemulihan', 'hst_start': 1, 'hst_end': 10, 'ndvi_expected_min': 0.1, 'ndvi_expected_max': 0.2, 'ndre_threshold': 0.1, 'kc_value': 1.05, 'gdd_target': 150.0},
        {'phase_code': 'V2', 'phase_name': 'Pertunasan / Anakan Aktif (Tillering)', 'hst_start': 11, 'hst_end': 28, 'ndvi_expected_min': 0.25, 'ndvi_expected_max': 0.55, 'ndre_threshold': 0.25, 'kc_value': 1.1, 'gdd_target': 420.0},
        {'phase_code': 'V3', 'phase_name': 'Anakan Maksimum & Inisiasi Malai (PI)', 'hst_start': 29, 'hst_end': 48, 'ndvi_expected_min': 0.55, 'ndvi_expected_max': 0.75, 'ndre_threshold': 0.4, 'kc_value': 1.15, 'gdd_target': 720.0},
        {'phase_code': 'R1', 'phase_name': 'Fase Bunting (Booting)', 'hst_start': 49, 'hst_end': 62, 'ndvi_expected_min': 0.75, 'ndvi_expected_max': 0.88, 'ndre_threshold': 0.5, 'kc_value': 1.2, 'gdd_target': 960.0},
        {'phase_code': 'R2', 'phase_name': 'Keluar Malai (Heading) & Berbunga (Anthesis)', 'hst_start': 63, 'hst_end': 72, 'ndvi_expected_min': 0.75, 'ndvi_expected_max': 0.85, 'ndre_threshold': 0.48, 'kc_value': 1.2, 'gdd_target': 1150.0},
        {'phase_code': 'R3', 'phase_name': 'Pengisian Bulir (Masak Susu & Masak Kuning)', 'hst_start': 73, 'hst_end': 92, 'ndvi_expected_min': 0.55, 'ndvi_expected_max': 0.8, 'ndre_threshold': 0.38, 'kc_value': 1.05, 'gdd_target': 1450.0},
        {'phase_code': 'R4', 'phase_name': 'Masak Penuh / Fisiologis (Maturity)', 'hst_start': 93, 'hst_end': 110, 'ndvi_expected_min': 0.3, 'ndvi_expected_max': 0.45, 'ndre_threshold': 0.25, 'kc_value': 0.9, 'gdd_target': 1720.0},
        {'phase_code': 'P1', 'phase_name': 'Pasca-Panen (Harvesting & Fallow)', 'hst_start': 111, 'hst_end': 120, 'ndvi_expected_min': 0.1, 'ndvi_expected_max': 0.2, 'ndre_threshold': 0.1, 'kc_value': 0.5, 'gdd_target': 1880.0},
    ],
    3: [
        {'phase_code': 'P0', 'phase_name': 'Persiapan Lahan & Tugal Benih', 'hst_start': 0, 'hst_end': 0, 'ndvi_expected_min': 0.05, 'ndvi_expected_max': 0.15, 'ndre_threshold': 0.05, 'kc_value': 0.3, 'gdd_target': 50.0},
        {'phase_code': 'VE-V2', 'phase_name': 'Muncul Tunas (Emergence) s.d Daun ke-2', 'hst_start': 1, 'hst_end': 12, 'ndvi_expected_min': 0.12, 'ndvi_expected_max': 0.25, 'ndre_threshold': 0.1, 'kc_value': 0.4, 'gdd_target': 180.0},
        {'phase_code': 'V3-V5', 'phase_name': 'Fase Daun ke-3 s.d ke-5', 'hst_start': 13, 'hst_end': 25, 'ndvi_expected_min': 0.2, 'ndvi_expected_max': 0.4, 'ndre_threshold': 0.2, 'kc_value': 0.6, 'gdd_target': 380.0},
        {'phase_code': 'V6-V8', 'phase_name': 'Inisiasi Jumlah Baris Biji & Pertumbuhan Cepat', 'hst_start': 26, 'hst_end': 40, 'ndvi_expected_min': 0.4, 'ndvi_expected_max': 0.7, 'ndre_threshold': 0.38, 'kc_value': 0.9, 'gdd_target': 620.0},
        {'phase_code': 'V10-V14', 'phase_name': 'Elongasi Batang (Stem Elongation)', 'hst_start': 41, 'hst_end': 55, 'ndvi_expected_min': 0.7, 'ndvi_expected_max': 0.85, 'ndre_threshold': 0.48, 'kc_value': 1.1, 'gdd_target': 880.0},
        {'phase_code': 'VT/R1', 'phase_name': 'Berbunga (Tasseling) & Keluar Rambut (Silking)', 'hst_start': 56, 'hst_end': 65, 'ndvi_expected_min': 0.75, 'ndvi_expected_max': 0.88, 'ndre_threshold': 0.52, 'kc_value': 1.15, 'gdd_target': 1100.0},
        {'phase_code': 'R2-R4', 'phase_name': 'Pengisian Biji (Blister, Milk, Dough)', 'hst_start': 66, 'hst_end': 82, 'ndvi_expected_min': 0.6, 'ndvi_expected_max': 0.8, 'ndre_threshold': 0.42, 'kc_value': 1.0, 'gdd_target': 1400.0},
        {'phase_code': 'R5-R6', 'phase_name': 'Pembentukan Lekukan & Masak Fisiologis', 'hst_start': 83, 'hst_end': 95, 'ndvi_expected_min': 0.3, 'ndvi_expected_max': 0.55, 'ndre_threshold': 0.25, 'kc_value': 0.7, 'gdd_target': 1650.0},
        {'phase_code': 'P1', 'phase_name': 'Panen (Harvesting)', 'hst_start': 96, 'hst_end': 105, 'ndvi_expected_min': 0.1, 'ndvi_expected_max': 0.2, 'ndre_threshold': 0.1, 'kc_value': 0.4, 'gdd_target': 1780.0},
    ],
    4: [
        {'phase_code': 'P0', 'phase_name': 'Persiapan Lahan & Tugal Benih', 'hst_start': 0, 'hst_end': 0, 'ndvi_expected_min': 0.05, 'ndvi_expected_max': 0.15, 'ndre_threshold': 0.05, 'kc_value': 0.3, 'gdd_target': 50.0},
        {'phase_code': 'VE-V2', 'phase_name': 'Muncul Tunas (Emergence) s.d Daun ke-2', 'hst_start': 1, 'hst_end': 12, 'ndvi_expected_min': 0.12, 'ndvi_expected_max': 0.25, 'ndre_threshold': 0.1, 'kc_value': 0.4, 'gdd_target': 185.0},
        {'phase_code': 'V3-V5', 'phase_name': 'Fase Daun ke-3 s.d ke-5', 'hst_start': 13, 'hst_end': 26, 'ndvi_expected_min': 0.2, 'ndvi_expected_max': 0.4, 'ndre_threshold': 0.2, 'kc_value': 0.6, 'gdd_target': 400.0},
        {'phase_code': 'V6-V8', 'phase_name': 'Inisiasi Jumlah Baris Biji & Pertumbuhan Cepat', 'hst_start': 27, 'hst_end': 42, 'ndvi_expected_min': 0.4, 'ndvi_expected_max': 0.7, 'ndre_threshold': 0.38, 'kc_value': 0.9, 'gdd_target': 650.0},
        {'phase_code': 'V10-V14', 'phase_name': 'Elongasi Batang (Stem Elongation)', 'hst_start': 43, 'hst_end': 57, 'ndvi_expected_min': 0.7, 'ndvi_expected_max': 0.85, 'ndre_threshold': 0.48, 'kc_value': 1.1, 'gdd_target': 920.0},
        {'phase_code': 'VT/R1', 'phase_name': 'Berbunga (Tasseling) & Keluar Rambut (Silking)', 'hst_start': 58, 'hst_end': 68, 'ndvi_expected_min': 0.75, 'ndvi_expected_max': 0.88, 'ndre_threshold': 0.52, 'kc_value': 1.15, 'gdd_target': 1150.0},
        {'phase_code': 'R2-R4', 'phase_name': 'Pengisian Biji (Blister, Milk, Dough)', 'hst_start': 69, 'hst_end': 86, 'ndvi_expected_min': 0.6, 'ndvi_expected_max': 0.8, 'ndre_threshold': 0.42, 'kc_value': 1.0, 'gdd_target': 1480.0},
        {'phase_code': 'R5-R6', 'phase_name': 'Pembentukan Lekukan & Masak Fisiologis', 'hst_start': 87, 'hst_end': 100, 'ndvi_expected_min': 0.3, 'ndvi_expected_max': 0.55, 'ndre_threshold': 0.25, 'kc_value': 0.7, 'gdd_target': 1740.0},
        {'phase_code': 'P1', 'phase_name': 'Panen (Harvesting)', 'hst_start': 101, 'hst_end': 110, 'ndvi_expected_min': 0.1, 'ndvi_expected_max': 0.2, 'ndre_threshold': 0.1, 'kc_value': 0.4, 'gdd_target': 1850.0},
    ],
}


def upgrade() -> None:
    conn = op.get_bind()

    for seed_id, crop_type, name, cycle_days, t_base in VARIETIES:
        existing = conn.execute(
            sa.text("SELECT id FROM crop_varieties WHERE crop_type = :crop AND name = :name"),
            {"crop": crop_type, "name": name},
        ).scalar()
        if existing:
            variety_id = existing
        elif conn.execute(
            sa.text("SELECT 1 FROM crop_varieties WHERE id = :id"), {"id": seed_id}
        ).scalar():
            variety_id = conn.execute(
                sa.text(
                    "INSERT INTO crop_varieties (crop_type, name, cycle_days, t_base) "
                    "VALUES (:crop, :name, :cycle, :tbase) RETURNING id"
                ),
                {"crop": crop_type, "name": name, "cycle": cycle_days, "tbase": t_base},
            ).scalar()
        else:
            variety_id = seed_id
            conn.execute(
                sa.text(
                    "INSERT INTO crop_varieties (id, crop_type, name, cycle_days, t_base) "
                    "VALUES (:id, :crop, :name, :cycle, :tbase)"
                ),
                {
                    "id": seed_id,
                    "crop": crop_type,
                    "name": name,
                    "cycle": cycle_days,
                    "tbase": t_base,
                },
            )

        phase_count = conn.execute(
            sa.text("SELECT COUNT(*) FROM phenology_phases WHERE variety_id = :vid"),
            {"vid": variety_id},
        ).scalar()
        if phase_count:
            continue

        for phase in PHASES[seed_id]:
            conn.execute(
                sa.text(
                    "INSERT INTO phenology_phases "
                    "(variety_id, phase_code, phase_name, hst_start, hst_end, "
                    " ndvi_expected_min, ndvi_expected_max, ndre_threshold, kc_value, gdd_target) "
                    "VALUES (:vid, :code, :pname, :hs, :he, :nmin, :nmax, :ndre, :kc, :gdd)"
                ),
                {
                    "vid": variety_id,
                    "code": phase["phase_code"],
                    "pname": phase["phase_name"],
                    "hs": phase["hst_start"],
                    "he": phase["hst_end"],
                    "nmin": phase["ndvi_expected_min"],
                    "nmax": phase["ndvi_expected_max"],
                    "ndre": phase["ndre_threshold"],
                    "kc": phase["kc_value"],
                    "gdd": phase["gdd_target"],
                },
            )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text("DELETE FROM crop_varieties WHERE name IN ('Inpari 32','Ciherang','BISI 18','Pioneer P35')")
    )
