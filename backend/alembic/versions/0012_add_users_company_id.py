"""Add users.company_id (missing in 0002) required by the User model

Revision ID: 0012_add_users_company_id
Revises: 0011_create_generated_reports_table
Create Date: 2026-09-18 12:45:00.000000

Deploy patch (host srv1081256):
`app/models/user.py` declares `company_id -> companies.id`, but migration
`0002_create_users_table` never creates the column, so every query on User
(e.g. POST /api/auth/login) fails with:
    UndefinedColumnError: column users.company_id does not exist
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0012_add_users_company_id"
down_revision: Union[str, None] = "0011_create_generated_reports_table"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS company_id INTEGER
        REFERENCES companies(id) ON DELETE SET NULL
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_users_company_id ON users (company_id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_users_company_id")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS company_id")
