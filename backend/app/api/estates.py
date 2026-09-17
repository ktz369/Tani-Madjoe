from datetime import date, timedelta
from typing import Dict, List, Optional, Set
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.database import get_db
from app.models.company import Company
from app.models.crop_variety import CropVariety
from app.models.division import Division
from app.models.estate import Estate
from app.models.plot import Plot
from app.models.spectral_index import SpectralIndex
from app.models.user import User
from app.schemas.division import DivisionCreate, DivisionResponse
from app.schemas.estate import (
    EstateCreate,
    EstateDashboardPlotItem,
    EstateDashboardSummaryResponse,
    EstateDetailResponse,
    EstateIndicesTimelineResponse,
    EstateResponse,
    EstateUpdate,
)
from app.schemas.satellite import PlotSatelliteTileResponse
from app.services.gee_service import generate_synthetic_satellite_observation, get_map_tile
from app.utils.geo import coordinates_from_point, geojson_from_polygon, point_from_coordinates

router = APIRouter(prefix="/estates", tags=["Perkebunan (Estates)"])


def _to_estate_response(estate: Estate) -> EstateResponse:
    """Helper to convert Estate ORM model to EstateResponse with parsed coordinates."""
    lat, lng = coordinates_from_point(estate.location_point)
    div_count = len(estate.divisions) if estate.divisions is not None else 0
    petak_total = 0
    if estate.divisions:
        for d in estate.divisions:
            if hasattr(d, "plots") and d.plots is not None:
                petak_total += len(d.plots)

    return EstateResponse(
        id=estate.id,
        company_id=estate.company_id,
        name=estate.name,
        province=estate.province,
        kabupaten=estate.kabupaten,
        latitude=lat,
        longitude=lng,
        created_at=estate.created_at,
        division_count=div_count,
        petak_count=petak_total,
        company_name=estate.company.name if estate.company else None,
    )


def _to_division_response(division: Division, estate: Optional[Estate] = None) -> DivisionResponse:
    """Helper to convert Division ORM model to DivisionResponse."""
    est = estate or division.estate
    plot_cnt = len(division.plots) if hasattr(division, "plots") and division.plots is not None else 0
    return DivisionResponse(
        id=division.id,
        estate_id=division.estate_id,
        name=division.name,
        created_at=division.created_at,
        petak_count=plot_cnt,
        estate_name=est.name if est else None,
        company_id=est.company_id if est else None,
        company_name=est.company.name if est and est.company else None,
    )



@router.get("", response_model=List[EstateResponse])
async def list_estates(
    company_id: Optional[int] = Query(None, description="Filter berdasarkan ID perusahaan"),
    search: Optional[str] = Query(None, description="Cari berdasarkan nama perkebunan/estate"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mendapatkan daftar seluruh estate/kebun."""
    stmt = (
        select(Estate)
        .options(selectinload(Estate.divisions), selectinload(Estate.company))
        .order_by(Estate.name.asc())
    )

    if company_id:
        stmt = stmt.where(Estate.company_id == company_id)

    if search:
        stmt = stmt.where(Estate.name.ilike(f"%{search.strip()}%"))

    result = await db.execute(stmt)
    estates = result.scalars().all()

    return [_to_estate_response(e) for e in estates]


@router.post("", response_model=EstateResponse, status_code=status.HTTP_201_CREATED)
async def create_estate(
    payload: EstateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Membuat entitas perkebunan/estate baru."""
    if not payload.company_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ID Perusahaan (company_id) wajib disertakan.",
        )

    # Validate company exists
    company = await db.scalar(select(Company).where(Company.id == payload.company_id))
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Perusahaan dengan ID {payload.company_id} tidak ditemukan.",
        )

    # Check for duplicate estate name in the same company
    dup_estate = await db.scalar(
        select(Estate).where(
            Estate.company_id == payload.company_id,
            Estate.name.ilike(payload.name.strip()),
        )
    )
    if dup_estate:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Estate dengan nama '{payload.name}' sudah terdaftar pada perusahaan ini.",
        )

    geom = point_from_coordinates(payload.latitude, payload.longitude)

    estate = Estate(
        company_id=payload.company_id,
        name=payload.name.strip(),
        location_point=geom,
        province=payload.province.strip() if payload.province else None,
        kabupaten=payload.kabupaten.strip() if payload.kabupaten else None,
    )
    db.add(estate)
    await db.commit()
    await db.refresh(estate)

    return EstateResponse(
        id=estate.id,
        company_id=estate.company_id,
        name=estate.name,
        province=estate.province,
        kabupaten=estate.kabupaten,
        latitude=payload.latitude,
        longitude=payload.longitude,
        created_at=estate.created_at,
        division_count=0,
        petak_count=0,
        company_name=company.name,
    )


