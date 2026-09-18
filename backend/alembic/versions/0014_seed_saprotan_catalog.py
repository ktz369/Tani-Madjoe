"""Seed the saprotan catalog (OPS-04 sprint 1 requirement).

The frontend `SaprotanApplicationModal` offers a catalog picker, but no UI exists to
create catalog entries yet. Without seed data the picker is empty, so the operational
guardrail (PHI) can never be exercised. Idempotent: skips when the table is non-empty.

Revision ID: 0014_seed_saprotan_catalog
Revises: 0013_create_missing_operational_tables
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014_seed_saprotan_catalog"
down_revision: Union[str, None] = "0013_create_missing_operational_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# name, category, active_ingredient, phi_days, unit, unit_cost, stock_qty
CATALOG = [
    ("Urea Prill 46% N", "pupuk_makro", "Nitrogen (N) 46%", 0, "kg", 2800.0, 500.0),
    ("NPK Phonska 15-15-15", "pupuk_makro", "N 15%, P2O5 15%, K2O 15%", 0, "kg", 4200.0, 500.0),
    ("Pupuk Mikro ZnSO4", "pupuk_mikro", "Zinc Sulfat (Zn) 20%", 0, "kg", 15000.0, 100.0),
    ("Pestisida Fipronil 5% SC", "pestisida", "Fipronil 5%", 21, "liter", 95000.0, 40.0),
    ("Insektisida Karbofuran 3% G", "pestisida", "Karbofuran 3%", 30, "kg", 32000.0, 60.0),
]


def upgrade() -> None:
    conn = op.get_bind()
    existing = conn.execute(sa.text("SELECT COUNT(*) FROM saprotan_items")).scalar()
    if existing and int(existing) > 0:
        return
    for name, category, ingredient, phi_days, unit, unit_cost, stock_qty in CATALOG:
        conn.execute(
            sa.text(
                """
                INSERT INTO saprotan_items
                    (name, category, active_ingredient, phi_days, unit, unit_cost, stock_qty)
                VALUES
                    (:name, CAST(:category AS saprotan_category_enum), :ingredient,
                     :phi_days, :unit, :unit_cost, :stock_qty)
                """
            ),
            {
                "name": name,
                "category": category,
                "ingredient": ingredient,
                "phi_days": phi_days,
                "unit": unit,
                "unit_cost": unit_cost,
                "stock_qty": stock_qty,
            },
        )


def downgrade() -> None:
    op.get_bind().execute(
        sa.text(
            "DELETE FROM saprotan_items WHERE name IN "
            "('Urea Prill 46% N', 'NPK Phonska 15-15-15', 'Pupuk Mikro ZnSO4', "
            "'Pestisida Fipronil 5% SC', 'Insektisida Karbofuran 3% G')"
        )
    )
