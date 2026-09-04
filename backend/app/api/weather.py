"""API endpoints for estate weather data and ET₀ evapotranspiration."""

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models.estate import Estate
from app.models.user import User
from app.schemas.weather import (
    WeatherCurrentResponse,
    WeatherFetchJobRequest,
    WeatherFetchJobResponse,
    WeatherForecastResponse,
    WeatherDataResponse,
)
from app.services.weather_service import (
    get_estate_current_weather,
    get_estate_weather_forecast,
    get_estate_weather_timeseries,
    sync_weather_for_all_estates,
    sync_weather_for_estate,
)

router = APIRouter(tags=["Cuaca & Evapotranspirasi (Weather)"])


async def _get_estate_or_404(estate_id: int, db: AsyncSession) -> Estate:
    """Helper to fetch estate by ID or raise 404 HTTPException."""
    stmt = select(Estate).where(Estate.id == estate_id)
    result = await db.execute(stmt)
    estate = result.scalar_one_or_none()
    if estate is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Kebun / Estate dengan ID {estate_id} tidak ditemukan.",
        )
    return estate


@router.get(
    "/estates/{estate_id}/weather",
    response_model=List[WeatherDataResponse],
    summary="Ambil riwayat time-series cuaca kebun",
)
async def get_estate_weather(
    estate_id: int,
    start_date: Optional[date] = Query(None, description="Tanggal awal filter (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="Tanggal akhir filter (YYYY-MM-DD)"),
    include_forecast: bool = Query(
        False, description="Sertakan data ramalan/forecast cuaca jika True"
    ),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mengembalikan data time-series cuaca historis yang tercatat untuk kebun tertentu."""
    await _get_estate_or_404(estate_id, db)

    is_forecast_filter = None if include_forecast else False
    records = await get_estate_weather_timeseries(
        db=db,
        estate_id=estate_id,
        start_date=start_date,
        end_date=end_date,
        is_forecast=is_forecast_filter,
    )
    return records


@router.get(
    "/estates/{estate_id}/weather/current",
    response_model=WeatherCurrentResponse,
    summary="Ambil data cuaca hari ini dan ET₀ kebun",
)
async def get_current_weather(
    estate_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mengembalikan observasi cuaca hari ini dan nilai evapotranspirasi ET₀ terkini."""
    estate = await _get_estate_or_404(estate_id, db)

    current_data = await get_estate_current_weather(db, estate)
    if current_data is None:
        # Jika belum ada data cuaca, coba fetch langsung dari Open-Meteo
        if estate.location_point is not None:
            try:
                await sync_weather_for_estate(db, estate)
                current_data = await get_estate_current_weather(db, estate)
            except Exception:
                pass

    if current_data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Data cuaca belum tersedia untuk kebun ini. Pastikan koordinat lokasi kebun sudah diisi.",
        )

    return current_data


@router.get(
    "/estates/{estate_id}/weather/forecast",
    response_model=WeatherForecastResponse,
    summary="Ambil prakiraan cuaca 16 hari ke depan",
)
async def get_weather_forecast(
    estate_id: int,
    days: int = Query(16, ge=1, le=16, description="Jumlah hari prakiraan cuaca (maksimal 16 hari)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mengembalikan prakiraan data cuaca hingga 16 hari ke depan beserta estimasi ET₀."""
    estate = await _get_estate_or_404(estate_id, db)

    forecast_records = await get_estate_weather_forecast(db, estate_id=estate_id, days=days)
    if not forecast_records and estate.location_point is not None:
        # Jika belum ada forecast di database, coba fetch langsung
        try:
            await sync_weather_for_estate(db, estate)
            forecast_records = await get_estate_weather_forecast(
                db, estate_id=estate_id, days=days
            )
        except Exception:
            pass

    return WeatherForecastResponse(
        estate_id=estate.id,
        estate_name=estate.name,
        total_days=len(forecast_records),
        items=[WeatherDataResponse.model_validate(r) for r in forecast_records],
    )


@router.post(
    "/jobs/weather",
    response_model=WeatherFetchJobResponse,
    summary="Trigger sinkronisasi data cuaca Open-Meteo secara manual",
)
async def trigger_weather_fetch_job(
    payload: Optional[WeatherFetchJobRequest] = None,
    estate_id: Optional[int] = Query(
        None, description="ID kebun spesifik (opsional, jika tidak diset maka semua kebun diproses)"
    ),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Endpoint manual trigger untuk memperbarui data cuaca dari Open-Meteo API.

    Bisa menargetkan kebun tertentu atau seluruh kebun yang memiliki koordinat lokasi.
    """
    target_estate_id = None
    if payload and payload.estate_id is not None:
        target_estate_id = payload.estate_id
    elif estate_id is not None:
        target_estate_id = estate_id

    if target_estate_id is not None:
        estate = await _get_estate_or_404(target_estate_id, db)
        try:
            synced_count = await sync_weather_for_estate(db, estate)
            return WeatherFetchJobResponse(
                status="success",
                message=f"Sinkronisasi cuaca berhasil untuk kebun {estate.name}.",
                estates_processed=1,
                records_synced=synced_count,
                errors=[],
            )
        except Exception as exc:
            return WeatherFetchJobResponse(
                status="error",
                message=f"Gagal mengambil cuaca kebun {estate.name}: {str(exc)}",
                estates_processed=0,
                records_synced=0,
                errors=[str(exc)],
            )

    # Sync all estates
    summary = await sync_weather_for_all_estates(db)
    return WeatherFetchJobResponse(
        status=summary["status"],
        message=summary["message"],
        estates_processed=summary["estates_processed"],
        records_synced=summary["records_synced"],
        errors=summary["errors"],
    )
