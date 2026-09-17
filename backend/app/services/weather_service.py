"""Service for fetching weather data from Open-Meteo and managing estate weather records."""

from datetime import date, datetime
import logging
from typing import Any, Dict, List, Optional, Tuple
import zoneinfo

import httpx
from sqlalchemy import delete, desc, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.estate import Estate
from app.models.weather_data import WeatherData
from app.schemas.weather import WeatherCurrentResponse, WeatherDataResponse
from app.services.et0_calculator import calculate_daily_et0
from app.utils.geo import coordinates_from_point

logger = logging.getLogger(__name__)

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

try:
    JAKARTA_TZ = zoneinfo.ZoneInfo("Asia/Jakarta")
except Exception:
    from datetime import timezone, timedelta
    JAKARTA_TZ = timezone(timedelta(hours=7))

# Daily metrics requested from Open-Meteo API
OPEN_METEO_DAILY_VARS = (
    "temperature_2m_max,"
    "temperature_2m_min,"
    "relative_humidity_2m_mean,"
    "wind_speed_10m_max,"
    "shortwave_radiation_sum,"
    "precipitation_sum,"
    "et0_fao_evapotranspiration"
)


def _determine_condition_text(rainfall_mm: Optional[float], solar_mjm2: Optional[float]) -> str:
    """Helper to derive readable Indonesian weather condition text."""
    if rainfall_mm is not None:
        if rainfall_mm >= 50.0:
            return "Hujan Sangat Lebat"
        if rainfall_mm >= 20.0:
            return "Hujan Lebat"
        if rainfall_mm >= 5.0:
            return "Hujan Sedang"
        if rainfall_mm > 0.5:
            return "Hujan Ringan"
        if rainfall_mm > 0.0:
            return "Gerimis / Berawan"

    if solar_mjm2 is not None:
        if solar_mjm2 >= 18.0:
            return "Cerah Terik"
        if solar_mjm2 >= 12.0:
            return "Cerah Berawan"
        return "Berawan"

    return "Cerah Berawan"


async def fetch_weather_from_open_meteo(
    latitude: float,
    longitude: float,
    past_days: int = 7,
    forecast_days: int = 16,
    timeout_seconds: float = 15.0,
) -> Dict[str, Any]:
    """Fetch daily historical and forecast meteorological data from Open-Meteo API.

    Args:
        latitude: Latitude coordinate.
        longitude: Longitude coordinate.
        past_days: Number of historical days to fetch (default: 7).
        forecast_days: Number of forecast days to fetch (default: 16).
        timeout_seconds: Request timeout in seconds.

    Returns:
        Parsed JSON dictionary response from Open-Meteo.
    """
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "daily": OPEN_METEO_DAILY_VARS,
        "wind_speed_unit": "ms",
        "timezone": "Asia/Jakarta",
        "past_days": past_days,
        "forecast_days": forecast_days,
    }

    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
        response = await client.get(OPEN_METEO_URL, params=params)
        response.raise_for_status()
        return response.json()


async def upsert_weather_records(
    db: AsyncSession,
    records: List[Dict[str, Any]],
) -> int:
    """Persist weather records to database using atomic PostgreSQL upsert (ON CONFLICT).

    Args:
        db: Async database session.
        records: List of weather attribute dictionaries.

    Returns:
        Number of processed records.
    """
    if not records:
        return 0

    count = 0
    for rec in records:
        stmt = pg_insert(WeatherData).values(
            estate_id=rec["estate_id"],
            observation_date=rec["observation_date"],
            is_forecast=rec["is_forecast"],
            temp_max_c=rec.get("temp_max_c"),
            temp_min_c=rec.get("temp_min_c"),
            humidity_pct=rec.get("humidity_pct"),
            wind_speed_ms=rec.get("wind_speed_ms"),
            solar_radiation_mjm2=rec.get("solar_radiation_mjm2"),
            rainfall_mm=rec.get("rainfall_mm"),
            et0_mm=rec.get("et0_mm"),
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["estate_id", "observation_date", "is_forecast"],
            set_={
                "temp_max_c": stmt.excluded.temp_max_c,
                "temp_min_c": stmt.excluded.temp_min_c,
                "humidity_pct": stmt.excluded.humidity_pct,
                "wind_speed_ms": stmt.excluded.wind_speed_ms,
                "solar_radiation_mjm2": stmt.excluded.solar_radiation_mjm2,
                "rainfall_mm": stmt.excluded.rainfall_mm,
                "et0_mm": stmt.excluded.et0_mm,
            },
        )
        await db.execute(stmt)
        count += 1

    await db.commit()
    return count


