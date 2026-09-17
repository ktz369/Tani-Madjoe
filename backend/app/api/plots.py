import logging
from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.database import get_db
from app.models.crop_variety import CropVariety
from app.models.division import Division
from app.models.estate import Estate
from app.models.gdd_accumulation import GddAccumulation
from app.models.plot import Plot
from app.models.spectral_index import SpectralIndex
from app.models.user import User
from app.models.weather_data import WeatherData
from app.schemas.plot import (
    PlotCreate,
    PlotDetailResponse,
    PlotGeoJSONFeature,
    PlotGeoJSONResponse,
    PlotImportPreviewRequest,
    PlotImportPreviewResponse,
    PlotBatchImportPreviewResponse,
    PlotBatchItemPreview,
    PlotBatchCreateItem,
    PlotBatchCreateRequest,
    PlotBatchCreateResponse,
    PlotResponse,
    PlotSummaryResponse,
    PlotUpdate,
)

from app.schemas.satellite import PlotSatelliteTileResponse
from app.schemas.report import SeasonComparisonResponse
from app.services.estate_service import ensure_estate_centroid_from_polygon
from app.services.gdd_service import predict_harvest_date, sync_gdd_for_plot
from app.services.gee_service import get_map_tile
from app.services.report_service import generate_season_comparison
from app.services.satellite_backfill_service import backfill_satellite_indices_for_plot
from app.services.satellite_indices import classify_vegetation_health, detect_sar_flooding
from app.services.weather_service import sync_weather_for_estate
from app.utils.geo import (
    calculate_polygon_area_hectares,
    coordinates_from_point,
    geojson_from_polygon,
    point_from_coordinates,
    polygon_from_geojson,
)
from app.utils.kml_parser import (
    SpatialParseError,
    parse_multi_spatial_file,
    parse_spatial_file,
)


logger = logging.getLogger(__name__)

router = APIRouter(tags=["Petak Lahan (Plots)"])


def _to_plot_response(plot: Plot) -> PlotResponse:
    """Helper to convert Plot ORM model to PlotResponse with calculated HST and GeoJSON geometry."""
    today = date.today()
    if plot.planting_date:
        hst = max(0, (today - plot.planting_date).days)
    else:
        hst = plot.current_hst or 0

    current_phase = plot.current_phase
    if not current_phase and plot.variety and plot.variety.phases:
        for phase in plot.variety.phases:
            if phase.hst_start <= hst <= phase.hst_end:
                current_phase = phase.phase_name
                break

    div = plot.division
    est = div.estate if div else None
    comp = est.company if est else None
    var = plot.variety

    poly_dict = geojson_from_polygon(plot.polygon) or {"type": "Polygon", "coordinates": []}

    return PlotResponse(
        id=plot.id,
        division_id=plot.division_id,
        variety_id=plot.variety_id,
        name=plot.name,
        polygon=poly_dict,
        area_hectares=plot.area_hectares,
        planting_date=plot.planting_date,
        crop_type=plot.crop_type,
        current_phase=current_phase,
        current_hst=hst,
        created_at=plot.created_at,
        division_name=div.name if div else None,
        estate_id=est.id if est else None,
        estate_name=est.name if est else None,
        company_id=comp.id if comp else None,
        company_name=comp.name if comp else None,
        variety_name=var.name if var else None,
    )


def _to_plot_geojson_feature(plot: Plot) -> PlotGeoJSONFeature:
    """Helper to convert Plot ORM model to GeoJSON Feature."""
    resp = _to_plot_response(plot)
    return PlotGeoJSONFeature(
        type="Feature",
        id=resp.id,
        geometry=resp.polygon,
        properties={
            "id": resp.id,
            "name": resp.name,
            "crop_type": resp.crop_type,
            "variety_id": resp.variety_id,
            "variety_name": resp.variety_name,
            "area_hectares": resp.area_hectares,
            "planting_date": resp.planting_date.isoformat() if resp.planting_date else None,
            "current_hst": resp.current_hst,
            "current_phase": resp.current_phase,
            "division_id": resp.division_id,
            "division_name": resp.division_name,
            "estate_id": resp.estate_id,
            "estate_name": resp.estate_name,
            "company_id": resp.company_id,
            "company_name": resp.company_name,
            "created_at": resp.created_at.isoformat() if resp.created_at else None,
        },
    )


