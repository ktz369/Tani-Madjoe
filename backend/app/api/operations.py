"""Operational precision-agriculture endpoints (OPS-04).

Wired to the frontend `lib/operationsApi.ts` client, which is mounted under the
documented `/api/v1` prefix:

    GET/POST /v1/plots/{plot_id}/labor                  -> HOK labor logs
    GET/POST /v1/plots/{plot_id}/irrigation             -> irrigation & fuel logs
    GET/POST /v1/saprotan                               -> saprotan catalog / inventory
    POST     /v1/plots/{plot_id}/apply-saprotan         -> application + PHI guardrail
    GET/POST /v1/plots/{plot_id}/scouting               -> pest (OPT) scouting reports
    GET      /v1/plots/{plot_id}/financial-summary      -> running HPP / unit economics
    POST     /v1/plots/{plot_id}/harvest-closing        -> season closing (14% moisture)
    GET      /v1/plots/{plot_id}/post-harvest           -> harvest archive
"""
import logging
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.database import get_db
from app.models.crop_variety import CropVariety
from app.models.gdd_accumulation import GddAccumulation
from app.models.operations import (
    PestScoutingReport,
    PestSeverity,
    PlotIrrigationLog,
    PlotLaborLog,
    PlotSaprotanApplication,
    PostHarvestLog,
    SaprotanCategory,
    SaprotanItem,
    TaskType,
    WaterSource,
)
from app.models.planting_season import PlantingSeason
from app.models.plot import Plot
from app.models.user import User
from app.schemas.operations import (
    HarvestClosingCreate,
    IrrigationLogCreate,
    LaborLogCreate,
    PestScoutingCreate,
    SaprotanApplicationCreate,
    SaprotanItemCreate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", tags=["Operasional Presisi (OPS-04)"])

STANDARD_MOISTURE_PCT = 14.0
DEFAULT_YIELD_TON_PER_HA = 7.5
MARKET_REFERENCE_PRICE_PER_KG = {"padi": 6500.0, "jagung": 5000.0}
DEFAULT_MARKET_REFERENCE_PRICE = 6500.0


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _iso(value: Optional[datetime]) -> Optional[str]:
    """Serialize a datetime as UTC ISO-8601 with explicit `Z` suffix."""
    if value is None:
        return None
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value.strftime("%Y-%m-%dT%H:%M:%SZ")


def _naive_utc(value: Optional[datetime]) -> Optional[datetime]:
    """Normalize an incoming datetime to naive UTC for `timestamp without time zone`."""
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _enum_or_400(enum_cls, raw: str, label: str):
    """Validate a raw string against an enum class, raising a friendly 400."""
    try:
        return enum_cls(raw)
    except ValueError:
        allowed = ", ".join(m.value for m in enum_cls)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{label} '{raw}' tidak valid. Pilihan: {allowed}.",
        )


async def _get_plot_or_404(db: AsyncSession, plot_id: int) -> Plot:
    result = await db.execute(select(Plot).where(Plot.id == plot_id))
    plot = result.scalar_one_or_none()
    if plot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Petak dengan ID {plot_id} tidak ditemukan.",
        )
    return plot


async def _plot_cost_totals(db: AsyncSession, plot_id: int) -> Dict[str, float]:
    """Aggregate running costs (labor, irrigation/fuel, saprotan) for a plot."""
    labor_res = await db.execute(
        select(
            func.coalesce(func.sum(PlotLaborLog.total_cost), 0.0),
            func.count(PlotLaborLog.id),
        ).where(PlotLaborLog.plot_id == plot_id)
    )
    labor_cost, labor_count = labor_res.one()

    irrigation_res = await db.execute(
        select(
            func.coalesce(func.sum(PlotIrrigationLog.fuel_cost), 0.0),
            func.count(PlotIrrigationLog.id),
        ).where(PlotIrrigationLog.plot_id == plot_id)
    )
    irrigation_cost, irrigation_count = irrigation_res.one()

    saprotan_res = await db.execute(
        select(
            func.coalesce(func.sum(PlotSaprotanApplication.total_cost), 0.0),
            func.count(PlotSaprotanApplication.id),
        ).where(PlotSaprotanApplication.plot_id == plot_id)
    )
    saprotan_cost, saprotan_count = saprotan_res.one()

    return {
        "labor_cost": float(labor_cost or 0.0),
        "labor_count": int(labor_count or 0),
        "irrigation_cost": float(irrigation_cost or 0.0),
        "irrigation_count": int(irrigation_count or 0),
        "saprotan_cost": float(saprotan_cost or 0.0),
        "saprotan_count": int(saprotan_count or 0),
        "total_cost": float((labor_cost or 0.0) + (irrigation_cost or 0.0) + (saprotan_cost or 0.0)),
    }


