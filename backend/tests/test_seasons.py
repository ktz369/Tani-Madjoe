"""Unit and integration tests for Planting Season Management (Tiket 06).

Tests cover:
1. Creating first season successfully and verifying plot attributes are updated.
2. Preventing second active season while first season is still active (HTTP 400).
3. Updating season status to 'harvested' with harvest date & yield realization.
4. Allowing a new season once previous season is harvested.
5. Listing seasons ordered by planting_date desc and retrieving season detail.
"""

import unittest

try:
    from datetime import date
    import pytest
    import pytest_asyncio
    from httpx import ASGITransport, AsyncClient
    from sqlalchemy import event, select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
    from sqlalchemy.ext.compiler import compiles
    from geoalchemy2 import Geometry
    import geoalchemy2.admin.dialects.sqlite as sqlite_admin
    from shapely.geometry import Polygon
except ImportError as e:
    raise unittest.SkipTest(f"Integration dependencies not available in host environment: {e}")

# Compile geometry type as TEXT in SQLite for testing without spatialite binary
@compiles(Geometry, "sqlite")
def compile_geom_sqlite(element, compiler, **kw):
    return "TEXT"

sqlite_admin.before_create = lambda *args, **kwargs: None
sqlite_admin.after_create = lambda *args, **kwargs: None
sqlite_admin.before_drop = lambda *args, **kwargs: None
sqlite_admin.after_drop = lambda *args, **kwargs: None

from app.api.deps import get_current_user
from app.database import Base, get_db
from app.main import app
from app.models.company import Company
from app.models.crop_variety import CropVariety
from app.models.division import Division
from app.models.estate import Estate
from app.models.planting_season import PlantingSeason
from app.models.plot import Plot
from app.models.user import User

# Disable SpatiaLite DDL management on SQLite for testing
for table in Base.metadata.tables.values():
    for col in table.columns:
        if isinstance(col.type, Geometry):
            col.type.management = False
            col.type.spatial_index = False

DUMMY_WKB = Polygon([(0, 0), (1, 0), (1, 1), (0, 1), (0, 0)]).wkb


