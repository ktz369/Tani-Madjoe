"""Create users table and seed initial admin user

Revision ID: 0002_create_users_table
Revises: 0001_initial_postgis
Create Date: 2026-09-01 02:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from passlib.context import CryptContext

revision: str = "0002_create_users_table"
down_revision: Union[str, None] = "0001_initial_postgis"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def upgrade() -> None:
    # 1. Create users table
    users_table = op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=50), server_default="user", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_id"), "users", ["id"], unique=False)

    # 2. Seed initial default admin user: admin@tani.local / admin123
    admin_password_hash = pwd_context.hash("admin123")

    op.bulk_insert(
        users_table,
        [
            {
                "email": "admin@tani.local",
                "password_hash": admin_password_hash,
                "name": "Administrator Tani",
                "role": "admin",
            }
        ],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_users_id"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
