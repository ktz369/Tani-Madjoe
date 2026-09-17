from __future__ import annotations

"""Service for Growing Degree Days (GDD) calculations, phenology prediction, and crop water needs (ETc).

Implements agronomic thermal time tracking:
- Daily GDD calculation for padi (standard base temp ~10°C) and jagung (temperature capping 10°C - 30°C).
- Cumulative thermal time tracking per plot based on local estate weather observations.
- Phenology growth phase prediction based on crop variety target GDDs.
- Harvest date prediction based on remaining thermal units required.
- Actual crop evapotranspiration (ETc = ET0 × Kc) derived from the active phenological phase.
"""

from datetime import date, datetime, timedelta
import logging
import math
from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.models.crop_variety import CropVariety
    from app.models.division import Division
    from app.models.gdd_accumulation import GddAccumulation
    from app.models.phenology_phase import PhenologyPhase
    from app.models.plot import Plot
    from app.models.weather_data import WeatherData

logger = logging.getLogger(__name__)


def calculate_gdd_daily(
    tmax: Optional[float],
    tmin: Optional[float],
    tbase: float = 10.0,
    crop_type: str = "padi",
) -> float:
    """Calculate daily Growing Degree Days (GDD) in °C-days.

    Args:
        tmax: Maximum daily temperature in °C.
        tmin: Minimum daily temperature in °C.
        tbase: Base development threshold temperature in °C (default 10.0°C).
        crop_type: Crop commodity ('padi' or 'jagung').

    Jagung (Corn) Method:
        Applies temperature capping (Tmax cap 30.0°C, Tmin floor 10.0°C):
        - If tmax > 30.0 -> tmax = 30.0
        - If tmin < 10.0 -> tmin = 10.0
        - If tmax < 10.0 -> tmax = 10.0
        - If tmin > 30.0 -> tmin = 30.0
        Tmean = (tmax + tmin) / 2.0
        GDD = max(0.0, Tmean - tbase)

    Padi (Rice) Method:
        Standard thermal calculation without jagung capping:
        Tmean = (tmax + tmin) / 2.0
        GDD = max(0.0, Tmean - tbase)
    """
    if tmax is None or tmin is None:
        return 0.0
    if math.isnan(tmax) or math.isnan(tmin) or math.isinf(tmax) or math.isinf(tmin):
        return 0.0

    eff_tmax = float(tmax)
    eff_tmin = float(tmin)
    crop = (crop_type or "padi").strip().lower()

    if crop == "jagung":
        if eff_tmax > 30.0:
            eff_tmax = 30.0
        if eff_tmin < 10.0:
            eff_tmin = 10.0
        if eff_tmax < 10.0:
            eff_tmax = 10.0
        if eff_tmin > 30.0:
            eff_tmin = 30.0

    tmean = (eff_tmax + eff_tmin) / 2.0
    gdd = max(0.0, tmean - float(tbase))
    return round(gdd, 2)


def _get_phase_attr(phase: Any, key: str) -> Any:
    """Helper to extract attribute from either a dictionary or an ORM object."""
    if isinstance(phase, dict):
        return phase.get(key)
    return getattr(phase, key, None)


def predict_phase(gdd_cumulative: float, variety_phases: list) -> Optional[str]:
    """Predict active phenological growth phase based on cumulative GDD.

    Sorts variety_phases by gdd_target ascending and locates the corresponding phase.
    If gdd_cumulative exceeds the last phase target, returns the last phase.
    """
    if gdd_cumulative is None or math.isnan(gdd_cumulative) or math.isinf(gdd_cumulative):
        return None

    if not variety_phases:
        return None

    valid_phases = [p for p in variety_phases if _get_phase_attr(p, "gdd_target") is not None]
    if not valid_phases:
        return None

    sorted_phases = sorted(valid_phases, key=lambda p: float(_get_phase_attr(p, "gdd_target")))

    for phase in sorted_phases:
        target = float(_get_phase_attr(phase, "gdd_target"))
        if gdd_cumulative <= target:
            name = _get_phase_attr(phase, "phase_name")
            return str(name)[:50] if name else None

    last_phase_name = _get_phase_attr(sorted_phases[-1], "phase_name")
    return str(last_phase_name)[:50] if last_phase_name else None


def get_active_phase(gdd_cumulative: float, variety_phases: list) -> Optional[Any]:
    """Get the active phase object or dictionary based on cumulative GDD."""
    if gdd_cumulative is None or math.isnan(gdd_cumulative) or math.isinf(gdd_cumulative):
        return None

    if not variety_phases:
        return None

    valid_phases = [p for p in variety_phases if _get_phase_attr(p, "gdd_target") is not None]
    if not valid_phases:
        return None

    sorted_phases = sorted(valid_phases, key=lambda p: float(_get_phase_attr(p, "gdd_target")))

    for phase in sorted_phases:
        target = float(_get_phase_attr(phase, "gdd_target"))
        if gdd_cumulative <= target:
            return phase

    return sorted_phases[-1]


