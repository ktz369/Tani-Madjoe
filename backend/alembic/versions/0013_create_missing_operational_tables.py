"""Create operational tables that exist in models but had no migration

Revision ID: 0013_create_missing_operational_tables
Revises: 0012_add_users_company_id
Create Date: 2026-09-18 13:35:00.000000

Deploy patch (host srv1081256):
Models declare these tables but no migration ever created them:
  pest_scouting_reports, plot_irrigation_logs, plot_labor_logs,
  plot_saprotan_applications, post_harvest_logs, saprotan_items
They caused runtime 500s, e.g. deleting a plot:
  UndefinedTableError: relation "plot_labor_logs" does not exist
(because Plot has ORM relationships that are loaded for cascade delete).

Uses Base.metadata.create_all(), which is checkfirst by default, so it only
creates the missing tables and never touches existing ones.
"""
from typing import Sequence, Union
from alembic import op

from app.database import Base
import app.models  # noqa: F401  (registers all models on Base.metadata)

revision: str = "0013_create_missing_operational_tables"
down_revision: Union[str, None] = "0012_add_users_company_id"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

MISSING_TABLES = [
    "saprotan_items",
    "pest_scouting_reports",
    "plot_irrigation_logs",
    "plot_labor_logs",
    "plot_saprotan_applications",
    "post_harvest_logs",
]


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    bind = op.get_bind()
    for table_name in MISSING_TABLES:
        table = Base.metadata.tables.get(table_name)
        if table is not None:
            table.drop(bind=bind, checkfirst=True)