async def sync_weather_for_estate(
    db: AsyncSession,
    estate: Estate,
    past_days: int = 7,
    forecast_days: int = 16,
) -> int:
    """Fetch and synchronize weather data from Open-Meteo for a single estate.

    Args:
        db: Async database session.
        estate: Estate ORM instance.
        past_days: Number of past days (default: 7).
        forecast_days: Number of forecast days (default: 16).

    Returns:
        Count of upserted weather records.
    """
    lat, lng = coordinates_from_point(estate.location_point)
    if lat is None or lng is None:
        logger.warning("Estate ID %s (%s) does not have valid coordinates, skipping weather sync.", estate.id, estate.name)
        return 0

    data = await fetch_weather_from_open_meteo(
        latitude=lat,
        longitude=lng,
        past_days=past_days,
        forecast_days=forecast_days,
    )

    daily = data.get("daily") or {}
    dates: List[str] = daily.get("time") or []
    if not dates:
        return 0

    elevation_raw = data.get("elevation")
    elevation = float(elevation_raw) if elevation_raw is not None else 0.0
    t_max_list = daily.get("temperature_2m_max") or []
    t_min_list = daily.get("temperature_2m_min") or []
    rh_list = daily.get("relative_humidity_2m_mean") or []
    wind_list = daily.get("wind_speed_10m_max") or []
    solar_list = daily.get("shortwave_radiation_sum") or []
    rain_list = daily.get("precipitation_sum") or []
    et0_openmeteo_list = daily.get("et0_fao_evapotranspiration") or []

    today_date = datetime.now(JAKARTA_TZ).date()
    records_to_upsert: List[Dict[str, Any]] = []

    for idx, date_str in enumerate(dates):
        obs_date = datetime.strptime(date_str, "%Y-%m-%d").date()

        t_max = t_max_list[idx] if idx < len(t_max_list) else None
        t_min = t_min_list[idx] if idx < len(t_min_list) else None
        rh = rh_list[idx] if idx < len(rh_list) else None
        wind = wind_list[idx] if idx < len(wind_list) else None
        solar = solar_list[idx] if idx < len(solar_list) else None
        rain = rain_list[idx] if idx < len(rain_list) else None
        fallback_et0 = et0_openmeteo_list[idx] if idx < len(et0_openmeteo_list) else None

        # Compute ET₀ via FAO-56 Penman-Monteith (with fallback)
        calculated_et0 = calculate_daily_et0(
            temp_max_c=t_max,
            temp_min_c=t_min,
            humidity_pct=rh,
            wind_speed_ms=wind,
            solar_radiation_mjm2=solar,
            latitude_deg=lat,
            elevation_m=elevation,
            observation_date=obs_date,
            wind_height_m=10.0,
            fallback_et0=fallback_et0,
        )

        base_dict = {
            "estate_id": estate.id,
            "observation_date": obs_date,
            "temp_max_c": t_max,
            "temp_min_c": t_min,
            "humidity_pct": rh,
            "wind_speed_ms": wind,
            "solar_radiation_mjm2": solar,
            "rainfall_mm": rain,
            "et0_mm": calculated_et0,
        }

        if obs_date < today_date:
            # Historical observation
            records_to_upsert.append({**base_dict, "is_forecast": False})
        elif obs_date == today_date:
            # Current day: store as observation and also as forecast start
            records_to_upsert.append({**base_dict, "is_forecast": False})
            records_to_upsert.append({**base_dict, "is_forecast": True})
        else:
            # Future forecast
            records_to_upsert.append({**base_dict, "is_forecast": True})

    count = await upsert_weather_records(db, records_to_upsert)
    logger.info("Successfully synced %s weather records for estate %s (%s).", count, estate.id, estate.name)
    return count


async def sync_weather_for_all_estates(db: AsyncSession) -> Dict[str, Any]:
    """Fetch and sync weather for all estates having geographic coordinates.

    Returns:
        Dictionary with sync statistics.
    """
    stmt = select(Estate).where(Estate.location_point.is_not(None))
    result = await db.execute(stmt)
    estates = result.scalars().all()

    processed = 0
    total_records = 0
    errors: List[str] = []

    for estate in estates:
        try:
            records = await sync_weather_for_estate(db, estate)
            processed += 1
            total_records += records
        except Exception as exc:
            error_msg = f"Gagal mengambil cuaca untuk estate ID {estate.id} ({estate.name}): {str(exc)}"
            logger.error(error_msg, exc_info=True)
            errors.append(error_msg)

    return {
        "status": "success" if not errors else "partial_success",
        "message": f"Selesai memproses {processed} dari {len(estates)} kebun.",
        "estates_processed": processed,
        "records_synced": total_records,
        "errors": errors,
    }