def predict_harvest_date(
    planting_date: Optional[date],
    gdd_cumulative: float,
    gdd_target_total: float,
    avg_daily_gdd: float = 15.0,
) -> Optional[date]:
    """Estimate physiological harvest date based on remaining thermal units required.

    Args:
        planting_date: Plot planting date.
        gdd_cumulative: Accumulated GDD to date.
        gdd_target_total: Total GDD required for physiological maturity.
        avg_daily_gdd: Expected average daily GDD (default 15.0°C-days).
    """
    if gdd_target_total is None or gdd_target_total <= 0 or math.isnan(gdd_target_total) or math.isinf(gdd_target_total):
        return None
    if gdd_cumulative is not None and (math.isnan(gdd_cumulative) or math.isinf(gdd_cumulative)):
        return None

    eff_cum = max(0.0, float(gdd_cumulative)) if gdd_cumulative is not None else 0.0
    remaining_gdd = max(0.0, float(gdd_target_total) - eff_cum)
    rate = float(avg_daily_gdd) if avg_daily_gdd and avg_daily_gdd > 0 else 15.0
    days_left = round(remaining_gdd / rate)

    base_date = planting_date if (planting_date and planting_date > date.today()) else date.today()
    return base_date + timedelta(days=int(days_left))


def calculate_etc(et0: Optional[float], kc: Optional[float]) -> Optional[float]:
    """Calculate crop evapotranspiration (ETc = ET0 × Kc) in mm/day.

    Args:
        et0: Reference evapotranspiration in mm.
        kc: Crop coefficient for the active growth stage.
    """
    if et0 is None or kc is None:
        return None
    if math.isnan(et0) or math.isnan(kc) or math.isinf(et0) or math.isinf(kc):
        return None
    return round(float(et0) * float(kc), 2)


