"""API endpoints for agronomic alerts, anomaly notifications, and Alert Engine job triggers."""

from datetime import datetime, timezone
import math
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.database import get_db
from app.models.alert import Alert
from app.models.division import Division
from app.models.estate import Estate
from app.models.plot import Plot
from app.models.user import User
from app.schemas.alert import (
    AlertEvaluationJobResponse,
    AlertListResponse,
    AlertResponse,
    AlertUnreadCountResponse,
    AlertUpdate,
)
from app.services.alert_service import (
    evaluate_alerts_for_all_plots,
    evaluate_alerts_for_plot,
)

router = APIRouter(prefix="", tags=["Peringatan & Anomali Agronomi (Alert Engine)"])


def _map_alert_to_response(alert: Alert) -> AlertResponse:
    """Helper untuk memetakan ORM Alert ke schema AlertResponse beserta relasi Plot dan Estate."""
    plot_name = None
    crop_type = None
    estate_id = None
    estate_name = None

    if alert.plot:
        plot_name = alert.plot.name
        crop_type = alert.plot.crop_type
        if alert.plot.division:
            estate_id = alert.plot.division.estate_id
            if alert.plot.division.estate:
                estate_name = alert.plot.division.estate.name

    return AlertResponse(
        id=alert.id,
        plot_id=alert.plot_id,
        alert_type=alert.alert_type,
        severity=alert.severity,
        title=alert.title,
        description=alert.description,
        recommendation=alert.recommendation,
        trigger_values=alert.trigger_values,
        is_read=alert.is_read,
        is_resolved=alert.is_resolved,
        created_at=alert.created_at,
        resolved_at=alert.resolved_at,
        plot_name=plot_name,
        crop_type=crop_type,
        estate_id=estate_id,
        estate_name=estate_name,
    )


async def _get_alert_or_404(alert_id: int, db: AsyncSession) -> Alert:
    """Helper untuk mengambil Alert atau melempar HTTPException 404 jika tidak ditemukan."""
    stmt = (
        select(Alert)
        .options(
            selectinload(Alert.plot).selectinload(Plot.division).selectinload(Division.estate),
        )
        .where(Alert.id == alert_id)
    )
    res = await db.execute(stmt)
    alert = res.scalar_one_or_none()
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Peringatan (Alert) dengan ID {alert_id} tidak ditemukan.",
        )
    return alert