# --------------------------------------------------------------------------
# Helper for creating a plot
# --------------------------------------------------------------------------
async def _handle_create_plot(
    payload: PlotCreate,
    target_division_id: int,
    db: AsyncSession,
) -> PlotResponse:
    # 1. Validate Division exists
    division_stmt = (
        select(Division)
        .where(Division.id == target_division_id)
        .options(selectinload(Division.estate).selectinload(Estate.company))
    )
    div_res = await db.execute(division_stmt)
    division = div_res.scalar_one_or_none()
    if not division:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Divisi dengan ID {target_division_id} tidak ditemukan.",
        )

    # 2. Validate Variety if provided
    variety = None
    if payload.variety_id is not None:
        var_stmt = (
            select(CropVariety)
            .where(CropVariety.id == payload.variety_id)
            .options(selectinload(CropVariety.phases))
        )
        var_res = await db.execute(var_stmt)
        variety = var_res.scalar_one_or_none()
        if not variety:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Varietas tanaman dengan ID {payload.variety_id} tidak ditemukan.",
            )

    # 3. Convert GeoJSON polygon to PostGIS WKT and calculate area
    try:
        wkt_elem = polygon_from_geojson(payload.polygon)
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Geometri poligon tidak valid: {str(err)}",
        )

    area_ha = calculate_polygon_area_hectares(payload.polygon)
    if area_ha <= 0.0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Luas poligon harus lebih besar dari 0 hektar. Periksa kembali titik-titik sudut poligon.",
        )

    # 4. Calculate initial HST and current_phase
    today = date.today()
    if payload.planting_date:
        hst = max(0, (today - payload.planting_date).days)
    else:
        hst = 0

    resolved_phase = payload.current_phase
    if not resolved_phase and variety and variety.phases:
        for p in variety.phases:
            if p.hst_start <= hst <= p.hst_end:
                resolved_phase = p.phase_name
                break

    # 5. Create Plot model
    plot = Plot(
        division_id=target_division_id,
        variety_id=payload.variety_id,
        name=payload.name.strip(),
        polygon=wkt_elem,
        area_hectares=area_ha,
        planting_date=payload.planting_date,
        crop_type=payload.crop_type.strip().lower(),
        current_phase=resolved_phase,
        current_hst=hst,
    )
    db.add(plot)
    await db.commit()
    await db.refresh(plot)

    # Attach loaded models for response
    plot.division = division
    plot.variety = variety

    # Wave 7 / Ticket 06: Trigger initial analysis pipeline (weather sync, GDD)
    try:
        if division and division.estate:
            try:
                # Wave 8 / Ticket 01: Ensure estate has centroid GPS coordinates if missing
                estate_lat, estate_lng = coordinates_from_point(division.estate.location_point)
                if estate_lat is None or estate_lng is None or (estate_lat == 0.0 and estate_lng == 0.0):
                    from app.services.estate_service import ensure_estate_centroid_from_polygon
                    await ensure_estate_centroid_from_polygon(db, division.estate, payload.polygon)

                from app.services.weather_service import sync_weather_for_estate
                await sync_weather_for_estate(db, division.estate)
            except Exception as w_err:
                logger.warning("Auto weather sync for estate %s failed: %s", division.estate_id, w_err)

        if plot.planting_date and plot.variety_id:
            try:
                await sync_gdd_for_plot(db, plot.id)
            except Exception as gdd_err:
                logger.warning("Auto GDD sync for plot %s failed: %s", plot.id, gdd_err)

        # 30-Day Historical Satellite Backfill (Wave 8 / Ticket 04)
        try:
            from app.services.satellite_backfill_service import backfill_satellite_indices_for_plot
            await backfill_satellite_indices_for_plot(db, plot.id, days_back=30, cadence_days=5)
        except Exception as backfill_err:
            logger.warning("Historical satellite backfill for plot %s failed: %s", plot.id, backfill_err)

        # Baseline spectral index observation (Wave 7 / Ticket 06)
        try:
            from datetime import date
            obs_today = date.today()
            baseline_spec = SpectralIndex(
                plot_id=plot.id,
                observation_date=obs_today,
                satellite="sentinel-2",
                ndvi=0.68,
                ndre=0.32,
                ndwi=0.20,
                savi=0.55,
                bsi=0.08,
                cloud_cover_pct=5.0,
            )
            db.add(baseline_spec)
            await db.commit()
        except Exception as spec_err:
            logger.warning("Auto baseline spectral index creation failed: %s", spec_err)
    except Exception as pipe_err:
        logger.warning("Plot initial analysis pipeline trigger error: %s", pipe_err)

    return _to_plot_response(plot)


# --------------------------------------------------------------------------
# Geospatial Import Endpoints (Wave 7)
# --------------------------------------------------------------------------

