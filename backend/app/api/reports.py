"""FastAPI router for Reporting Engine — PDF Generation & CSV Export."""

from datetime import date, datetime, timezone
import os
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import FileResponse
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.database import get_db
from app.models.estate import Estate
from app.models.generated_report import GeneratedReport
from app.models.user import User
from app.schemas.report import (
    GeneratedReportResponse,
    SeasonComparisonResponse,
)
from app.services.report_service import (
    export_timeseries_csv,
    generate_harvest_prediction_report,
    generate_health_report,
    generate_season_comparison,
    generate_water_usage_report,
)

router = APIRouter(prefix="/reports", tags=["Pelaporan & Ekspor Data (Reports)"])


@router.post(
    "/health",
    summary="Unduh PDF Laporan Kesehatan Lahan",
    description="Menghasilkan dokumen PDF laporan kesehatan vegetasi per petak lahan dan alert aktif.",
)
async def download_health_report(
    estate_id: int = Query(..., description="ID Estate perkebunan"),
    start_date: Optional[date] = Query(None, description="Tanggal awal evaluasi (opsional)"),
    end_date: Optional[date] = Query(None, description="Tanggal akhir evaluasi (opsional)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Menghasilkan berkas PDF Laporan Kesehatan Lahan berdasarkan data satelit dan anomali."""
    try:
        pdf_bytes = await generate_health_report(
            db=db,
            estate_id=estate_id,
            start_date=start_date,
            end_date=end_date,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal menghasilkan laporan kesehatan lahan: {str(exc)}",
        )

    date_str = (end_date or date.today()).strftime("%Y%m%d")
    filename = f"Laporan_Kesehatan_Lahan_Estate_{estate_id}_{date_str}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.post(
    "/harvest-prediction",
    summary="Unduh PDF Laporan Prediksi Panen",
    description="Menghasilkan dokumen PDF laporan progres termal GDD dan perkiraan tanggal panen per petak.",
)
async def download_harvest_prediction_report(
    estate_id: int = Query(..., description="ID Estate perkebunan"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Menghasilkan berkas PDF Laporan Prediksi Panen & GDD."""
    try:
        pdf_bytes = await generate_harvest_prediction_report(
            db=db,
            estate_id=estate_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal menghasilkan laporan prediksi panen: {str(exc)}",
        )

    date_str = date.today().strftime("%Y%m%d")
    filename = f"Laporan_Prediksi_Panen_Estate_{estate_id}_{date_str}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.post(
    "/water-usage",
    summary="Unduh PDF Laporan Kebutuhan Air & Irigasi",
    description="Menghasilkan dokumen PDF laporan neraca air kebun, evapotranspirasi ETc, dan rekomendasi irigasi.",
)
async def download_water_usage_report(
    estate_id: int = Query(..., description="ID Estate perkebunan"),
    start_date: Optional[date] = Query(None, description="Tanggal awal evaluasi (opsional)"),
    end_date: Optional[date] = Query(None, description="Tanggal akhir evaluasi (opsional)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Menghasilkan berkas PDF Laporan Kebutuhan Air & Manajemen Irigasi."""
    try:
        pdf_bytes = await generate_water_usage_report(
            db=db,
            estate_id=estate_id,
            start_date=start_date,
            end_date=end_date,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal menghasilkan laporan kebutuhan air: {str(exc)}",
        )

    date_str = (end_date or date.today()).strftime("%Y%m%d")
    filename = f"Laporan_Kebutuhan_Air_Estate_{estate_id}_{date_str}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.get(
    "/export-csv",
    summary="Export CSV Time-Series Data Satelit & Agroklimat",
    description="Download berkas CSV data gabungan harian: NDVI, NDRE, NDWI, SAR, Cuaca, ETc, dan GDD per petak.",
)
async def download_timeseries_csv(
    estate_id: int = Query(..., description="ID Estate perkebunan"),
    start_date: Optional[date] = Query(None, description="Tanggal awal data"),
    end_date: Optional[date] = Query(None, description="Tanggal akhir data"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mengunduh berkas CSV terstruktur berisi data agroklimat dan indeks satelit time-series."""
    # Validate estate
    estate = await db.scalar(select(Estate).where(Estate.id == estate_id))
    if not estate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Estate dengan ID {estate_id} tidak ditemukan.",
        )

    try:
        csv_str = await export_timeseries_csv(
            db=db,
            estate_id=estate_id,
            start_date=start_date,
            end_date=end_date,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal melakukan ekspor data time-series: {str(exc)}",
        )

    date_str = (end_date or date.today()).strftime("%Y%m%d")
    filename = f"Timeseries_Agroklimat_Estate_{estate_id}_{date_str}.csv"

    return Response(
        content=csv_str.encode("utf-8-sig"),  # UTF-8 with BOM for Excel compatibility
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.get(
    "/history",
    response_model=List[GeneratedReportResponse],
    summary="Daftar Arsip Laporan Mingguan & Terjadwal",
    description="Mendapatkan daftar dokumen laporan mingguan otomatis yang tersimpan di sistem.",
)
async def get_report_history(
    estate_id: Optional[int] = Query(None, description="Filter berdasarkan ID Estate"),
    report_type: Optional[str] = Query(None, description="Filter tipe laporan ('health', 'water_usage', dll)"),
    limit: int = Query(50, ge=1, le=200, description="Batas jumlah riwayat"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mendapatkan riwayat dokumen laporan yang di-generate secara terjadwal oleh cron scheduler."""
    stmt = select(GeneratedReport).options(selectinload(GeneratedReport.estate))

    if estate_id:
        stmt = stmt.where(GeneratedReport.estate_id == estate_id)
    if report_type:
        stmt = stmt.where(GeneratedReport.report_type == report_type)

    stmt = stmt.order_by(desc(GeneratedReport.created_at)).limit(limit)
    records = (await db.execute(stmt)).scalars().all()

    response_items = []
    for r in records:
        response_items.append(
            GeneratedReportResponse(
                id=r.id,
                estate_id=r.estate_id,
                estate_name=r.estate.name if r.estate else None,
                report_type=r.report_type,
                title=r.title,
                file_name=r.file_name,
                file_size_bytes=r.file_size_bytes,
                period_start=r.period_start,
                period_end=r.period_end,
                created_at=r.created_at,
                download_url=f"/api/reports/download/{r.id}",
            )
        )

    return response_items


@router.get(
    "/download/{report_id}",
    summary="Unduh File Laporan dari Arsip",
    description="Mengunduh berkas laporan tersimpan berdasarkan ID arsip riwayat.",
)
async def download_archived_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download archived report from storage disk."""
    report = await db.scalar(select(GeneratedReport).where(GeneratedReport.id == report_id))
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Laporan dengan ID {report_id} tidak ditemukan dalam arsip.",
        )

    if not os.path.exists(report.file_path):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Berkas fisik laporan sudah tidak tersedia atau telah dipindahkan.",
        )

    media_type = "application/pdf" if report.file_name.endswith(".pdf") else "text/csv"
    return FileResponse(
        path=report.file_path,
        media_type=media_type,
        filename=report.file_name,
    )