async def _resolve_season_context(
    db: AsyncSession, plot: Plot
) -> Dict[str, Any]:
    """Resolve the (active) planting season + variety + projected harvest date."""
    season_res = await db.execute(
        select(PlantingSeason)
        .where(PlantingSeason.plot_id == plot.id)
        .order_by(PlantingSeason.planting_date.desc())
    )
    seasons = season_res.scalars().all()
    active = next((s for s in seasons if s.status == "active"), None)
    season = active or (seasons[0] if seasons else None)

    variety: Optional[CropVariety] = None
    variety_id = season.variety_id if season else plot.variety_id
    if variety_id:
        variety_res = await db.execute(select(CropVariety).where(CropVariety.id == variety_id))
        variety = variety_res.scalar_one_or_none()

    gdd_res = await db.execute(
        select(GddAccumulation)
        .where(GddAccumulation.plot_id == plot.id)
        .order_by(GddAccumulation.observation_date.desc())
        .limit(1)
    )
    gdd = gdd_res.scalar_one_or_none()

    target_harvest_date: Optional[date] = None
    if gdd is not None and gdd.predicted_harvest_date:
        target_harvest_date = gdd.predicted_harvest_date
    elif season is not None and season.harvest_date:
        target_harvest_date = season.harvest_date
    elif season is not None and variety is not None:
        from datetime import timedelta

        target_harvest_date = season.planting_date + timedelta(days=max(variety.cycle_days, 1))

    yield_ton_per_ha = DEFAULT_YIELD_TON_PER_HA
    if season is not None and season.yield_estimate_ton_per_ha:
        yield_ton_per_ha = float(season.yield_estimate_ton_per_ha)

    return {
        "season": season,
        "variety": variety,
        "target_harvest_date": target_harvest_date,
        "yield_ton_per_ha": yield_ton_per_ha,
    }


def _serialize_labor(log: PlotLaborLog) -> Dict[str, Any]:
    return {
        "id": log.id,
        "plot_id": log.plot_id,
        "activity_date": log.activity_date.isoformat() if log.activity_date else None,
        "task_type": log.task_type.value if hasattr(log.task_type, "value") else log.task_type,
        "labor_count": log.labor_count,
        "hours_worked": log.hours_worked,
        "wage_rate_per_day": log.wage_rate_per_day,
        "is_contract": log.is_contract,
        "total_cost": log.total_cost,
        "notes": log.notes,
    }


def _serialize_irrigation(log: PlotIrrigationLog) -> Dict[str, Any]:
    return {
        "id": log.id,
        "plot_id": log.plot_id,
        "water_source": log.water_source,
        "water_volume_m3": log.water_volume_m3,
        "pump_duration_hours": log.pump_duration_hours,
        "fuel_liters": log.fuel_liters,
        "fuel_cost": log.fuel_cost,
        "started_at": _iso(log.started_at),
        "ended_at": _iso(log.ended_at),
    }


def _serialize_saprotan_item(item: SaprotanItem) -> Dict[str, Any]:
    return {
        "id": item.id,
        "name": item.name,
        "category": item.category.value if hasattr(item.category, "value") else item.category,
        "active_ingredient": item.active_ingredient,
        "phi_days": item.phi_days,
        "unit": item.unit,
        "unit_cost": item.unit_cost,
        "stock_qty": item.stock_qty,
    }


