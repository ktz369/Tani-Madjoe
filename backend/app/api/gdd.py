"""API endpoints for Growing Degree Days (GDD) tracking, phenology prediction, and crop water demand (ETc)."""

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import asc, desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.database import get_db
from app.models.crop_variety import CropVariety
from app.models.gdd_accumulation import GddAccumulation
from app.models.phenology_phase import PhenologyPhase
from app.models.plot import Plot
from app.models.user import User
from app.schemas.gdd import (
    GddJobResponse,
    GddListResponse,
    GddRecordResponse,
    PhaseProgressItem,
    PlotPredictionResponse,
)
from app.services.gdd_service import (
    predict_harvest_date,
    sync_gdd_for_all_plots,
    sync_gdd_for_plot,
)

router = APIRouter(tags=["GDD & Prediksi Fase Fenologi (GDD Calculator)"])


async def _get_plot_or_404(plot_id: int, db: AsyncSession) -> Plot:
    """Helper to verify plot existence or raise 404."""
    stmt = (
        select(Plot)
        .options(
            selectinload(Plot.variety).selectinload(CropVariety.phases),
        )
        .where(Plot.id == plot_id)
    )
    result = await db.execute(stmt)
    plot = result.scalar_one_or_none()
    if not plot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Petak lahan dengan ID {plot_id} tidak ditemukan.",
        )
    return plot


@router.get(
    "/plots/{plot_id}/gdd",
    response_model=GddListResponse,
    summary="Ambil riwayat akumulasi GDD petak",
)
async def get_plot_gdd_history(
    plot_id: int,
    start_date: Optional[date] = Query(None, description="Tanggal awal observasi (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="Tanggal akhir observasi (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mengambil riwayat time-series akumulasi thermal GDD dan kebutuhan air harian (ETc) untuk petak."""
    plot = await _get_plot_or_404(plot_id, db)

    # If no records exist and plot has planting date, calculate on-the-fly
    check_stmt = select(GddAccumulation.id).where(GddAccumulation.plot_id == plot_id).limit(1)
    has_records = (await db.execute(check_stmt)).scalar_one_or_none()
    if not has_records and plot.planting_date:
        await sync_gdd_for_plot(db, plot_id)

    query = select(GddAccumulation).where(GddAccumulation.plot_id == plot_id)

    if start_date:
        query = query.where(GddAccumulation.observation_date >= start_date)
    if end_date:
        query = query.where(GddAccumulation.observation_date <= end_date)

    query = query.order_by(asc(GddAccumulation.observation_date))

    result = await db.execute(query)
    records = result.scalars().all()

    return GddListResponse(
        plot_id=plot_id,
        total=len(records),
        items=[GddRecordResponse.model_validate(rec) for rec in records],
    )


@router.get(
    "/plots/{plot_id}/prediction",
    response_model=PlotPredictionResponse,
    summary="Ambil prediksi fase fenologi & panen petak",
)
async def get_plot_prediction(
    plot_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mengembalikan analisis prediksi fase fenologi aktif, sisa GDD, dan estimasi tanggal panen."""
    plot = await _get_plot_or_404(plot_id, db)

    # Fetch latest GDD record
    latest_stmt = (
        select(GddAccumulation)
        .where(GddAccumulation.plot_id == plot_id)
        .order_by(desc(GddAccumulation.observation_date))
        .limit(1)
    )
    latest_record = (await db.execute(latest_stmt)).scalar_one_or_none()

    # If no record exists yet and plot has planting date, perform sync
    if not latest_record and plot.planting_date:
        await sync_gdd_for_plot(db, plot_id)
        latest_record = (await db.execute(latest_stmt)).scalar_one_or_none()

    # Load variety phases
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

    phases = sorted(variety.phases, key=lambda p: p.gdd_target) if variety and variety.phases else []
    target_total = (
        phases[-1].gdd_target
        if phases
        else (1950.0 if plot.crop_type == "padi" else 1780.0)
    )

    gdd_cumulative = latest_record.gdd_cumulative if latest_record else 0.0
    progress_pct = (
        round(min(100.0, (gdd_cumulative / target_total) * 100.0), 1)
        if target_total > 0
        else 0.0
    )
    remaining_gdd = max(0.0, round(target_total - gdd_cumulative, 2))

    # Calculate or retrieve predicted harvest date
    predicted_harvest = (
        latest_record.predicted_harvest_date
        if latest_record and latest_record.predicted_harvest_date
        else predict_harvest_date(plot.planting_date, gdd_cumulative, target_total)
    )
    days_to_harvest = (
        max(0, (predicted_harvest - date.today()).days)
        if predicted_harvest
        else None
    )

    # Build phases timeline
    timeline: List[PhaseProgressItem] = []
    found_active = False
    for i, ph in enumerate(phases):
        if gdd_cumulative > ph.gdd_target:
            phase_status = "completed"
        elif not found_active:
            phase_status = "active"
            found_active = True
        else:
            phase_status = "upcoming"

        timeline.append(
            PhaseProgressItem(
                phase_code=ph.phase_code,
                phase_name=ph.phase_name,
                hst_start=ph.hst_start,
                hst_end=ph.hst_end,
                gdd_target=ph.gdd_target,
                kc_value=ph.kc_value,
                status=phase_status,
            )
        )

    # If completed all phases, mark the last one as completed
    if phases and not found_active and gdd_cumulative >= target_total:
        if timeline:
            timeline[-1].status = "completed"

    return PlotPredictionResponse(
        plot_id=plot.id,
        plot_name=plot.name,
        crop_type=plot.crop_type,
        variety_id=plot.variety_id,
        variety_name=variety.name if variety else None,
        planting_date=plot.planting_date,
        current_hst=plot.current_hst or 0,
        current_phase=plot.current_phase or (latest_record.predicted_phase if latest_record else None),
        gdd_cumulative=gdd_cumulative,
        gdd_target_total=target_total,
        gdd_progress_pct=progress_pct,
        remaining_gdd=remaining_gdd,
        predicted_harvest_date=predicted_harvest,
        estimated_days_to_harvest=days_to_harvest,
        latest_etc_mm=latest_record.etc_mm if latest_record else None,
        phases_timeline=timeline,
    )


@router.post(
    "/jobs/gdd",
    response_model=GddJobResponse,
    summary="Trigger kalkulasi GDD harian secara manual",
)
async def trigger_gdd_calculation_job(
    plot_id: Optional[int] = Query(
        None,
        description="ID petak spesifik untuk dihitung. Kosongkan untuk menghitung seluruh petak.",
    ),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Memicu perhitungan akumulasi GDD harian dan prediksi fase fenologi secara langsung tanpa menunggu cron job."""
    if plot_id is not None:
        await _get_plot_or_404(plot_id, db)
        try:
            summary = await sync_gdd_for_plot(db, plot_id)
            return GddJobResponse(
                status=summary["status"],
                message=summary["message"],
                plots_processed=1 if summary["status"] == "success" else 0,
                records_created=summary.get("records_synced", 0),
                errors=[] if summary["status"] != "error" else [summary["message"]],
            )
        except Exception as exc:
            return GddJobResponse(
                status="error",
                message=f"Gagal memproses GDD untuk petak ID {plot_id}: {str(exc)}",
                plots_processed=0,
                records_created=0,
                errors=[str(exc)],
            )

    # Process all active plots
    summary = await sync_gdd_for_all_plots(db)
    return GddJobResponse(
        status=summary["status"],
        message=summary["message"],
        plots_processed=summary["plots_processed"],
        records_created=summary["records_created"],
        errors=summary["errors"],
    )
