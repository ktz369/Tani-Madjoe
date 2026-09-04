"""Create organization hierarchy tables (companies, estates, divisions)

Revision ID: 0003_create_org_tables
Revises: 0002_create_users_table
Create Date: 2026-09-01 02:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
import geoalchemy2

revision: str = "0003_create_org_tables"
down_revision: Union[str, None] = "0002_create_users_table"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create companies table
    companies_table = op.create_table(
        "companies",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_companies_id"), "companies", ["id"], unique=False)
    op.create_index(op.f("ix_companies_name"), "companies", ["name"], unique=False)

    # 2. Create estates table
    estates_table = op.create_table(
        "estates",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column(
            "location_point",
            geoalchemy2.types.Geometry(
                geometry_type="POINT",
                srid=4326,
                from_text="ST_GeomFromEWKT",
                name="geometry",
                nullable=True,
            ),
            nullable=True,
        ),
        sa.Column("province", sa.String(length=100), nullable=True),
        sa.Column("kabupaten", sa.String(length=100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["company_id"],
            ["companies.id"],
            name="fk_estates_company_id_companies",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_estates_id"), "estates", ["id"], unique=False)
    op.create_index(op.f("ix_estates_company_id"), "estates", ["company_id"], unique=False)
    op.create_index(op.f("ix_estates_name"), "estates", ["name"], unique=False)

    # 3. Create divisions table
    divisions_table = op.create_table(
        "divisions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("estate_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["estate_id"],
            ["estates.id"],
            name="fk_divisions_estate_id_estates",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_divisions_id"), "divisions", ["id"], unique=False)
    op.create_index(op.f("ix_divisions_estate_id"), "divisions", ["estate_id"], unique=False)
    op.create_index(op.f("ix_divisions_name"), "divisions", ["name"], unique=False)

    # 4. Seed initial default sample company, estate, and divisions
    op.execute(
        """
        INSERT INTO companies (id, name, address, created_at)
        VALUES (1, 'PT Agro Nusantara Mandiri', 'Gedung Agro Plaza Lt. 12, Jl. HR Rasuna Said Kav. X-2 No. 1, Jakarta Selatan', now())
        ON CONFLICT (id) DO NOTHING;
        """
    )
    op.execute(
        """
        INSERT INTO estates (id, company_id, name, location_point, province, kabupaten, created_at)
        VALUES 
            (1, 1, 'Estate Riau Permai', ST_SetSRID(ST_MakePoint(101.8524, 0.5532), 4326), 'Riau', 'Pelalawan', now()),
            (2, 1, 'Estate Sumut Makmur', ST_SetSRID(ST_MakePoint(99.8211, 2.1543), 4326), 'Sumatera Utara', 'Labuhanbatu', now())
        ON CONFLICT (id) DO NOTHING;
        """
    )
    op.execute(
        """
        INSERT INTO divisions (id, estate_id, name, created_at)
        VALUES 
            (1, 1, 'Divisi I - Afdeling Anggrek', now()),
            (2, 1, 'Divisi II - Afdeling Bougenville', now()),
            (3, 2, 'Divisi I - Afdeling Sawit Unggul', now())
        ON CONFLICT (id) DO NOTHING;
        """
    )
    # Advance sequence counters to prevent id conflicts on subsequent inserts
    op.execute("SELECT setval(pg_get_serial_sequence('companies', 'id'), coalesce(max(id), 1)) FROM companies;")
    op.execute("SELECT setval(pg_get_serial_sequence('estates', 'id'), coalesce(max(id), 1)) FROM estates;")
    op.execute("SELECT setval(pg_get_serial_sequence('divisions', 'id'), coalesce(max(id), 1)) FROM divisions;")


def downgrade() -> None:
    op.drop_index(op.f("ix_divisions_name"), table_name="divisions")
    op.drop_index(op.f("ix_divisions_estate_id"), table_name="divisions")
    op.drop_index(op.f("ix_divisions_id"), table_name="divisions")
    op.drop_table("divisions")

    op.drop_index(op.f("ix_estates_name"), table_name="estates")
    op.drop_index(op.f("ix_estates_company_id"), table_name="estates")
    op.drop_index(op.f("ix_estates_id"), table_name="estates")
    op.drop_table("estates")

    op.drop_index(op.f("ix_companies_name"), table_name="companies")
    op.drop_index(op.f("ix_companies_id"), table_name="companies")
    op.drop_table("companies")