@router.get("/{estate_id}", response_model=EstateDetailResponse)
async def get_estate(
    estate_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mendapatkan detail spesifik estate beserta daftar seluruh divisinya."""
    stmt = (
        select(Estate)
        .where(Estate.id == estate_id)
        .options(
            selectinload(Estate.company),
            selectinload(Estate.divisions).selectinload(Division.estate),
        )
    )
    result = await db.execute(stmt)
    estate = result.scalar_one_or_none()

    if not estate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Estate dengan ID {estate_id} tidak ditemukan.",
        )

    lat, lng = coordinates_from_point(estate.location_point)
    divisions = estate.divisions or []
    div_responses = [_to_division_response(d, estate) for d in divisions]

    return EstateDetailResponse(
        id=estate.id,
        company_id=estate.company_id,
        name=estate.name,
        province=estate.province,
        kabupaten=estate.kabupaten,
        latitude=lat,
        longitude=lng,
        created_at=estate.created_at,
        division_count=len(divisions),
        petak_count=0,
        company_name=estate.company.name if estate.company else None,
        divisions=div_responses,
    )


@router.put("/{estate_id}", response_model=EstateResponse)
async def update_estate(
    estate_id: int,
    payload: EstateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Memperbarui informasi nama, lokasi koordinat, atau wilayah estate."""
    stmt = (
        select(Estate)
        .where(Estate.id == estate_id)
        .options(selectinload(Estate.company), selectinload(Estate.divisions))
    )
    result = await db.execute(stmt)
    estate = result.scalar_one_or_none()

    if not estate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Estate dengan ID {estate_id} tidak ditemukan.",
        )

    if payload.company_id is not None:
        company = await db.scalar(select(Company).where(Company.id == payload.company_id))
        if not company:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Perusahaan dengan ID {payload.company_id} tidak ditemukan.",
            )
        estate.company_id = payload.company_id

    if payload.name is not None:
        estate.name = payload.name.strip()

    if payload.province is not None:
        estate.province = payload.province.strip() if payload.province else None

    if payload.kabupaten is not None:
        estate.kabupaten = payload.kabupaten.strip() if payload.kabupaten else None

    # Handle coordinates update
    if payload.latitude is not None or payload.longitude is not None:
        current_lat, current_lng = coordinates_from_point(estate.location_point)
        new_lat = payload.latitude if payload.latitude is not None else current_lat
        new_lng = payload.longitude if payload.longitude is not None else current_lng
        estate.location_point = point_from_coordinates(new_lat, new_lng)

    await db.commit()
    await db.refresh(estate)

    # Re-fetch company if changed
    return _to_estate_response(estate)


@router.delete("/{estate_id}", status_code=status.HTTP_200_OK)
async def delete_estate(
    estate_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Menghapus entitas perkebunan/estate beserta seluruh divisinya."""
    if current_user.role in ["surveyor"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akses ditolak: Surveyor tidak memiliki hak untuk menghapus estate.",
        )

    stmt = select(Estate).where(Estate.id == estate_id)
    result = await db.execute(stmt)
    estate = result.scalar_one_or_none()

    if not estate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Estate dengan ID {estate_id} tidak ditemukan.",
        )

    estate_name = estate.name
    await db.delete(estate)
    await db.commit()

    return {
        "success": True,
        "message": f"Estate '{estate_name}' berhasil dihapus bersama seluruh divisinya.",
        "id": estate_id,
    }


@router.get("/{estate_id}/divisions", response_model=List[DivisionResponse])
async def list_estate_divisions(
    estate_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mendapatkan daftar divisi untuk estate tertentu."""
    estate = await db.scalar(
        select(Estate)
        .where(Estate.id == estate_id)
        .options(selectinload(Estate.company))
    )
    if not estate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Estate dengan ID {estate_id} tidak ditemukan.",
        )

    stmt = (
        select(Division)
        .where(Division.estate_id == estate_id)
        .order_by(Division.name.asc())
    )
    result = await db.execute(stmt)
    divisions = result.scalars().all()

    return [_to_division_response(d, estate) for d in divisions]