def _serialize_application(app: PlotSaprotanApplication, item: Optional[SaprotanItem] = None) -> Dict[str, Any]:
    item = item or app.item
    return {
        "id": app.id,
        "plot_id": app.plot_id,
        "item_id": app.item_id,
        "item_name": item.name if item else None,
        "category": (
            (item.category.value if hasattr(item.category, "value") else item.category)
            if item
            else None
        ),
        "application_date": app.application_date.isoformat() if app.application_date else None,
        "quantity_used": app.quantity_used,
        "unit": item.unit if item else None,
        "unit_cost": item.unit_cost if item else None,
        "total_cost": app.total_cost,
    }


def _serialize_scouting(report: PestScoutingReport) -> Dict[str, Any]:
    return {
        "id": report.id,
        "plot_id": report.plot_id,
        "observation_date": _iso(report.observation_date),
        "pest_type": report.pest_type,
        "severity": (
            report.severity.value if hasattr(report.severity, "value") else report.severity
        ),
        "latitude": report.latitude,
        "longitude": report.longitude,
        "photo_url": report.photo_url,
        "action_taken": report.action_taken,
    }


def _standardize_yield(
    gross_yield_kg: float, moisture_pct: float, dockage_pct: float
) -> float:
    """Net yield standardized to 14% moisture content (SNI-style rafaksi)."""
    dockage_factor = max(0.0, 1.0 - (dockage_pct or 0.0) / 100.0)
    if moisture_pct is not None and moisture_pct < 100.0:
        moisture_factor = max(0.0, (100.0 - moisture_pct) / (100.0 - STANDARD_MOISTURE_PCT))
    else:
        moisture_factor = 1.0
    return round(gross_yield_kg * dockage_factor * moisture_factor, 2)


async def _serialize_post_harvest(
    db: AsyncSession, log: PostHarvestLog
) -> Dict[str, Any]:
    totals = await _plot_cost_totals(db, log.plot_id)
    total_cost = totals["total_cost"]
    net_yield = log.net_yield_kg or 0.0
    revenue = round(net_yield * (log.selling_price_per_kg or 0.0), 2)
    profit = round(revenue - total_cost, 2)
    return {
        "id": log.id,
        "plot_id": log.plot_id,
        "harvest_date": log.harvest_date.isoformat() if log.harvest_date else None,
        "gross_yield_kg": log.gross_yield_kg,
        "moisture_content_pct": log.moisture_content_pct,
        "dockage_pct": log.dockage_pct,
        "net_yield_kg": net_yield,
        "standard_moisture_pct": STANDARD_MOISTURE_PCT,
        "selling_price_per_kg": log.selling_price_per_kg,
        "storage_location": log.storage_location,
        "total_revenue": revenue,
        "total_cost": total_cost,
        "net_profit": profit,
        "roi_pct": round((profit / total_cost) * 100.0, 2) if total_cost > 0 else 0.0,
        "actual_hpp_per_kg": round(total_cost / net_yield, 2) if net_yield > 0 else 0.0,
    }


