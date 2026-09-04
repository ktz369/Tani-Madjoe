"""API endpoints for satellite spectral indices (NDVI, NDRE, NDWI, SAVI, BSI) and SAR backscatter."""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models.plot import Plot
from app.models.spectral_index import SpectralIndex
from app.models.user import User
from app.schemas.satellite import (
    SatelliteJobResponse,
    SpectralIndexListResponse,
    SpectralIndexResponse,
)
from app.services.gee_service import sync_satellite_for_all_plots, sync_satellite_for_plot

router = APIRouter(tags=["Citra Satelit & Indeks Spektral (Satellite)"])


async def _get_plot_or_404(plot_id: int, db: AsyncSession) -> Plot:
    """Helper to verify plot existence or raise 404."""
    stmt = select(Plot).where(Plot.id == plot_id)
    result = await db.execute(stmt)
    plot = result.scalar_one_or_none()
    if not plot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Petak lahan dengan ID {plot_id} tidak ditemukan.",
        )
    return plot


@router.get(
    "/plots/{plot_id}/indices",
    response_model=SpectralIndexListResponse,
    summary="Ambil time-series indeks spektral petak",
)
async def get_plot_spectral_indices(
    plot_id: int,
    start_date: Optional[date] = Query(None, description="Tanggal awal observasi (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="Tanggal akhir observasi (YYYY-MM-DD)"),
    satellite: Optional[str] = Query(
        None,
        description="Filter satelit ('sentinel-2' atau 'sentinel-1')",
    ),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mengambil riwayat data time-series indeks spektral dan SAR untuk petak lahan tertentu."""
    await _get_plot_or_404(plot_id, db)

    query = select(SpectralIndex).where(SpectralIndex.plot_id == plot_id)

    if start_date:
        query = query.where(SpectralIndex.observation_date >= start_date)
    if end_date:
        query = query.where(SpectralIndex.observation_date <= end_date)
    if satellite:
        query = query.where(SpectralIndex.satellite == satellite.lower())

    query = query.order_by(desc(SpectralIndex.observation_date), desc(SpectralIndex.created_at))

    result = await db.execute(query)
    records = result.scalars().all()

    return SpectralIndexListResponse(
        plot_id=plot_id,
        total=len(records),
        items=[SpectralIndexResponse.model_validate(rec) for rec in records],
    )


@router.get(
    "/plots/{plot_id}/indices/latest",
    response_model=SpectralIndexResponse,
    summary="Ambil observasi indeks spektral terbaru petak",
)
async def get_plot_latest_spectral_index(
    plot_id: int,
    satellite: Optional[str] = Query(
        "sentinel-2",
        description="Pilihan satelit ('sentinel-2' atau 'sentinel-1', default sentinel-2)",
    ),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mengembalikan rekaman indeks spektral paling baru untuk petak lahan yang diminta."""
    await _get_plot_or_404(plot_id, db)

    query = select(SpectralIndex).where(SpectralIndex.plot_id == plot_id)
    if satellite:
        query = query.where(SpectralIndex.satellite == satellite.lower())

    query = query.order_by(desc(SpectralIndex.observation_date), desc(SpectralIndex.created_at)).limit(1)

    result = await db.execute(query)
    record = result.scalar_one_or_none()

    if not record:
        # If no record exists yet, automatically generate/fetch latest observation on the fly
        try:
            records = await sync_satellite_for_plot(db, plot_id)
            for r in records:
                if satellite and r.satellite == satellite.lower():
                    return SpectralIndexResponse.model_validate(r)
            if records:
                return SpectralIndexResponse.model_validate(records[0])
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Belum ada data observasi satelit untuk petak ID {plot_id}: {str(exc)}",
            )

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Belum ada observasi satelit {satellite} yang tercatat untuk petak ini.",
        )

    return SpectralIndexResponse.model_validate(record)


@router.post(
    "/jobs/satellite",
    response_model=SatelliteJobResponse,
    summary="Trigger sinkronisasi citra satelit harian",
)
async def trigger_satellite_sync_job(
    plot_id: Optional[int] = Query(
        None,
        description="ID petak spesifik yang ingin disinkronkan. Kosongkan untuk memproses seluruh petak.",
    ),
    target_date: Optional[date] = Query(
        None,
        description="Tanggal observasi target (default hari ini)",
    ),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Memicu pemrosesan citra satelit (Sentinel-2 & Sentinel-1) secara manual tanpa menunggu jadwal harian."""
    if plot_id is not None:
        await _get_plot_or_404(plot_id, db)
        try:
            records = await sync_satellite_for_plot(db, plot_id, target_date=target_date)
            return SatelliteJobResponse(
                status="success",
                message=f"Berhasil memproses citra satelit untuk petak ID {plot_id}. {len(records)} observasi tersimpan.",
                plots_processed=1,
                records_created=len(records),
                errors=[],
            )
        except Exception as exc:
            return SatelliteJobResponse(
                status="error",
                message=f"Gagal memproses satelit untuk petak ID {plot_id}: {str(exc)}",
                plots_processed=0,
                records_created=0,
                errors=[str(exc)],
            )

    # Process all plots
    summary = await sync_satellite_for_all_plots(db, target_date=target_date)
    return SatelliteJobResponse(
        status=summary["status"],
        message=summary["message"],
        plots_processed=summary["plots_processed"],
        records_created=summary["records_created"],
        errors=summary["errors"],
    )