async def get_estate_weather_timeseries(
    db: AsyncSession,
    estate_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    is_forecast: Optional[bool] = None,
) -> List[WeatherData]:
    """Retrieve time-series of recorded weather data for an estate.

    Args:
        db: Async database session.
        estate_id: ID of the estate.
        start_date: Optional start date filter.
        end_date: Optional end date filter.
        is_forecast: Optional filter for forecast vs historical (default None: all or historical).

    Returns:
        List of WeatherData records ordered by observation_date asc.
    """
    stmt = select(WeatherData).where(WeatherData.estate_id == estate_id)

    if is_forecast is not None:
        stmt = stmt.where(WeatherData.is_forecast == is_forecast)
    if start_date is not None:
        stmt = stmt.where(WeatherData.observation_date >= start_date)
    if end_date is not None:
        stmt = stmt.where(WeatherData.observation_date <= end_date)

    stmt = stmt.order_by(WeatherData.observation_date.asc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_estate_current_weather(
    db: AsyncSession,
    estate: Estate,
) -> Optional[WeatherCurrentResponse]:
    """Retrieve today's current weather data and ET₀ for an estate.

    If today's record has not been recorded yet, returns the latest available observation.
    """
    today_date = datetime.now(JAKARTA_TZ).date()

    # 1. First look for today's historical or current observation (is_forecast=False)
    stmt = (
        select(WeatherData)
        .where(
            WeatherData.estate_id == estate.id,
            WeatherData.observation_date == today_date,
            WeatherData.is_forecast.is_(False),
        )
        .order_by(desc(WeatherData.created_at))
        .limit(1)
    )
    result = await db.execute(stmt)
    record = result.scalar_one_or_none()

    # 2. If not found, look for today's forecast record
    if record is None:
        stmt_forecast = (
            select(WeatherData)
            .where(
                WeatherData.estate_id == estate.id,
                WeatherData.observation_date == today_date,
            )
            .order_by(desc(WeatherData.created_at))
            .limit(1)
        )
        result_forecast = await db.execute(stmt_forecast)
        record = result_forecast.scalar_one_or_none()

    # 3. If still not found, fetch the most recent recorded observation <= today
    if record is None:
        stmt_latest = (
            select(WeatherData)
            .where(
                WeatherData.estate_id == estate.id,
                WeatherData.observation_date <= today_date,
            )
            .order_by(desc(WeatherData.observation_date))
            .limit(1)
        )
        result_latest = await db.execute(stmt_latest)
        record = result_latest.scalar_one_or_none()

    if record is None:
        return None

    # Calculate mean temperature if available
    temp_mean = None
    if record.temp_max_c is not None and record.temp_min_c is not None:
        temp_mean = round((record.temp_max_c + record.temp_min_c) / 2.0, 1)

    condition = _determine_condition_text(record.rainfall_mm, record.solar_radiation_mjm2)

    return WeatherCurrentResponse(
        estate_id=estate.id,
        estate_name=estate.name,
        observation_date=record.observation_date,
        is_forecast=record.is_forecast,
        temp_max_c=record.temp_max_c,
        temp_min_c=record.temp_min_c,
        temp_mean_c=temp_mean,
        humidity_pct=record.humidity_pct,
        wind_speed_ms=record.wind_speed_ms,
        solar_radiation_mjm2=record.solar_radiation_mjm2,
        rainfall_mm=record.rainfall_mm,
        et0_mm=record.et0_mm,
        condition_text=condition,
        weather_record=WeatherDataResponse.model_validate(record),
    )


async def get_estate_weather_forecast(
    db: AsyncSession,
    estate_id: int,
    days: int = 16,
) -> List[WeatherData]:
    """Retrieve upcoming 16-day forecast weather data for an estate.

    Returns:
        List of WeatherData records with is_forecast=True ordered by observation_date asc.
    """
    today_date = datetime.now(JAKARTA_TZ).date()

    stmt = (
        select(WeatherData)
        .where(
            WeatherData.estate_id == estate_id,
            WeatherData.is_forecast.is_(True),
            WeatherData.observation_date >= today_date,
        )
        .order_by(WeatherData.observation_date.asc())
        .limit(days)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())