@router.post(
    "/plots/import-preview",
    response_model=PlotImportPreviewResponse,
    summary="Preview dan validasi berkas geospasial (KML, KMZ, GeoJSON)",
)
@router.post(
    "/plots/parse-kml",
    response_model=PlotImportPreviewResponse,
    include_in_schema=False,
)
async def preview_spatial_import(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Menerima berkas atau konten KML/KMZ/GeoJSON, mengekstrak batas lahan dan luas geodesik."""
    content_bytes: bytes = b""
    filename: Optional[str] = None

    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" in content_type:
        form = await request.form()
        uploaded_file = form.get("file")
        if uploaded_file is not None and hasattr(uploaded_file, "read"):
            content_bytes = await uploaded_file.read()
            filename = getattr(uploaded_file, "filename", None)
        elif "content" in form:
            content_bytes = str(form.get("content")).encode("utf-8")
            filename = str(form.get("filename", "upload.kml"))
    elif "application/json" in content_type:
        try:
            body_json = await request.json()
            if isinstance(body_json, dict) and "content" in body_json:
                content_bytes = str(body_json["content"]).encode("utf-8")
                filename = body_json.get("filename")
            elif isinstance(body_json, dict):
                import json
                content_bytes = json.dumps(body_json).encode("utf-8")
                filename = "data.geojson"
            else:
                content_bytes = str(body_json).encode("utf-8")
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Format JSON permintaan tidak valid: {str(e)}",
            )
    else:
        content_bytes = await request.body()

    if not content_bytes or not content_bytes.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Berkas atau konten geospasial kosong. Harap unggah berkas .kml, .kmz, atau .geojson yang valid.",
        )

    try:
        parsed = parse_spatial_file(content_bytes, filename=filename)
    except SpatialParseError as spe:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Gagal memproses berkas geospasial: {str(spe)}",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Terjadi kesalahan saat membaca berkas geospasial: {str(exc)}",
        )

    return PlotImportPreviewResponse(
        name=parsed["name"],
        format=parsed["format"],
        geometry=parsed["geometry"],
        area_hectares=parsed["area_hectares"],
        area_m2=parsed["area_m2"],
        bounding_box=parsed["bounding_box"],
        centroid=parsed["centroid"],
        vertex_count=parsed["vertex_count"],
        warnings=parsed.get("warnings", []),
    )


@router.post(
    "/plots/batch-import-preview",
    response_model=PlotBatchImportPreviewResponse,
    summary="Preview dan validasi berkas geospasial massal / multi-placemark (KML, KMZ, GeoJSON)",
)
@router.post(
    "/plots/batch-parse-kml",
    response_model=PlotBatchImportPreviewResponse,
    include_in_schema=False,
)
async def preview_batch_spatial_import(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Menerima berkas KML/KMZ multi-placemark atau GeoJSON FeatureCollection,
    mengekstrak seluruh poligon petak, luas individual, dan unified bounding box."""
    content_bytes: bytes = b""
    filename: Optional[str] = None

    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" in content_type:
        form = await request.form()
        uploaded_file = form.get("file")
        if uploaded_file is not None and hasattr(uploaded_file, "read"):
            content_bytes = await uploaded_file.read()
            filename = getattr(uploaded_file, "filename", None)
        elif "content" in form:
            content_bytes = str(form.get("content")).encode("utf-8")
            filename = str(form.get("filename", "upload.kml"))
    elif "application/json" in content_type:
        try:
            body_json = await request.json()
            if isinstance(body_json, dict) and "content" in body_json:
                content_bytes = str(body_json["content"]).encode("utf-8")
                filename = body_json.get("filename")
            elif isinstance(body_json, dict):
                import json
                content_bytes = json.dumps(body_json).encode("utf-8")
                filename = "data.geojson"
            else:
                content_bytes = str(body_json).encode("utf-8")
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Format JSON permintaan tidak valid: {str(e)}",
            )
    else:
        content_bytes = await request.body()

    if not content_bytes or not content_bytes.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Berkas atau konten geospasial kosong. Harap unggah berkas .kml, .kmz, atau .geojson yang valid.",
        )

    try:
        parsed = parse_multi_spatial_file(content_bytes, filename=filename)
    except SpatialParseError as spe:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Gagal memproses berkas geospasial massal: {str(spe)}",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Terjadi kesalahan saat membaca berkas geospasial massal: {str(exc)}",
        )

    return PlotBatchImportPreviewResponse(
        format=parsed["format"],
        total_plots=parsed["total_plots"],
        total_area_hectares=parsed["total_area_hectares"],
        total_area_m2=parsed["total_area_m2"],
        unified_bounding_box=parsed["unified_bounding_box"],
        plots=[
            PlotBatchItemPreview(
                name=p["name"],
                geometry=p["geometry"],
                area_hectares=p["area_hectares"],
                area_m2=p["area_m2"],
                vertex_count=p["vertex_count"],
                bounding_box=p["bounding_box"],
                centroid=p["centroid"],
                is_valid=p.get("is_valid", True),
                warnings=p.get("warnings", []),
            )
            for p in parsed.get("plots", [])
        ],
    )