# --------------------------------------------------------------------------- #
# Labor (HOK)
# --------------------------------------------------------------------------- #
@router.get("/plots/{plot_id}/labor", summary="Rekap log tenaga kerja (HOK) petak")
async def list_labor_logs(
    plot_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    await _get_plot_or_404(db, plot_id)
    result = await db.execute(
        select(PlotLaborLog)
        .where(PlotLaborLog.plot_id == plot_id)
        .order_by(PlotLaborLog.activity_date.desc(), PlotLaborLog.id.desc())
    )
    return [_serialize_labor(log) for log in result.scalars().all()]


@router.post(
    "/plots/{plot_id}/labor",
    status_code=status.HTTP_201_CREATED,
    summary="Catat log tenaga kerja harian / borongan (HOK)",
)
async def create_labor_log(
    plot_id: int,
    payload: LaborLogCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    await _get_plot_or_404(db, plot_id)
    task_type = _enum_or_400(TaskType, payload.task_type, "Jenis pekerjaan")

    total_cost = payload.total_cost
    if total_cost is None:
        total_cost = (
            payload.wage_rate_per_day
            if payload.is_contract
            else payload.wage_rate_per_day * payload.labor_count
        )

    log = PlotLaborLog(
        plot_id=plot_id,
        activity_date=payload.activity_date,
        task_type=task_type,
        labor_count=payload.labor_count,
        hours_worked=payload.hours_worked,
        wage_rate_per_day=payload.wage_rate_per_day,
        is_contract=payload.is_contract,
        total_cost=float(total_cost),
        notes=payload.notes,
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return _serialize_labor(log)


# --------------------------------------------------------------------------- #
# Irrigation
# --------------------------------------------------------------------------- #
@router.get("/plots/{plot_id}/irrigation", summary="Rekap log irigasi & BBM petak")
async def list_irrigation_logs(
    plot_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    await _get_plot_or_404(db, plot_id)
    result = await db.execute(
        select(PlotIrrigationLog)
        .where(PlotIrrigationLog.plot_id == plot_id)
        .order_by(PlotIrrigationLog.started_at.desc(), PlotIrrigationLog.id.desc())
    )
    return [_serialize_irrigation(log) for log in result.scalars().all()]


@router.post(
    "/plots/{plot_id}/irrigation",
    status_code=status.HTTP_201_CREATED,
    summary="Catat log pengairan, volume air, dan konsumsi BBM pompa",
)
async def create_irrigation_log(
    plot_id: int,
    payload: IrrigationLogCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    await _get_plot_or_404(db, plot_id)

    started_at = _naive_utc(payload.started_at)
    ended_at = _naive_utc(payload.ended_at)
    if ended_at < started_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Waktu selesai tidak boleh lebih awal dari waktu mulai pengairan.",
        )

    water_source = payload.water_source
    if water_source not in {m.value for m in WaterSource}:
        allowed = ", ".join(m.value for m in WaterSource)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Sumber air '{water_source}' tidak valid. Pilihan: {allowed}.",
        )

    log = PlotIrrigationLog(
        plot_id=plot_id,
        water_source=water_source,
        water_volume_m3=payload.water_volume_m3,
        pump_duration_hours=payload.pump_duration_hours,
        fuel_liters=payload.fuel_liters,
        fuel_cost=payload.fuel_cost,
        started_at=started_at,
        ended_at=ended_at,
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return _serialize_irrigation(log)


# --------------------------------------------------------------------------- #
# Saprotan catalog
# --------------------------------------------------------------------------- #
@router.get("/saprotan", summary="Katalog & inventori saprotan")
async def list_saprotan_items(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    result = await db.execute(select(SaprotanItem).order_by(SaprotanItem.name.asc()))
    return [_serialize_saprotan_item(item) for item in result.scalars().all()]


@router.post(
    "/saprotan",
    status_code=status.HTTP_201_CREATED,
    summary="Tambah item saprotan (pupuk / pestisida / benih) ke katalog",
)
async def create_saprotan_item(
    payload: SaprotanItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    category = _enum_or_400(SaprotanCategory, payload.category, "Kategori saprotan")
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nama saprotan wajib diisi.",
        )

    existing = await db.execute(
        select(SaprotanItem).where(SaprotanItem.name.ilike(name))
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Saprotan '{name}' sudah terdaftar di katalog.",
        )

    item = SaprotanItem(
        name=name,
        category=category,
        active_ingredient=payload.active_ingredient or "",
        phi_days=payload.phi_days,
        unit=payload.unit or "kg",
        unit_cost=payload.unit_cost,
        stock_qty=payload.stock_qty,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return _serialize_saprotan_item(item)


# --------------------------------------------------------------------------- #
# Saprotan applications (with PHI guardrail)
# --------------------------------------------------------------------------- #
@router.get(
    "/plots/{plot_id}/saprotan-applications",
    summary="Riwayat aplikasi saprotan pada petak",
)
async def list_saprotan_applications(
    plot_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    await _get_plot_or_404(db, plot_id)
    result = await db.execute(
        select(PlotSaprotanApplication)
        .where(PlotSaprotanApplication.plot_id == plot_id)
        .options(selectinload(PlotSaprotanApplication.item))
        .order_by(
            PlotSaprotanApplication.application_date.desc(),
            PlotSaprotanApplication.id.desc(),
        )
    )
    return [_serialize_application(app) for app in result.scalars().all()]


@router.post(
    "/plots/{plot_id}/apply-saprotan",
    status_code=status.HTTP_201_CREATED,
    summary="Catat aplikasi saprotan dengan validasi PHI (pre-harvest interval)",
)
async def apply_saprotan(
    plot_id: int,
    payload: SaprotanApplicationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    await _get_plot_or_404(db, plot_id)

    item_res = await db.execute(select(SaprotanItem).where(SaprotanItem.id == payload.item_id))
    item = item_res.scalar_one_or_none()
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Item saprotan dengan ID {payload.item_id} tidak ditemukan.",
        )

    if payload.quantity_used <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Jumlah aplikasi harus lebih besar dari 0.",
        )

    # --- PHI guardrail: lock pesticides applied too close to the harvest date ---
    if payload.target_harvest_date and item.phi_days and item.phi_days > 0:
        days_remaining = (payload.target_harvest_date - payload.application_date).days
        if days_remaining < item.phi_days:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Pelanggaran Batas Residu Kimiawi (PHI Lock): '{item.name}' memiliki masa "
                    f"tunggu {item.phi_days} hari, sementara sisa {days_remaining} hari menuju panen. "
                    f"Aplikasi diblokir demi keamanan pangan."
                ),
            )

    total_cost = payload.total_cost
    if total_cost is None:
        total_cost = round(payload.quantity_used * (item.unit_cost or 0.0), 2)

    app = PlotSaprotanApplication(
        plot_id=plot_id,
        item_id=item.id,
        application_date=payload.application_date,
        quantity_used=payload.quantity_used,
        total_cost=float(total_cost),
    )
    db.add(app)

    # Inventory depletion (clamped at zero so the ledger never goes negative).
    item.stock_qty = max(0.0, round((item.stock_qty or 0.0) - payload.quantity_used, 3))

    await db.commit()
    await db.refresh(app)
    return _serialize_application(app, item)


# --------------------------------------------------------------------------- #
# Pest (OPT) scouting
# --------------------------------------------------------------------------- #
@router.get("/plots/{plot_id}/scouting", summary="Riwayat laporan pengamatan OPT")
async def list_scouting_reports(
    plot_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    await _get_plot_or_404(db, plot_id)
    result = await db.execute(
        select(PestScoutingReport)
        .where(PestScoutingReport.plot_id == plot_id)
        .order_by(
            PestScoutingReport.observation_date.desc(),
            PestScoutingReport.id.desc(),
        )
    )
    return [_serialize_scouting(report) for report in result.scalars().all()]


@router.post(
    "/plots/{plot_id}/scouting",
    status_code=status.HTTP_201_CREATED,
    summary="Catat laporan pengamatan hama & penyakit (OPT) dengan koordinat GPS",
)
async def create_scouting_report(
    plot_id: int,
    payload: PestScoutingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    await _get_plot_or_404(db, plot_id)
    severity = _enum_or_400(PestSeverity, payload.severity, "Tingkat serangan")

    pest_type = (payload.pest_type or "").strip()
    if not pest_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Jenis hama / penyakit (OPT) wajib diisi.",
        )

    report = PestScoutingReport(
        plot_id=plot_id,
        observation_date=_naive_utc(payload.observation_date) or datetime.utcnow(),
        pest_type=pest_type,
        severity=severity,
        latitude=payload.latitude,
        longitude=payload.longitude,
        photo_url=payload.photo_url,
        action_taken=payload.action_taken,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return _serialize_scouting(report)


# --------------------------------------------------------------------------- #
# Financial summary (running HPP / unit economics)
# --------------------------------------------------------------------------- #
@router.get(
    "/plots/{plot_id}/financial-summary",
    summary="Kalkulasi HPP riil per kg dan rekapitulasi beban berjalan petak",
)
async def get_financial_summary(
    plot_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    plot = await _get_plot_or_404(db, plot_id)
    totals = await _plot_cost_totals(db, plot_id)
    ctx = await _resolve_season_context(db, plot)

    area = float(plot.area_hectares or 0.0)
    projected_yield_kg = round(ctx["yield_ton_per_ha"] * area * 1000.0, 2)
    projected_yield_ton = round(projected_yield_kg / 1000.0, 2)

    land_rental_cost = 0.0
    labor_cost = totals["labor_cost"]
    irrigation_cost = totals["irrigation_cost"]
    saprotan_cost = totals["saprotan_cost"]
    total_running_cost = round(
        labor_cost + irrigation_cost + saprotan_cost + land_rental_cost, 2
    )

    projected_hpp = (
        round(total_running_cost / projected_yield_kg, 2) if projected_yield_kg > 0 else 0.0
    )
    reference_price = MARKET_REFERENCE_PRICE_PER_KG.get(
        (plot.crop_type or "").lower(), DEFAULT_MARKET_REFERENCE_PRICE
    )
    potential_revenue = projected_yield_kg * reference_price
    efficiency_ratio = (
        round(total_running_cost / potential_revenue, 4) if potential_revenue > 0 else 0.0
    )
    if efficiency_ratio <= 0.70:
        efficiency_status = "optimal"
    elif efficiency_ratio <= 0.90:
        efficiency_status = "waspada"
    else:
        efficiency_status = "over_budget"

    return {
        "plot_id": plot.id,
        "plot_name": plot.name,
        "area_hectares": area,
        "total_labor_cost": labor_cost,
        "total_irrigation_cost": irrigation_cost,
        "total_saprotan_cost": saprotan_cost,
        "land_rental_cost": land_rental_cost,
        "total_running_cost": total_running_cost,
        "projected_yield_kg": projected_yield_kg,
        "projected_yield_ton": projected_yield_ton,
        "projected_hpp_per_kg": projected_hpp,
        "market_reference_price_per_kg": reference_price,
        "efficiency_ratio": efficiency_ratio,
        "efficiency_status": efficiency_status,
        "target_harvest_date": (
            ctx["target_harvest_date"].isoformat() if ctx["target_harvest_date"] else None
        ),
        "cost_breakdown": {
            "labor": labor_cost,
            "saprotan": saprotan_cost,
            "irrigation": irrigation_cost,
            "land_rental": land_rental_cost,
        },
        "labor_logs_count": totals["labor_count"],
        "irrigation_logs_count": totals["irrigation_count"],
        "saprotan_applications_count": totals["saprotan_count"],
    }


# --------------------------------------------------------------------------- #
# Harvest closing & post-harvest archive
# --------------------------------------------------------------------------- #
@router.post(
    "/plots/{plot_id}/harvest-closing",
    status_code=status.HTTP_201_CREATED,
    summary="Tutup musim tanam: rafaksi kadar air 14% + arsip metrik musim",
)
async def close_harvest(
    plot_id: int,
    payload: HarvestClosingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    plot = await _get_plot_or_404(db, plot_id)
    ctx = await _resolve_season_context(db, plot)

    net_yield = _standardize_yield(
        payload.gross_yield_kg, payload.moisture_content_pct, payload.dockage_pct
    )

    log = PostHarvestLog(
        plot_id=plot_id,
        harvest_date=payload.harvest_date,
        gross_yield_kg=payload.gross_yield_kg,
        moisture_content_pct=payload.moisture_content_pct,
        dockage_pct=payload.dockage_pct,
        net_yield_kg=net_yield,
        selling_price_per_kg=payload.selling_price_per_kg,
        storage_location=payload.storage_location,
    )
    db.add(log)

    # Close the active season so the UI can switch to the post-harvest report.
    season = ctx["season"]
    if season is not None and season.status == "active":
        season.status = "harvested"
        season.harvest_date = payload.harvest_date

    await db.commit()
    await db.refresh(log)
    return await _serialize_post_harvest(db, log)


@router.get(
    "/plots/{plot_id}/post-harvest",
    summary="Arsip rekonsiliasi panen (bobot netto standar 14% KA)",
)
async def list_post_harvest_logs(
    plot_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    await _get_plot_or_404(db, plot_id)
    result = await db.execute(
        select(PostHarvestLog)
        .where(PostHarvestLog.plot_id == plot_id)
        .order_by(PostHarvestLog.harvest_date.desc(), PostHarvestLog.id.desc())
    )
    logs = result.scalars().all()
    return [await _serialize_post_harvest(db, log) for log in logs]
