"""API endpoints for Email notification service, testing, and previewing."""

from datetime import datetime, timedelta, timezone
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import HTMLResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.models.alert import Alert
from app.models.division import Division
from app.models.estate import Estate
from app.models.plot import Plot
from app.models.user import User
from app.schemas.email import (
    EmailDailyJobResponse,
    EmailTestRequest,
    EmailTestResponse,
)
from app.services.email_service import (
    generate_sample_alerts,
    process_and_send_daily_alert_emails,
    render_daily_alert_email_html,
    send_daily_alert_summary,
)
from app.utils.security import decode_access_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["Notifikasi Email (Email Service)"])
security_bearer = HTTPBearer(auto_error=False)


async def get_optional_user(
    auth: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """Mengambil objek User jika terdapat Bearer token yang valid, atau None jika tidak ada."""
    if auth is None or not auth.credentials:
        return None
    try:
        payload = decode_access_token(auth.credentials)
        if not payload:
            return None
        user_id_or_email = payload.get("sub")
        if not user_id_or_email:
            return None
        if str(user_id_or_email).isdigit():
            stmt = select(User).where(User.id == int(user_id_or_email))
        else:
            stmt = select(User).where(User.email == str(user_id_or_email))
        result = await db.execute(stmt)
        return result.scalar_one_or_none()
    except Exception as exc:
        logger.debug("Gagal mendekode token opsional: %s", exc)
        return None


@router.post(
    "/test/send-email",
    response_model=EmailTestResponse,
    summary="Kirim email uji coba ringkasan alert harian",
)
async def trigger_test_email(
    payload: Optional[EmailTestRequest] = None,
    target_email: Optional[str] = Query(
        None,
        description="Alamat email penerima alternatif jika tidak menggunakan request body",
    ),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    """Memicu pengujian pengiriman email ringkasan alert harian.

    Email penerima ditentukan dari urutan:
    1. `payload.target_email` (jika disediakan dalam request body)
    2. `target_email` (jika disediakan via query parameter)
    3. `current_user.email` (jika pengguna sedang terautentikasi login)

    Jika belum ada alert dalam 24 jam terakhir pada database atau `use_sample_data=True`,
    sistem secara cerdas menyertakan alert simulasi agar isi email tetap komprehensif.
    """
    recipient: Optional[str] = None
    use_sample: bool = False

    if payload:
        recipient = str(payload.target_email) if payload.target_email else None
        use_sample = payload.use_sample_data

    if not recipient and target_email:
        recipient = target_email.strip()

    if not recipient and current_user:
        recipient = current_user.email

    if not recipient:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Alamat email penerima tidak ditemukan. Sertakan 'target_email' pada body/query "
                "atau lakukan autentikasi login terlebih dahulu."
            ),
        )

    # Ambil data alert riil dari database (24 jam terakhir)
    alerts: List[Any] = []
    if not use_sample:
        now_utc = datetime.now(timezone.utc)
        cutoff = now_utc - timedelta(hours=24)
        stmt = (
            select(Alert)
            .options(
                selectinload(Alert.plot).selectinload(Plot.division).selectinload(Division.estate),
            )
            .where(Alert.created_at >= cutoff)
            .order_by(Alert.created_at.desc())
        )
        res = await db.execute(stmt)
        alerts = list(res.scalars().all())

    # Jika database kosong atau diminta sampel, gunakan data sampel realistis
    is_sample_used = False
    if not alerts:
        alerts = generate_sample_alerts()
        is_sample_used = True

    # Periksa apakah SMTP terkonfigurasi
    smtp_configured = bool(settings.SMTP_HOST and settings.SMTP_HOST.strip())

    if not smtp_configured:
        msg = (
            f"Simulasi pengiriman email berhasil untuk {recipient}. "
            f"SMTP_HOST belum dikonfigurasi pada server, sehingga pengiriman riil dilewati secara aman."
        )
        logger.info(msg)
        return EmailTestResponse(
            status="mock",
            message=msg,
            recipient=recipient,
            alerts_count=len(alerts),
            smtp_configured=False,
            details={
                "is_sample_data": is_sample_used,
                "smtp_host": settings.SMTP_HOST,
                "smtp_port": settings.SMTP_PORT,
            },
        )

    success = send_daily_alert_summary(recipient, alerts)
    if success:
        return EmailTestResponse(
            status="success",
            message=f"Email ringkasan alert berhasil dikirim ke {recipient}.",
            recipient=recipient,
            alerts_count=len(alerts),
            smtp_configured=True,
            details={
                "is_sample_data": is_sample_used,
                "smtp_host": settings.SMTP_HOST,
                "smtp_port": settings.SMTP_PORT,
            },
        )
    else:
        return EmailTestResponse(
            status="error",
            message=f"Gagal mengirimkan email ke {recipient}. Periksa log backend untuk detail galat SMTP.",
            recipient=recipient,
            alerts_count=len(alerts),
            smtp_configured=True,
            details={
                "is_sample_data": is_sample_used,
                "smtp_host": settings.SMTP_HOST,
                "smtp_port": settings.SMTP_PORT,
            },
        )


@router.get(
    "/test/preview-email-html",
    response_class=HTMLResponse,
    summary="Pratinjau visual HTML template email ringkasan alert di browser",
)
async def preview_email_html(
    sample: bool = Query(
        True,
        description="Gunakan data anomali sampel realistis (True) atau ambil alert terbaru dari DB (False)",
    ),
    recipient_name: Optional[str] = Query(
        "Budi Santoso",
        description="Nama pengguna penerima untuk pratinjau salam pembuka",
    ),
    db: AsyncSession = Depends(get_db),
):
    """Mengembalikan konten HTML lengkap dari template email ringkasan alert harian.

    Dapat dibuka langsung di browser untuk memverifikasi tata letak, warna severity badge,
    responsivitas, serta komponen kartu alert tanpa perlu mengirim email riil.
    """
    alerts: List[Any] = []

    if not sample:
        now_utc = datetime.now(timezone.utc)
        cutoff = now_utc - timedelta(hours=24)
        stmt = (
            select(Alert)
            .options(
                selectinload(Alert.plot).selectinload(Plot.division).selectinload(Division.estate),
            )
            .where(Alert.created_at >= cutoff)
            .order_by(Alert.created_at.desc())
        )
        res = await db.execute(stmt)
        alerts = list(res.scalars().all())

    if not alerts:
        alerts = generate_sample_alerts()

    html_content = render_daily_alert_email_html(alerts, recipient_name=recipient_name)
    return HTMLResponse(content=html_content, status_code=status.HTTP_200_OK)


@router.post(
    "/jobs/daily-email-alerts",
    response_model=EmailDailyJobResponse,
    summary="Trigger manual pengiriman email alert harian ke seluruh pengguna",
)
async def trigger_daily_email_job(
    db: AsyncSession = Depends(get_db),
):
    """Memicu eksekusi job harian pengiriman email ringkasan alert ke seluruh pengguna terdaftar."""
    summary = await process_and_send_daily_alert_emails(db)
    return EmailDailyJobResponse(
        status=summary["status"],
        message=summary["message"],
        emails_sent=summary["emails_sent"],
        alerts_count=summary["alerts_count"],
        users_total=summary["users_total"],
    )