@pytest_asyncio.fixture
async def test_db_session():
    """Create an in-memory SQLite async database engine and yield sessionmaker."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        future=True,
    )

    @event.listens_for(engine.sync_engine, "connect")
    def do_connect(dbapi_connection, connection_record):
        dbapi_connection.create_function("GeomFromEWKT", 1, lambda x: x)
        dbapi_connection.create_function("ST_GeomFromEWKT", 1, lambda x: x)
        dbapi_connection.create_function("AsEWKB", 1, lambda x: DUMMY_WKB)
        dbapi_connection.create_function("ST_AsEWKB", 1, lambda x: DUMMY_WKB)
        dbapi_connection.create_function("AsBinary", 1, lambda x: DUMMY_WKB)
        dbapi_connection.create_function("ST_AsBinary", 1, lambda x: DUMMY_WKB)
        dbapi_connection.create_function("ST_AsGeoJSON", 1, lambda x: '{"type":"Polygon","coordinates":[]}')
        dbapi_connection.create_function("AsGeoJSON", 1, lambda x: '{"type":"Polygon","coordinates":[]}')
        dbapi_connection.create_function("ST_Area", 1, lambda x: 10000.0)
        dbapi_connection.create_function("CheckSpatialIndex", 2, lambda a, b: 0)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )

    yield session_factory

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def client(test_db_session):
    """FastAPI async test client with mocked DB session and current_user."""
    mock_user = User(
        id=1,
        email="agronom@tani.id",
        name="Agronomist User",
        role="agronomist",
    )

    async def override_get_db():
        async with test_db_session() as session:
            try:
                yield session
            finally:
                await session.close()

    async def override_get_current_user():
        return mock_user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def setup_seed_data(test_db_session):
    """Seed prerequisite Company, Estate, Division, CropVarieties, and Plot."""
    async with test_db_session() as session:
        comp = Company(name="PT Agro Makmur Nusantara")
        session.add(comp)
        await session.flush()

        est = Estate(
            company_id=comp.id,
            name="Kebun Karawang",
            location_point="POINT(107.3 -6.3)",
        )
        session.add(est)
        await session.flush()

        div = Division(
            estate_id=est.id,
            name="Divisi A",
        )
        session.add(div)
        await session.flush()

        # Seed 2 crop varieties
        var_padi = CropVariety(
            crop_type="padi",
            name="Inpari 32",
            cycle_days=115,
            t_base=10.0,
        )
        var_jagung = CropVariety(
            crop_type="jagung",
            name="Pioneer P27",
            cycle_days=105,
            t_base=8.0,
        )
        session.add_all([var_padi, var_jagung])
        await session.flush()

        # Seed 1 plot
        plot = Plot(
            division_id=div.id,
            name="Petak P-01",
            polygon="POLYGON((107.3 -6.3, 107.31 -6.3, 107.31 -6.29, 107.3 -6.29, 107.3 -6.3))",
            area_hectares=2.5,
            crop_type="jagung",  # initially jagung
            planting_date=None,
        )
        session.add(plot)
        await session.commit()

        return {
            "plot_id": plot.id,
            "var_padi_id": var_padi.id,
            "var_jagung_id": var_jagung.id,
        }


@pytest.mark.asyncio
async def test_create_first_season_updates_plot(client, test_db_session, setup_seed_data):
    """Test creating a planting season successfully and verifying plot attributes update."""
    plot_id = setup_seed_data["plot_id"]
    variety_id = setup_seed_data["var_padi_id"]

    payload = {
        "variety_id": variety_id,
        "planting_date": "2026-09-01",
        "yield_estimate_ton_per_ha": 6.5,
        "notes": "Penanaman bibit unggul Inpari 32 musim hujan",
    }

    response = await client.post(f"/api/plots/{plot_id}/seasons", json=payload)
    assert response.status_code == 201, response.text
    data = response.json()

    assert data["plot_id"] == plot_id
    assert data["variety_id"] == variety_id
    assert data["variety_name"] == "Inpari 32"
    assert data["crop_type"] == "padi"
    assert data["planting_date"] == "2026-09-01"
    assert data["harvest_date"] is None
    assert data["status"] == "active"
    assert data["yield_estimate_ton_per_ha"] == 6.5
    assert data["notes"] == payload["notes"]

    # Verify that plot was automatically updated
    async with test_db_session() as session:
        res = await session.execute(select(Plot).where(Plot.id == plot_id))
        plot = res.scalar_one()
        assert plot.planting_date == date(2026, 9, 1)
        assert plot.variety_id == variety_id
        assert plot.crop_type == "padi"


@pytest.mark.asyncio
async def test_prevent_second_active_season(client, setup_seed_data):
    """Test that creating a second active season on the same plot is rejected with HTTP 400."""
    plot_id = setup_seed_data["plot_id"]
    var_padi_id = setup_seed_data["var_padi_id"]
    var_jagung_id = setup_seed_data["var_jagung_id"]

    # 1. Create first active season
    payload_1 = {
        "variety_id": var_padi_id,
        "planting_date": "2026-09-01",
        "yield_estimate_ton_per_ha": 6.5,
    }
    resp1 = await client.post(f"/api/plots/{plot_id}/seasons", json=payload_1)
    assert resp1.status_code == 201

    # 2. Attempt to create second active season without harvesting first
    payload_2 = {
        "variety_id": var_jagung_id,
        "planting_date": "2026-09-05",
        "yield_estimate_ton_per_ha": 7.0,
    }
    resp2 = await client.post(f"/api/plots/{plot_id}/seasons", json=payload_2)
    assert resp2.status_code == 400
    assert "masih memiliki musim tanam yang aktif" in resp2.json()["detail"]


@pytest.mark.asyncio
async def test_update_season_status_to_harvested_and_start_new(client, setup_seed_data):
    """Test updating season to harvested, and subsequently creating a new active season."""
    plot_id = setup_seed_data["plot_id"]
    var_padi_id = setup_seed_data["var_padi_id"]
    var_jagung_id = setup_seed_data["var_jagung_id"]

    # 1. Create season
    resp1 = await client.post(
        f"/api/plots/{plot_id}/seasons",
        json={
            "variety_id": var_padi_id,
            "planting_date": "2026-05-01",
            "yield_estimate_ton_per_ha": 6.0,
        },
    )
    season_id = resp1.json()["id"]

    # 2. Update to harvested
    update_payload = {
        "status": "harvested",
        "harvest_date": "2026-08-25",
        "yield_estimate_ton_per_ha": 6.4,
        "notes": "Panen raya berhasil dengan hasil melebihi estimasi",
    }
    resp_update = await client.put(f"/api/seasons/{season_id}", json=update_payload)
    assert resp_update.status_code == 200
    updated_data = resp_update.json()
    assert updated_data["status"] == "harvested"
    assert updated_data["harvest_date"] == "2026-08-25"
    assert updated_data["yield_estimate_ton_per_ha"] == 6.4
    assert updated_data["notes"] == update_payload["notes"]

    # 3. Verify that a new active season can now be created
    resp_new = await client.post(
        f"/api/plots/{plot_id}/seasons",
        json={
            "variety_id": var_jagung_id,
            "planting_date": "2026-09-01",
            "yield_estimate_ton_per_ha": 8.0,
        },
    )
    assert resp_new.status_code == 201
    assert resp_new.json()["status"] == "active"
    assert resp_new.json()["crop_type"] == "jagung"


@pytest.mark.asyncio
async def test_list_plot_seasons_and_get_detail(client, setup_seed_data):
    """Test retrieving list of seasons ordered by planting_date desc and single season detail."""
    plot_id = setup_seed_data["plot_id"]
    var_padi_id = setup_seed_data["var_padi_id"]

    # Create season 1
    resp1 = await client.post(
        f"/api/plots/{plot_id}/seasons",
        json={
            "variety_id": var_padi_id,
            "planting_date": "2026-01-10",
        },
    )
    s1_id = resp1.json()["id"]

    # Complete season 1
    await client.put(f"/api/seasons/{s1_id}", json={"status": "harvested", "harvest_date": "2026-04-20"})

    # Create season 2 (later planting date)
    resp2 = await client.post(
        f"/api/plots/{plot_id}/seasons",
        json={
            "variety_id": var_padi_id,
            "planting_date": "2026-05-15",
        },
    )
    s2_id = resp2.json()["id"]

    # List seasons
    list_resp = await client.get(f"/api/plots/{plot_id}/seasons")
    assert list_resp.status_code == 200
    seasons_list = list_resp.json()
    assert len(seasons_list) == 2
    # Ensure descending order by planting_date
    assert seasons_list[0]["id"] == s2_id
    assert seasons_list[1]["id"] == s1_id

    # Get single detail
    detail_resp = await client.get(f"/api/seasons/{s1_id}")
    assert detail_resp.status_code == 200
    assert detail_resp.json()["id"] == s1_id
    assert detail_resp.json()["status"] == "harvested"

    # Not found case
    not_found = await client.get("/api/seasons/99999")
    assert not_found.status_code == 404