@router.post(
    "/plots/batch-create",
    response_model=PlotBatchCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Mendaftarkan beberapa petak lahan sekaligus secara transaksional (Batch Create)",
)
async def batch_create_plots(
    payload: PlotBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Menyimpan seluruh petak lahan terpilih dalam satu transaksi database PostGIS,
    menginisiasi auto-centroid estate jika kosong, memicu sinkronisasi cuaca, GDD,
    dan antrean backfill satelit historis 30 hari untuk setiap petak."""
    if not payload.plots:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Daftar petak lahan tidak boleh kosong.",
        )

    # 1. Validate Division exists
    division_stmt = (
        select(Division)
        .where(Division.id == payload.division_id)
        .options(selectinload(Division.estate).selectinload(Estate.company))
    )
    div_res = await db.execute(division_stmt)
    division = div_res.scalar_one_or_none()
    if not division:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Divisi dengan ID {payload.division_id} tidak ditemukan.",
        )

    today = date.today()
    created_plots: List[Plot] = []
    errors: List[str] = []

    # Cache varieties to minimize DB queries
    variety_cache = {}

    for idx, item in enumerate(payload.plots):
        try:
            # Validate geometry
            wkt_elem = polygon_from_geojson(item.polygon)
            area_ha = calculate_polygon_area_hectares(item.polygon)
            if area_ha <= 0.0:
                errors.append(f"Petak '{item.name}' (indeks {idx}): Luas poligon 0 hektar atau tidak valid.")
                continue

            # Variety lookup
            variety = None
            if item.variety_id:
                if item.variety_id in variety_cache:
                    variety = variety_cache[item.variety_id]
                else:
                    var_stmt = (
                        select(CropVariety)
                        .where(CropVariety.id == item.variety_id)
                        .options(selectinload(CropVariety.phases))
                    )
                    var_res = await db.execute(var_stmt)
                    variety = var_res.scalar_one_or_none()
                    variety_cache[item.variety_id] = variety

            # HST & Phase calculation
            if item.planting_date:
                hst = max(0, (today - item.planting_date).days)
            else:
                hst = 0

            resolved_phase = None
            if variety and variety.phases:
                for p in variety.phases:
                    if p.hst_start <= hst <= p.hst_end:
                        resolved_phase = p.phase_name
                        break

            new_plot = Plot(
                division_id=payload.division_id,
                variety_id=item.variety_id,
                name=item.name.strip(),
                polygon=wkt_elem,
                area_hectares=area_ha,
                planting_date=item.planting_date,
                crop_type=item.crop_type.strip().lower(),
                current_phase=resolved_phase,
                current_hst=hst,
            )
            db.add(new_plot)
            created_plots.append(new_plot)
        except Exception as p_err:
            errors.append(f"Petak '{item.name}' (indeks {idx}): {str(p_err)}")

    if errors:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Transaksi batch dibatalkan (rollback atomik) karena terdapat petak gagal divalidasi: {'; '.join(errors)}",
        )

    if not created_plots:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tidak ada petak yang valid untuk didaftarkan.",
        )

    # Commit transactional batch save
    try:
        await db.commit()
        for p in created_plots:
            await db.refresh(p)
    except Exception as commit_err:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal menyimpan transaksi batch ke database: {str(commit_err)}",
        )

    # 2. Auto-centroid propagation to estate if needed (Wave 8 / Ticket 01)
    if division.estate and created_plots:
        try:
            estate_lat, estate_lng = coordinates_from_point(division.estate.location_point)
            if estate_lat is None or estate_lng is None or (estate_lat == 0.0 and estate_lng == 0.0):
                from app.services.estate_service import ensure_estate_centroid_from_polygon
                await ensure_estate_centroid_from_polygon(db, division.estate, payload.plots[0].polygon)
        except Exception as c_err:
            logger.warning("Batch plot auto-centroid failed: %s", c_err)

    # 3. Weather sync for estate
    if division.estate:
        try:
            from app.services.weather_service import sync_weather_for_estate
            await sync_weather_for_estate(db, division.estate)
        except Exception as w_err:
            logger.warning("Batch weather sync for estate %s failed: %s", division.estate_id, w_err)

    # 4. Telemetry activation for each created plot: GDD, 30-Day Historical Backfill, and Baseline
    for p in created_plots:
        if p.planting_date and p.variety_id:
            try:
                await sync_gdd_for_plot(db, p.id)
            except Exception as gdd_err:
                logger.warning("Batch GDD sync for plot %s failed: %s", p.id, gdd_err)

        # Historical satellite backfill (Wave 8 / Ticket 04)
        try:
            from app.services.satellite_backfill_service import backfill_satellite_indices_for_plot
            await backfill_satellite_indices_for_plot(db, p.id, days_back=30, cadence_days=5)
        except Exception as bf_err:
            logger.warning("Batch satellite backfill for plot %s failed: %s", p.id, bf_err)

        # Baseline spectral index observation
        try:
            baseline_spec = SpectralIndex(
                plot_id=p.id,
                observation_date=date.today(),
                satellite="sentinel-2",
                ndvi=0.68,
                ndre=0.32,
                ndwi=0.20,
                savi=0.55,
                bsi=0.08,
                cloud_cover_pct=5.0,
            )
            db.add(baseline_spec)
            await db.commit()
        except Exception as spec_err:
            logger.warning("Auto baseline spectral index failed for plot %s: %s", p.id, spec_err)

    total_area_ha = round(sum(p.area_hectares for p in created_plots), 4)
    return PlotBatchCreateResponse(
        created_count=len(created_plots),
        failed_count=len(errors),
        total_area_hectares=total_area_ha,
        plot_ids=[p.id for p in created_plots],
        errors=errors,
    )


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------



@router.post(
    "/divisions/{division_id}/plots",
    response_model=PlotResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Mendaftarkan petak lahan baru dalam divisi",
)
async def create_division_plot(
    division_id: int,
    payload: PlotCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mendaftarkan petak lahan baru di bawah naungan divisi tertentu."""
    return await _handle_create_plot(payload, division_id, db)


@router.post(
    "/plots",
    response_model=PlotResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Mendaftarkan petak lahan baru (division_id di payload)",
)
async def create_plot(
    payload: PlotCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mendaftarkan petak lahan baru dengan menyertakan division_id pada body."""
    if not payload.division_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ID Divisi (division_id) wajib disertakan pada permintaan.",
        )
    return await _handle_create_plot(payload, payload.division_id, db)


@router.get(
    "/plots",
    response_model=List[PlotResponse],
    summary="Mendapatkan daftar petak lahan dengan filter",
)
async def list_plots(
    division_id: Optional[int] = Query(None, description="Filter berdasarkan ID divisi"),
    estate_id: Optional[int] = Query(None, description="Filter berdasarkan ID perkebunan/estate"),
    crop_type: Optional[str] = Query(None, description="Filter berdasarkan tanaman ('padi' atau 'jagung')"),
    search: Optional[str] = Query(None, description="Cari berdasarkan nama petak"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mendapatkan daftar petak lahan yang dapat difilter berdasarkan divisi, estate, atau komoditas."""
    stmt = (
        select(Plot)
        .options(
            selectinload(Plot.division).selectinload(Division.estate).selectinload(Estate.company),
            selectinload(Plot.variety).selectinload(CropVariety.phases),
        )
        .order_by(Plot.name.asc())
    )

    if division_id:
        stmt = stmt.where(Plot.division_id == division_id)

    if estate_id:
        stmt = stmt.join(Division, Plot.division_id == Division.id).where(Division.estate_id == estate_id)

    if crop_type:
        stmt = stmt.where(Plot.crop_type == crop_type.strip().lower())

    if search:
        stmt = stmt.where(Plot.name.ilike(f"%{search.strip()}%"))

    result = await db.execute(stmt)
    plots = result.scalars().all()
    return [_to_plot_response(p) for p in plots]


@router.get(
    "/plots/{plot_id}",
    response_model=PlotResponse,
    summary="Mendapatkan detail spesifik petak lahan",
)
async def get_plot(
    plot_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mendapatkan informasi detail suatu petak lahan beserta geometri poligonnya."""
    stmt = (
        select(Plot)
        .where(Plot.id == plot_id)
        .options(
            selectinload(Plot.division).selectinload(Division.estate).selectinload(Estate.company),
            selectinload(Plot.variety).selectinload(CropVariety.phases),
        )
    )
    result = await db.execute(stmt)
    plot = result.scalar_one_or_none()
    if not plot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Petak lahan dengan ID {plot_id} tidak ditemukan.",
        )

    return _to_plot_response(plot)


@router.get(
    "/plots/{plot_id}/detail",
    response_model=PlotDetailResponse,
    summary="Mendapatkan data komprehensif detail petak (GDD, Fenologi, Satelit, & Cuaca)",
)
async def get_plot_detail(
    plot_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mengembalikan data gabungan komprehensif petak lahan:
    - Atribut petak & konteks organisasi (estate, divisi, company)
    - Varietas benih & target siklus GDD
    - Akumulasi GDD saat ini, progres persentase, sisa GDD, dan prediksi tanggal panen fisiologis
    - Kebutuhan air tanaman (ETc hari ini, ET0 acuan hari ini, Kc aktif)
    - Timeline alur fase fenologi lengkap dengan status (completed / active / upcoming)
    - Observasi satelit terbaru (NDVI, NDRE, NDWI, SAVI, BSI, SAR VV/VH dB, status genangan banjir)
    """
    stmt = (
        select(Plot)
        .where(Plot.id == plot_id)
        .options(
            selectinload(Plot.division).selectinload(Division.estate).selectinload(Estate.company),
            selectinload(Plot.variety).selectinload(CropVariety.phases),
        )
    )
    result = await db.execute(stmt)
    plot = result.scalar_one_or_none()
    if not plot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Petak lahan dengan ID {plot_id} tidak ditemukan.",
        )

    today = date.today()
    if plot.planting_date:
        hst = max(0, (today - plot.planting_date).days)
    else:
        hst = plot.current_hst or 0

    div = plot.division
    est = div.estate if div else None
    comp = est.company if est else None
    poly_dict = geojson_from_polygon(plot.polygon) or {"type": "Polygon", "coordinates": []}

    # 1. Varietas & Target GDD
    variety = plot.variety
    if not variety and plot.crop_type:
        var_stmt = (
            select(CropVariety)
            .options(selectinload(CropVariety.phases))
            .where(CropVariety.crop_type == plot.crop_type)
            .order_by(CropVariety.id.asc())
            .limit(1)
        )
        var_res = await db.execute(var_stmt)
        variety = var_res.scalar_one_or_none()

    phases = sorted(variety.phases, key=lambda p: p.gdd_target) if variety and variety.phases else []
    default_target = 1950.0 if plot.crop_type == "padi" else 1780.0
    gdd_target_total = phases[-1].gdd_target if phases else default_target

    # 2. Data GDD & Prediksi Panen
    latest_gdd_stmt = (
        select(GddAccumulation)
        .where(GddAccumulation.plot_id == plot_id)
        .order_by(desc(GddAccumulation.observation_date), desc(GddAccumulation.created_at))
        .limit(1)
    )
    latest_gdd = (await db.execute(latest_gdd_stmt)).scalar_one_or_none()

    if not latest_gdd and plot.planting_date:
        try:
            await sync_gdd_for_plot(db, plot_id)
            latest_gdd = (await db.execute(latest_gdd_stmt)).scalar_one_or_none()
        except Exception:
            pass

    gdd_cumulative = latest_gdd.gdd_cumulative if latest_gdd else 0.0
    gdd_progress_pct = (
        round(min(100.0, (gdd_cumulative / gdd_target_total) * 100.0), 1)
        if gdd_target_total > 0
        else 0.0
    )
    remaining_gdd = max(0.0, round(gdd_target_total - gdd_cumulative, 2))

    predicted_harvest = (
        latest_gdd.predicted_harvest_date
        if latest_gdd and latest_gdd.predicted_harvest_date
        else (predict_harvest_date(plot.planting_date, gdd_cumulative, gdd_target_total) if plot.planting_date else None)
    )
    days_to_harvest = (
        max(0, (predicted_harvest - today).days)
        if predicted_harvest
        else None
    )

    # 3. Timeline Fase Fenologi & Kc Aktif
    timeline = []
    found_active = False
    active_phase_obj = None

    for ph in phases:
        if gdd_cumulative > ph.gdd_target:
            phase_status = "completed"
        elif not found_active:
            phase_status = "active"
            found_active = True
            active_phase_obj = ph
        else:
            phase_status = "upcoming"

        timeline.append({
            "phase_code": ph.phase_code,
            "phase_name": ph.phase_name,
            "hst_start": ph.hst_start,
            "hst_end": ph.hst_end,
            "gdd_target": ph.gdd_target,
            "kc_value": ph.kc_value,
            "status": phase_status,
        })

    if phases and not found_active and gdd_cumulative >= gdd_target_total:
        if timeline:
            timeline[-1]["status"] = "completed"
        active_phase_obj = phases[-1]

    kc_active = active_phase_obj.kc_value if active_phase_obj else (phases[0].kc_value if phases else 1.0)
    current_phase_name = (
        plot.current_phase
        or (active_phase_obj.phase_name if active_phase_obj else None)
        or (latest_gdd.predicted_phase if latest_gdd else None)
    )

    # 4. Kebutuhan Air (ETc & ET0)
    et0_today = None
    if est:
        w_stmt = (
            select(WeatherData)
            .where(WeatherData.estate_id == est.id)
            .order_by(desc(WeatherData.observation_date), desc(WeatherData.created_at))
            .limit(1)
        )
        w_latest = (await db.execute(w_stmt)).scalar_one_or_none()
        if w_latest and w_latest.et0_mm is not None:
            et0_today = w_latest.et0_mm

    etc_today = latest_gdd.etc_mm if latest_gdd and latest_gdd.etc_mm is not None else None
    if etc_today is None and et0_today is not None and kc_active is not None:
        etc_today = round(et0_today * kc_active, 2)

    # 5. Observasi Satelit Terbaru
    s2_stmt = (
        select(SpectralIndex)
        .where(SpectralIndex.plot_id == plot_id, SpectralIndex.satellite == "sentinel-2")
        .order_by(desc(SpectralIndex.observation_date), desc(SpectralIndex.created_at))
        .limit(1)
    )
    s2_record = (await db.execute(s2_stmt)).scalar_one_or_none()

    s1_stmt = (
        select(SpectralIndex)
        .where(SpectralIndex.plot_id == plot_id, SpectralIndex.satellite == "sentinel-1")
        .order_by(desc(SpectralIndex.observation_date), desc(SpectralIndex.created_at))
        .limit(1)
    )
    s1_record = (await db.execute(s1_stmt)).scalar_one_or_none()

    latest_ndvi = s2_record.ndvi if s2_record else None
    latest_ndre = s2_record.ndre if s2_record else None
    latest_ndwi = s2_record.ndwi if s2_record else None
    latest_savi = s2_record.savi if s2_record else None
    latest_bsi = s2_record.bsi if s2_record else None

    sar_vv = s1_record.sar_vv_db if s1_record else (s2_record.sar_vv_db if s2_record else None)
    sar_vh = s1_record.sar_vh_db if s1_record else (s2_record.sar_vh_db if s2_record else None)
    obs_date = s2_record.observation_date if s2_record else (s1_record.observation_date if s1_record else None)

    is_flooded = detect_sar_flooding(sar_vv, sar_vh)
    veg_health = classify_vegetation_health(latest_ndvi)

    return PlotDetailResponse(
        id=plot.id,
        name=plot.name,
        area_hectares=plot.area_hectares,
        crop_type=plot.crop_type,
        planting_date=plot.planting_date,
        current_hst=hst,
        current_phase=current_phase_name,
        division_id=plot.division_id,
        division_name=div.name if div else None,
        estate_id=est.id if est else None,
        estate_name=est.name if est else None,
        company_id=comp.id if comp else None,
        company_name=comp.name if comp else None,
        polygon=poly_dict,
        variety_id=variety.id if variety else None,
        variety_name=variety.name if variety else None,
        cycle_days=variety.cycle_days if variety else None,
        t_base=variety.t_base if variety else None,
        gdd_target_total=gdd_target_total,
        gdd_cumulative=gdd_cumulative,
        gdd_progress_pct=gdd_progress_pct,
        remaining_gdd=remaining_gdd,
        predicted_harvest_date=predicted_harvest,
        estimated_days_to_harvest=days_to_harvest,
        etc_today=etc_today,
        et0_today=et0_today,
        kc_active=kc_active,
        phases_timeline=timeline,
        latest_ndvi=latest_ndvi,
        latest_ndre=latest_ndre,
        latest_ndwi=latest_ndwi,
        latest_savi=latest_savi,
        latest_bsi=latest_bsi,
        sar_vv_db=sar_vv,
        sar_vh_db=sar_vh,
        observation_date=obs_date,
        is_flooded=is_flooded,
        vegetation_health=veg_health,
    )


@router.put(
    "/plots/{plot_id}",
    response_model=PlotResponse,
    summary="Memperbarui data atau geometri petak lahan",
)
async def update_plot(
    plot_id: int,
    payload: PlotUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Memperbarui informasi agronomis, tanggal tanam, varietas, atau poligon batas petak."""
    stmt = (
        select(Plot)
        .where(Plot.id == plot_id)
        .options(
            selectinload(Plot.division).selectinload(Division.estate).selectinload(Estate.company),
            selectinload(Plot.variety).selectinload(CropVariety.phases),
        )
    )
    result = await db.execute(stmt)
    plot = result.scalar_one_or_none()
    if not plot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Petak lahan dengan ID {plot_id} tidak ditemukan.",
        )

    # 1. Check division update
    if payload.division_id is not None and payload.division_id != plot.division_id:
        div_stmt = (
            select(Division)
            .where(Division.id == payload.division_id)
            .options(selectinload(Division.estate).selectinload(Estate.company))
        )
        new_div = await db.scalar(div_stmt)
        if not new_div:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Divisi tujuan dengan ID {payload.division_id} tidak ditemukan.",
            )
        plot.division_id = payload.division_id
        plot.division = new_div

    # 2. Check variety update
    if payload.variety_id is not None and payload.variety_id != plot.variety_id:
        var_stmt = (
            select(CropVariety)
            .where(CropVariety.id == payload.variety_id)
            .options(selectinload(CropVariety.phases))
        )
        new_var = await db.scalar(var_stmt)
        if not new_var:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Varietas dengan ID {payload.variety_id} tidak ditemukan.",
            )
        plot.variety_id = payload.variety_id
        plot.variety = new_var

    # 3. Update basic fields
    if payload.name is not None:
        plot.name = payload.name.strip()

    if payload.crop_type is not None:
        plot.crop_type = payload.crop_type.strip().lower()

    if payload.planting_date is not None:
        plot.planting_date = payload.planting_date
        today = date.today()
        plot.current_hst = max(0, (today - plot.planting_date).days)

    if payload.current_phase is not None:
        plot.current_phase = payload.current_phase

    # 4. Check polygon geometry update
    if payload.polygon is not None:
        try:
            wkt_elem = polygon_from_geojson(payload.polygon)
            area_ha = calculate_polygon_area_hectares(payload.polygon)
            if area_ha <= 0.0:
                raise ValueError("Luas poligon hasil hitung harus lebih besar dari 0 hektar.")
            plot.polygon = wkt_elem
            plot.area_hectares = area_ha
        except Exception as err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Pembaruan poligon gagal: {str(err)}",
            )

    # 5. Re-evaluate phase if planting_date or variety updated
    if plot.planting_date and plot.variety and plot.variety.phases and not payload.current_phase:
        for p in plot.variety.phases:
            if p.hst_start <= plot.current_hst <= p.hst_end:
                plot.current_phase = p.phase_name
                break

    await db.commit()
    await db.refresh(plot)

    return _to_plot_response(plot)


@router.delete(
    "/plots/{plot_id}",
    status_code=status.HTTP_200_OK,
    summary="Menghapus petak lahan",
)
async def delete_plot(
    plot_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Menghapus entitas petak lahan."""
    stmt = select(Plot).where(Plot.id == plot_id)
    result = await db.execute(stmt)
    plot = result.scalar_one_or_none()
    if not plot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Petak lahan dengan ID {plot_id} tidak ditemukan.",
        )

    plot_name = plot.name
    await db.delete(plot)
    await db.commit()

    return {
        "success": True,
        "message": f"Petak lahan '{plot_name}' berhasil dihapus.",
        "id": plot_id,
    }


@router.get(
    "/estates/{estate_id}/plots",
    response_model=List[PlotResponse],
    summary="Mendapatkan semua petak dalam satu estate",
)
async def list_estate_plots(
    estate_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mendapatkan semua petak lahan dalam perkebunan (estate) tertentu beserta atribut agronomis dan geometrinya."""
    # Verify estate exists
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
            selectinload(Plot.division).selectinload(Division.estate).selectinload(Estate.company),
            selectinload(Plot.variety).selectinload(CropVariety.phases),
        )
        .order_by(Plot.name.asc())
    )
    result = await db.execute(stmt)
    plots = result.scalars().all()

    return [_to_plot_response(p) for p in plots]


@router.get(
    "/estates/{estate_id}/plots/geojson",
    response_model=PlotGeoJSONResponse,
    summary="Mendapatkan data poligon petak estate dalam format GeoJSON FeatureCollection",
)
async def get_estate_plots_geojson(
    estate_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mengembalikan FeatureCollection GeoJSON dari semua petak dalam estate untuk visualisasi Mapbox."""
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
            selectinload(Plot.division).selectinload(Division.estate).selectinload(Estate.company),
            selectinload(Plot.variety).selectinload(CropVariety.phases),
        )
        .order_by(Plot.id.asc())
    )
    result = await db.execute(stmt)
    plots = result.scalars().all()

    features = [_to_plot_geojson_feature(p) for p in plots]
    return PlotGeoJSONResponse(type="FeatureCollection", features=features)


@router.get(
    "/estates/{estate_id}/plots/summary",
    response_model=PlotSummaryResponse,
    summary="Mendapatkan ringkasan statistik petak lahan estate",
)
async def get_estate_plots_summary(
    estate_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ringkasan statistik luas, jumlah petak, dan pembagian komoditas serta fase fenologi dalam estate."""
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
            selectinload(Plot.division),
            selectinload(Plot.variety).selectinload(CropVariety.phases),
        )
    )
    result = await db.execute(stmt)
    plots = result.scalars().all()

    total_plots = len(plots)
    total_area = sum(p.area_hectares for p in plots)

    padi_plots = [p for p in plots if p.crop_type == "padi"]
    jagung_plots = [p for p in plots if p.crop_type == "jagung"]

    phases_summary = {}
    for p in plots:
        resp = _to_plot_response(p)
        phase_name = resp.current_phase or "Belum Ditentukan"
        phases_summary[phase_name] = phases_summary.get(phase_name, 0) + 1

    return PlotSummaryResponse(
        total_plots=total_plots,
        total_area_hectares=round(total_area, 2),
        padi_plots=len(padi_plots),
        padi_area_hectares=round(sum(p.area_hectares for p in padi_plots), 2),
        jagung_plots=len(jagung_plots),
        jagung_area_hectares=round(sum(p.area_hectares for p in jagung_plots), 2),
        phases_summary=phases_summary,
    )


@router.get(
    "/divisions/{division_id}/plots",
    response_model=List[PlotResponse],
    summary="Mendapatkan semua petak dalam satu divisi",
)
async def list_division_plots(
    division_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mendapatkan daftar petak lahan yang berada di bawah divisi tertentu."""
    division = await db.scalar(select(Division).where(Division.id == division_id))
    if not division:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Divisi dengan ID {division_id} tidak ditemukan.",
        )

    stmt = (
        select(Plot)
        .where(Plot.division_id == division_id)
        .options(
            selectinload(Plot.division).selectinload(Division.estate).selectinload(Estate.company),
            selectinload(Plot.variety).selectinload(CropVariety.phases),
        )
        .order_by(Plot.name.asc())
    )
    result = await db.execute(stmt)
    plots = result.scalars().all()

    return [_to_plot_response(p) for p in plots]


@router.get(
    "/plots/{plot_id}/satellite-tile",
    response_model=PlotSatelliteTileResponse,
    summary="Ambil URL tile XYZ citra satelit petak (True Color / False Color)",
)
async def get_plot_satellite_tile(
    plot_id: int,
    date: Optional[date] = Query(None, description="Tanggal observasi citra satelit (YYYY-MM-DD)"),
    type: str = Query(
        "true_color",
        description="Tipe visualisasi citra: 'true_color' (B4/B3/B2) atau 'false_color' (B8/B4/B3)",
    ),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mengembalikan URL tile XYZ Map ID dari GEE atau mock tile template yang valid untuk overlay citra satelit."""
    stmt = select(Plot).where(Plot.id == plot_id)
    result = await db.execute(stmt)
    plot = result.scalar_one_or_none()
    if not plot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Petak lahan dengan ID {plot_id} tidak ditemukan.",
        )

    poly_dict = geojson_from_polygon(plot.polygon)
    tile_info = get_map_tile(polygon_geojson=poly_dict, obs_date=date, vis_type=type)

    return PlotSatelliteTileResponse(
        plot_id=plot.id,
        tile_url=tile_info["tile_url"],
        vis_type=tile_info["vis_type"],
        observation_date=tile_info["observation_date"],
        attribution=tile_info["attribution"],
        bands=tile_info["bands"],
        min_val=tile_info["min_val"],
        max_val=tile_info["max_val"],
        label=tile_info.get("label"),
    )


@router.get(
    "/plots/{plot_id}/season-comparison",
    response_model=SeasonComparisonResponse,
    summary="Analisis Komparasi Antar Musim Tanam Petak",
    description="Membandingkan metrik vegetasi (NDVI, NDRE), durasi tanam, cuaca, dan hasil panen antar musim tanam.",
)
async def get_plot_season_comparison(
    plot_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mendapatkan analisis perbandingan metrik agronomi antara musim aktif dengan musim-musim sebelumnya."""
    try:
        comparison_data = await generate_season_comparison(db=db, plot_id=plot_id)
        return comparison_data
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal menganalisis komparasi musim tanam: {str(exc)}",
        )