@router.get(
    "/alerts",
    response_model=AlertListResponse,
    summary="Ambil daftar peringatan (alerts) dengan filter & paginasi",
)
async def list_alerts(
    estate_id: Optional[int] = Query(None, description="Filter berdasarkan ID kebun/estate"),
    severity: Optional[str] = Query(
        None,
        description="Filter tingkat keparahan: 'kuning', 'oranye', 'merah', atau 'hijau_tua'",
    ),
    alert_type: Optional[str] = Query(
        None,
        description="Filter tipe alert: 'nitrogen_stress', 'water_stress', 'pest_anomaly', 'harvest_ready'",
    ),
    is_resolved: Optional[bool] = Query(None, description="Filter status penyelesaian alert"),
    is_read: Optional[bool] = Query(None, description="Filter status telah dibaca"),
    page: int = Query(1, ge=1, description="Nomor halaman"),
    page_size: int = Query(20, ge=1, le=100, description="Jumlah data per halaman"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mengambil daftar notifikasi peringatan anomali agronomi dengan berbagai opsi filter dan paginasi."""
    # Base query for data
    query = (
        select(Alert)
        .join(Alert.plot)
        .join(Plot.division)
        .options(
            selectinload(Alert.plot).selectinload(Plot.division).selectinload(Division.estate),
        )
    )

    # Base query for counting
    count_query = select(func.count(Alert.id)).join(Alert.plot).join(Plot.division)

    # Apply filters
    if estate_id is not None:
        query = query.where(Division.estate_id == estate_id)
        count_query = count_query.where(Division.estate_id == estate_id)

    if severity is not None:
        query = query.where(Alert.severity == severity)
        count_query = count_query.where(Alert.severity == severity)

    if alert_type is not None:
        query = query.where(Alert.alert_type == alert_type)
        count_query = count_query.where(Alert.alert_type == alert_type)

    if is_resolved is not None:
        query = query.where(Alert.is_resolved == is_resolved)
        count_query = count_query.where(Alert.is_resolved == is_resolved)

    if is_read is not None:
        query = query.where(Alert.is_read == is_read)
        count_query = count_query.where(Alert.is_read == is_read)

    # Execute total count
    total_result = await db.execute(count_query)
    total = total_result.scalar_one() or 0

    # Unread count with current filters (without is_read constraint)
    unread_stmt = select(func.count(Alert.id)).where(Alert.is_read.is_(False))
    if estate_id is not None:
        unread_stmt = unread_stmt.join(Alert.plot).join(Plot.division).where(Division.estate_id == estate_id)
    unread_res = await db.execute(unread_stmt)
    unread_count = unread_res.scalar_one() or 0

    # Sorting and pagination
    offset = (page - 1) * page_size
    query = query.order_by(desc(Alert.created_at)).offset(offset).limit(page_size)

    result = await db.execute(query)
    alerts = result.scalars().all()

    total_pages = max(1, math.ceil(total / page_size)) if total > 0 else 1

    return AlertListResponse(
        total=total,
        unread_count=unread_count,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        items=[_map_alert_to_response(alert) for alert in alerts],
    )


@router.get(
    "/alerts/unread-count",
    response_model=AlertUnreadCountResponse,
    summary="Ambil jumlah alert yang belum dibaca",
)
async def get_unread_count(
    estate_id: Optional[int] = Query(None, description="Filter berdasarkan ID kebun/estate"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mengambil jumlah total alert yang belum dibaca beserta rincian berdasarkan tingkat keparahan dan tipe."""
    query = select(Alert.severity, Alert.alert_type).where(Alert.is_read.is_(False))
    if estate_id is not None:
        query = query.join(Alert.plot).join(Plot.division).where(Division.estate_id == estate_id)

    res = await db.execute(query)
    rows = res.all()

    total_unread = len(rows)
    by_severity: dict[str, int] = {}
    by_type: dict[str, int] = {}

    for sev, a_type in rows:
        by_severity[sev] = by_severity.get(sev, 0) + 1
        by_type[a_type] = by_type.get(a_type, 0) + 1

    return AlertUnreadCountResponse(
        total_unread=total_unread,
        by_severity=by_severity,
        by_type=by_type,
    )


@router.get(
    "/alerts/recent",
    response_model=List[AlertResponse],
    summary="Ambil 20 alert terbaru",
)
async def get_recent_alerts(
    estate_id: Optional[int] = Query(None, description="Filter berdasarkan ID kebun/estate"),
    limit: int = Query(20, ge=1, le=50, description="Batas jumlah alert terbaru"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mengambil daftar peringatan terbaru untuk ditampilkan pada dashboard monitoring cepat."""
    query = (
        select(Alert)
        .join(Alert.plot)
        .join(Plot.division)
        .options(
            selectinload(Alert.plot).selectinload(Plot.division).selectinload(Division.estate),
        )
    )
    if estate_id is not None:
        query = query.where(Division.estate_id == estate_id)

    query = query.order_by(desc(Alert.created_at)).limit(limit)
    res = await db.execute(query)
    alerts = res.scalars().all()

    return [_map_alert_to_response(a) for a in alerts]


@router.get(
    "/plots/{plot_id}/alerts",
    response_model=List[AlertResponse],
    summary="Ambil riwayat peringatan petak spesifik",
)
async def get_plot_alerts(
    plot_id: int,
    is_resolved: Optional[bool] = Query(None, description="Filter status selesai/belum"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mengambil seluruh riwayat peringatan dan rekomendasi tindakan yang pernah terpicu pada petak lahan tertentu."""
    # Verify plot
    plot_stmt = select(Plot.id).where(Plot.id == plot_id)
    if not (await db.execute(plot_stmt)).scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Petak lahan dengan ID {plot_id} tidak ditemukan.",
        )

    query = (
        select(Alert)
        .options(
            selectinload(Alert.plot).selectinload(Plot.division).selectinload(Division.estate),
        )
        .where(Alert.plot_id == plot_id)
    )
    if is_resolved is not None:
        query = query.where(Alert.is_resolved == is_resolved)

    query = query.order_by(desc(Alert.created_at))
    res = await db.execute(query)
    alerts = res.scalars().all()

    return [_map_alert_to_response(a) for a in alerts]


@router.put(
    "/alerts/{alert_id}",
    response_model=AlertResponse,
    summary="Perbarui status dibaca / selesai pada alert",
)
async def update_alert(
    alert_id: int,
    payload: AlertUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Memperbarui status dibaca (`is_read`) atau selesai (`is_resolved`) pada rekaman alert tertentu."""
    alert = await _get_alert_or_404(alert_id, db)

    if payload.is_read is not None:
        alert.is_read = payload.is_read

    if payload.is_resolved is not None:
        alert.is_resolved = payload.is_resolved
        if payload.is_resolved:
            alert.resolved_at = datetime.now(timezone.utc)
            # Jika diselesaikan, otomatis tandai dibaca
            alert.is_read = True
        else:
            alert.resolved_at = None

    await db.commit()
    await db.refresh(alert)
    return _map_alert_to_response(alert)


@router.put(
    "/alerts/{alert_id}/read",
    response_model=AlertResponse,
    summary="Tandai alert sebagai sudah dibaca",
)
async def mark_alert_as_read(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Shortcut untuk menandai alert telah dibaca oleh pengguna."""
    alert = await _get_alert_or_404(alert_id, db)
    alert.is_read = True
    await db.commit()
    await db.refresh(alert)
    return _map_alert_to_response(alert)


@router.put(
    "/alerts/{alert_id}/resolve",
    response_model=AlertResponse,
    summary="Tandai alert sebagai telah ditangani (selesai)",
)
async def resolve_alert(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Shortcut untuk menandai anomali pada petak telah ditindaklanjuti/diselesaikan."""
    alert = await _get_alert_or_404(alert_id, db)
    alert.is_resolved = True
    alert.is_read = True
    alert.resolved_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(alert)
    return _map_alert_to_response(alert)


@router.post(
    "/jobs/alerts",
    response_model=AlertEvaluationJobResponse,
    summary="Trigger evaluasi manual Alert Engine",
)
async def trigger_alert_evaluation_job(
    plot_id: Optional[int] = Query(
        None,
        description="ID petak spesifik untuk dievaluasi. Kosongkan untuk mengevaluasi seluruh petak.",
    ),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Memicu evaluasi 4 aturan deteksi Alert Engine secara manual tanpa menunggu cron harian 06:30 WIB."""
    if plot_id is not None:
        plot_stmt = select(Plot.id).where(Plot.id == plot_id)
        if not (await db.execute(plot_stmt)).scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Petak lahan dengan ID {plot_id} tidak ditemukan.",
            )
        try:
            new_alerts = await evaluate_alerts_for_plot(db, plot_id)
            return AlertEvaluationJobResponse(
                status="success",
                message=f"Evaluasi selesai untuk petak ID {plot_id}. Ditemukan {len(new_alerts)} alert baru.",
                plots_evaluated=1,
                alerts_created=len(new_alerts),
                errors=[],
            )
        except Exception as exc:
            return AlertEvaluationJobResponse(
                status="error",
                message=f"Gagal memproses evaluasi alert untuk petak ID {plot_id}: {str(exc)}",
                plots_evaluated=0,
                alerts_created=0,
                errors=[str(exc)],
            )

    summary = await evaluate_alerts_for_all_plots(db)
    return AlertEvaluationJobResponse(
        status=summary["status"],
        message=summary["message"],
        plots_evaluated=summary["plots_evaluated"],
        alerts_created=summary["alerts_created"],
        errors=summary["errors"],
    )