async def sync_gdd_for_plot(db: AsyncSession, plot_id: int) -> Dict[str, Any]:
    """Synchronize daily GDD accumulation and phenology predictions for a single plot.

    Computes daily GDD, cumulative GDD, active phase, ETc, and predicted harvest date
    from planting_date up to date.today(), storing results in gdd_accumulation.
    Also updates plot.current_phase and plot.current_hst.
    """
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.models.crop_variety import CropVariety
    from app.models.division import Division
    from app.models.gdd_accumulation import GddAccumulation
    from app.models.phenology_phase import PhenologyPhase
    from app.models.plot import Plot
    from app.models.weather_data import WeatherData

    stmt = (
        select(Plot)
        .options(
            selectinload(Plot.variety).selectinload(CropVariety.phases),
            selectinload(Plot.division).selectinload(Division.estate),
        )
        .where(Plot.id == plot_id)
    )
    result = await db.execute(stmt)
    plot = result.scalar_one_or_none()

    if not plot:
        return {
            "status": "error",
            "message": f"Petak lahan ID {plot_id} tidak ditemukan.",
            "plot_id": plot_id,
            "records_synced": 0,
        }

    if not plot.planting_date:
        return {
            "status": "skipped",
            "message": f"Petak '{plot.name}' (ID {plot.id}) belum memiliki tanggal tanam aktif.",
            "plot_id": plot_id,
            "records_synced": 0,
        }

    # Load variety and its phenology phases
    variety = plot.variety
    if not variety:
        var_stmt = (
            select(CropVariety)
            .options(selectinload(CropVariety.phases))
            .where(CropVariety.crop_type == plot.crop_type)
            .order_by(CropVariety.id.asc())
            .limit(1)
        )
        var_res = await db.execute(var_stmt)
        variety = var_res.scalar_one_or_none()

    tbase = variety.t_base if variety else 10.0
    phases = variety.phases if variety and variety.phases else []
    sorted_phases = sorted(phases, key=lambda p: p.gdd_target) if phases else []
    gdd_target_total = (
        sorted_phases[-1].gdd_target
        if sorted_phases
        else (1950.0 if plot.crop_type == "padi" else 1780.0)
    )

    # Fetch weather data for the estate
    estate = plot.division.estate if plot.division and plot.division.estate else None
    weather_by_date: Dict[date, WeatherData] = {}
    if estate:
        w_stmt = (
            select(WeatherData)
            .where(
                WeatherData.estate_id == estate.id,
                WeatherData.observation_date >= plot.planting_date,
                WeatherData.observation_date <= date.today(),
            )
            .order_by(WeatherData.observation_date.asc(), WeatherData.is_forecast.asc())
        )
        w_res = await db.execute(w_stmt)
        for w in w_res.scalars().all():
            # Actual observations take precedence over forecast
            if w.observation_date not in weather_by_date or not w.is_forecast:
                weather_by_date[w.observation_date] = w

    # Fetch existing GDD records to perform update or insert
    existing_stmt = select(GddAccumulation).where(GddAccumulation.plot_id == plot_id)
    existing_res = await db.execute(existing_stmt)
    existing_records: Dict[date, GddAccumulation] = {
        rec.observation_date: rec for rec in existing_res.scalars().all()
    }

    curr_date = plot.planting_date
    today = date.today()
    cumulative = 0.0
    records_count = 0
    latest_predicted_phase: Optional[str] = None
    latest_predicted_harvest: Optional[date] = None

    while curr_date <= today:
        w_item = weather_by_date.get(curr_date)
        tmax = w_item.temp_max_c if w_item else None
        tmin = w_item.temp_min_c if w_item else None
        et0 = w_item.et0_mm if w_item else None

        daily_gdd = calculate_gdd_daily(tmax, tmin, tbase=tbase, crop_type=plot.crop_type)
        cumulative += daily_gdd
        cumulative = round(cumulative, 2)

        pred_phase = predict_phase(cumulative, sorted_phases)
        active_phase_obj = get_active_phase(cumulative, sorted_phases)
        kc_val = active_phase_obj.kc_value if active_phase_obj else 1.0
        etc_val = calculate_etc(et0, kc_val)
        pred_harvest = predict_harvest_date(plot.planting_date, cumulative, gdd_target_total)

        existing_record = existing_records.get(curr_date)
        if existing_record:
            existing_record.gdd_daily = daily_gdd
            existing_record.gdd_cumulative = cumulative
            existing_record.etc_mm = etc_val
            existing_record.predicted_phase = pred_phase
            existing_record.predicted_harvest_date = pred_harvest
        else:
            new_rec = GddAccumulation(
                plot_id=plot_id,
                observation_date=curr_date,
                gdd_daily=daily_gdd,
                gdd_cumulative=cumulative,
                etc_mm=etc_val,
                predicted_phase=pred_phase,
                predicted_harvest_date=pred_harvest,
            )
            db.add(new_rec)
            existing_records[curr_date] = new_rec

        latest_predicted_phase = pred_phase
        latest_predicted_harvest = pred_harvest
        records_count += 1
        curr_date += timedelta(days=1)

    # Update plot current metrics
    if latest_predicted_phase:
        plot.current_phase = latest_predicted_phase
    plot.current_hst = max(0, (today - plot.planting_date).days)

    await db.commit()

    return {
        "status": "success",
        "message": f"Kalkulasi GDD petak '{plot.name}' berhasil. {records_count} observasi harian diperbarui.",
        "plot_id": plot_id,
        "records_synced": records_count,
        "current_hst": plot.current_hst,
        "current_phase": plot.current_phase,
        "gdd_cumulative": cumulative,
        "predicted_harvest_date": str(latest_predicted_harvest) if latest_predicted_harvest else None,
    }


async def sync_gdd_for_all_plots(db: AsyncSession) -> Dict[str, Any]:
    """Process GDD and phenology prediction for all active agricultural plots."""
    from sqlalchemy import select
    from app.models.plot import Plot

    stmt = select(Plot.id).where(Plot.planting_date.isnot(None))
    result = await db.execute(stmt)
    plot_ids = result.scalars().all()

    total_processed = 0
    total_records = 0
    errors: List[str] = []

    for pid in plot_ids:
        try:
            summary = await sync_gdd_for_plot(db, pid)
            if summary["status"] == "success":
                total_processed += 1
                total_records += summary.get("records_synced", 0)
            elif summary["status"] == "error":
                errors.append(f"Plot {pid}: {summary['message']}")
        except Exception as exc:
            logger.error("Gagal memproses GDD untuk petak ID %s: %s", pid, str(exc), exc_info=True)
            errors.append(f"Plot {pid}: {str(exc)}")

    status_str = "success" if not errors else ("partial_success" if total_processed > 0 else "error")
    msg = (
        f"Pemrosesan kalkulasi GDD selesai. {total_processed} petak diproses, "
        f"{total_records} data akumulasi harian tersimpan."
    )

    return {
        "status": status_str,
        "message": msg,
        "plots_processed": total_processed,
        "records_created": total_records,
        "errors": errors,
    }