@router.post(
    "/{estate_id}/divisions",
    response_model=DivisionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_estate_division(
    estate_id: int,
    payload: DivisionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Membuat divisi/afdeling baru di bawah naungan estate tertentu."""
    estate = await db.scalar(
        select(Estate)
        .where(Estate.id == estate_id)
        .options(selectinload(Estate.company))
    )
    if not estate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Estate dengan ID {estate_id} tidak ditemukan.",
        )

    # Check for duplicate division name within this estate
    dup_div = await db.scalar(
        select(Division).where(
            Division.estate_id == estate_id,
            Division.name.ilike(payload.name.strip()),
        )
    )
    if dup_div:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Divisi dengan nama '{payload.name}' sudah terdaftar pada estate ini.",
        )

    division = Division(
        estate_id=estate_id,
        name=payload.name.strip(),
    )
    db.add(division)
    await db.commit()
    await db.refresh(division)

    return _to_division_response(division, estate)


@router.get(
    "/{estate_id}/dashboard-summary",
    response_model=EstateDashboardSummaryResponse,
    summary="Ringkasan dashboard perkebunan dengan heatmap NDVI petak",
)
async def get_estate_dashboard_summary(
    estate_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mengembalikan ringkasan metrik estate beserta seluruh petak lahan untuk visualisasi peta NDVI heatmap dan tabel pemantauan."""
    estate = await db.scalar(select(Estate).where(Estate.id == estate_id))
    if not estate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Estate dengan ID {estate_id} tidak ditemukan.",
        )

    stmt = (
        select(Plot)
        .join(Division, Plot.division_id == Division.id)
        .where(Division.estate_id == estate_id)
        .options(
            selectinload(Plot.variety).selectinload(CropVariety.phases),
            selectinload(Plot.spectral_indices),
        )
        .order_by(Plot.name.asc())
    )
    result = await db.execute(stmt)
    plots = result.scalars().all()

    today = date.today()
    plot_items: List[EstateDashboardPlotItem] = []
    total_area: float = 0.0
    ndvi_values: List[float] = []
    attention_count: int = 0

    for p in plots:
        # 1. Hitung Hari Setelah Tanam (HST)
        if p.planting_date:
            hst = max(0, (today - p.planting_date).days)
        else:
            hst = p.current_hst or 0

        # 2. Tentukan fase fenologi saat ini
        phase = p.current_phase
        if not phase and p.variety and p.variety.phases:
            for ph in p.variety.phases:
                if ph.hst_start <= hst <= ph.hst_end:
                    phase = ph.phase_name
                    break

        # 3. Format geometri GeoJSON poligon
        poly_dict = geojson_from_polygon(p.polygon) or {"type": "Polygon", "coordinates": []}

        # 4. Ambil observasi NDVI satelit terbaru
        latest_ndvi = None
        if p.spectral_indices:
            for si in p.spectral_indices:
                if si.ndvi is not None:
                    latest_ndvi = round(float(si.ndvi), 4)
                    break

        # 5. Klasifikasi status kesehatan NDVI
        if latest_ndvi is None:
            ndvi_status = "Belum Ada Data"
        elif latest_ndvi < 0.30:
            ndvi_status = "Kritis"
        elif latest_ndvi < 0.55:
            ndvi_status = "Waspada"
        elif latest_ndvi <= 0.75:
            ndvi_status = "Baik"
        else:
            ndvi_status = "Sangat Baik"

        if latest_ndvi is not None:
            ndvi_values.append(latest_ndvi)
            if latest_ndvi < 0.40:
                attention_count += 1

        area = float(p.area_hectares or 0.0)
        total_area += area

        plot_items.append(
            EstateDashboardPlotItem(
                id=p.id,
                name=p.name,
                crop_type=p.crop_type,
                variety_name=p.variety.name if p.variety else None,
                current_phase=phase or "Vegetatif",
                current_hst=hst,
                area_hectares=round(area, 2),
                polygon=poly_dict,
                latest_ndvi=latest_ndvi,
                ndvi_status=ndvi_status,
                active_alert_count=0,
            )
        )

    avg_ndvi = round(sum(ndvi_values) / len(ndvi_values), 2) if ndvi_values else None

    return EstateDashboardSummaryResponse(
        estate_id=estate.id,
        estate_name=estate.name,
        total_plots=len(plot_items),
        total_area_ha=round(total_area, 2),
        avg_ndvi=avg_ndvi,
        plots_needing_attention=attention_count,
        plots=plot_items,
    )


@router.get(
    "/{estate_id}/indices-timeline",
    response_model=EstateIndicesTimelineResponse,
    summary="Ambil time-series timeline NDVI seluruh petak estate untuk animasi slider",
)
async def get_estate_indices_timeline(
    estate_id: int,
    start_date: Optional[date] = Query(None, description="Tanggal awal observasi (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="Tanggal akhir observasi (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mengembalikan list tanggal observasi yang tersedia, dan untuk setiap tanggal,
    dictionary nilai NDVI seluruh petak di estate tersebut:
    {"dates": ["2026-08-01", ...], "timeline": {"2026-08-01": {plot_id: ndvi_value, ...}}}
    """
    estate = await db.scalar(select(Estate).where(Estate.id == estate_id))
    if not estate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Estate dengan ID {estate_id} tidak ditemukan.",
        )

    # Ambil semua petak di estate ini
    plot_stmt = (
        select(Plot)
        .join(Division, Plot.division_id == Division.id)
        .where(Division.estate_id == estate_id)
        .order_by(Plot.id.asc())
    )
    plots = (await db.execute(plot_stmt)).scalars().all()
    if not plots:
        return EstateIndicesTimelineResponse(
            estate_id=estate.id,
            estate_name=estate.name,
            dates=[],
            timeline={},
        )

    plot_ids = [p.id for p in plots]

    # Ambil rekaman indeks spektral Sentinel-2 yang memiliki nilai NDVI
    si_stmt = (
        select(SpectralIndex)
        .where(
            SpectralIndex.plot_id.in_(plot_ids),
            SpectralIndex.satellite == "sentinel-2",
            SpectralIndex.ndvi.isnot(None),
        )
    )
    if start_date:
        si_stmt = si_stmt.where(SpectralIndex.observation_date >= start_date)
    if end_date:
        si_stmt = si_stmt.where(SpectralIndex.observation_date <= end_date)

    si_stmt = si_stmt.order_by(SpectralIndex.observation_date.asc())
    si_records = (await db.execute(si_stmt)).scalars().all()

    timeline: Dict[str, Dict[str, Optional[float]]] = {}
    observed_dates: Set[str] = set()

    for rec in si_records:
        d_str = rec.observation_date.isoformat()
        observed_dates.add(d_str)
        if d_str not in timeline:
            timeline[d_str] = {}
        timeline[d_str][str(rec.plot_id)] = round(float(rec.ndvi), 4)

    # Jika observasi di database kurang dari 5 titik tanggal,
    # generate timeline historis sintetis yang konsisten untuk pengalaman timelapse yang mulus
    if len(observed_dates) < 5:
        ref_date = end_date or date.today()
        # 8 observasi berjarak 5 hari: H-35 s/d hari ini
        synth_dates = [(ref_date - timedelta(days=5 * i)) for i in reversed(range(8))]
        if start_date:
            synth_dates = [d for d in synth_dates if d >= start_date]

        for s_date in synth_dates:
            d_str = s_date.isoformat()
            observed_dates.add(d_str)
            if d_str not in timeline:
                timeline[d_str] = {}

            for p in plots:
                pid_str = str(p.id)
                if pid_str not in timeline[d_str]:
                    synth_obs = generate_synthetic_satellite_observation(
                        p, s_date, satellite="sentinel-2"
                    )
                    timeline[d_str][pid_str] = synth_obs["ndvi"]

    # Pastikan setiap tanggal memiliki nilai untuk seluruh petak (agar transisi poligon mulus)
    sorted_dates = sorted(list(observed_dates))
    for d_str in sorted_dates:
        t_date = date.fromisoformat(d_str)
        for p in plots:
            pid_str = str(p.id)
            if pid_str not in timeline[d_str] or timeline[d_str][pid_str] is None:
                synth_obs = generate_synthetic_satellite_observation(
                    p, t_date, satellite="sentinel-2"
                )
                timeline[d_str][pid_str] = synth_obs["ndvi"]

    return EstateIndicesTimelineResponse(
        estate_id=estate.id,
        estate_name=estate.name,
        dates=sorted_dates,
        timeline=timeline,
    )


@router.get(
    "/{estate_id}/satellite-tile",
    response_model=PlotSatelliteTileResponse,
    summary="Ambil URL tile XYZ citra satelit untuk wilayah estate",
)
async def get_estate_satellite_tile(
    estate_id: int,
    date: Optional[date] = Query(None, description="Tanggal observasi citra satelit (YYYY-MM-DD)"),
    type: str = Query(
        "true_color",
        description="Tipe visualisasi citra: 'true_color' (B4/B3/B2) atau 'false_color' (B8/B4/B3)",
    ),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mengembalikan URL tile XYZ Map ID dari GEE atau mock raster tile untuk wilayah perkebunan."""
    estate = await db.scalar(select(Estate).where(Estate.id == estate_id))
    if not estate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Estate dengan ID {estate_id} tidak ditemukan.",
        )

    tile_info = get_map_tile(polygon_geojson=None, obs_date=date, vis_type=type)

    return PlotSatelliteTileResponse(
        plot_id=None,
        tile_url=tile_info["tile_url"],
        vis_type=tile_info["vis_type"],
        observation_date=tile_info["observation_date"],
        attribution=tile_info["attribution"],
        bands=tile_info["bands"],
        min_val=tile_info["min_val"],
        max_val=tile_info["max_val"],
        label=tile_info.get("label"),
    )


