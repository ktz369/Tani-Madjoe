"""Email notification service for sending automated agronomic alert summaries."""

from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape as html_escape
import logging
import smtplib
from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

try:
    from app.config import settings
except Exception:  # pragma: no cover
    class _FallbackSettings:
        SMTP_HOST: str = ""
        SMTP_PORT: int = 587
        SMTP_USER: str = ""
        SMTP_PASSWORD: str = ""
        SMTP_FROM_EMAIL: str = "noreply@tani.ag"
        SMTP_TLS: bool = True
        FRONTEND_URL: str = "http://localhost:3000"

    settings = _FallbackSettings()

logger = logging.getLogger(__name__)

# Daftar nama hari dan bulan dalam Bahasa Indonesia baku
INDONESIAN_DAYS = [
    "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"
]
INDONESIAN_MONTHS = [
    "",
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
]

# Konfigurasi visual tingkat keparahan (Severity)
SEVERITY_CONFIG: Dict[str, Dict[str, str]] = {
    "merah": {
        "label": "Kritis",
        "badge_bg": "#FEE2E2",
        "badge_text": "#991B1B",
        "badge_border": "#F87171",
        "card_border": "#EF4444",
        "icon": "🔴",
        "stat_bg": "#FEF2F2",
        "stat_text": "#DC2626",
    },
    "oranye": {
        "label": "Tinggi",
        "badge_bg": "#FFEDD5",
        "badge_text": "#9A3412",
        "badge_border": "#FB923C",
        "card_border": "#F97316",
        "icon": "🟠",
        "stat_bg": "#FFF7ED",
        "stat_text": "#EA580C",
    },
    "kuning": {
        "label": "Sedang",
        "badge_bg": "#FEF9C3",
        "badge_text": "#854D0E",
        "badge_border": "#FACC15",
        "card_border": "#EAB308",
        "icon": "🟡",
        "stat_bg": "#FEFCE8",
        "stat_text": "#CA8A04",
    },
    "hijau_tua": {
        "label": "Panen/Optimal",
        "badge_bg": "#DCFCE7",
        "badge_text": "#166534",
        "badge_border": "#4ADE80",
        "card_border": "#16A34A",
        "icon": "🟢",
        "stat_bg": "#F0FDF4",
        "stat_text": "#16A34A",
    },
}

SEVERITY_PRIORITY: Dict[str, int] = {
    "merah": 1,
    "oranye": 2,
    "kuning": 3,
    "hijau_tua": 4,
}


def format_indonesian_date(dt: Optional[datetime] = None) -> str:
    """Memformat objek datetime ke dalam string tanggal Indonesia formal.

    Contoh: 'Sabtu, 05 September 2026'.
    """
    if dt is None:
        dt = datetime.now()
    day_name = INDONESIAN_DAYS[dt.weekday()]
    month_name = INDONESIAN_MONTHS[dt.month]
    return f"{day_name}, {dt.day:02d} {month_name} {dt.year}"


def _extract_alert_info(alert: Any) -> Dict[str, Any]:
    """Ekstraksi field yang dibutuhkan dari objek Alert (ORM, schema, atau dict)."""
    if isinstance(alert, dict):
        return {
            "title": alert.get("title", "Peringatan Anomali"),
            "severity": str(alert.get("severity", "kuning")).lower(),
            "alert_type": alert.get("alert_type", "nitrogen_stress"),
            "description": alert.get("description", ""),
            "recommendation": alert.get("recommendation", ""),
            "plot_name": alert.get("plot_name") or "Petak Lahan",
            "estate_name": alert.get("estate_name") or "Kebun Operasional",
            "created_at": alert.get("created_at") or datetime.now(timezone.utc),
        }

    # ORM Alert object
    plot_name = "Petak Lahan"
    estate_name = "Kebun Operasional"
    if hasattr(alert, "plot") and alert.plot:
        plot_name = getattr(alert.plot, "name", "Petak Lahan")
        if hasattr(alert.plot, "division") and alert.plot.division:
            if hasattr(alert.plot.division, "estate") and alert.plot.division.estate:
                estate_name = getattr(alert.plot.division.estate, "name", "Kebun Operasional")
    elif hasattr(alert, "plot_name") and alert.plot_name:
        plot_name = alert.plot_name
        if hasattr(alert, "estate_name") and alert.estate_name:
            estate_name = alert.estate_name

    return {
        "title": getattr(alert, "title", "Peringatan Anomali"),
        "severity": str(getattr(alert, "severity", "kuning")).lower(),
        "alert_type": getattr(alert, "alert_type", "nitrogen_stress"),
        "description": getattr(alert, "description", ""),
        "recommendation": getattr(alert, "recommendation", ""),
        "plot_name": plot_name,
        "estate_name": estate_name,
        "created_at": getattr(alert, "created_at", None) or datetime.now(timezone.utc),
    }


def render_daily_alert_email_html(alerts: List[Any], recipient_name: Optional[str] = None) -> str:
    """Menyusun template email HTML modern, profesional, dan responsif.

    Komponen:
    1. Header modern dengan logo Tani dan badge tanggal Indonesia.
    2. Stat counter badges: Merah, Oranye, Kuning, Hijau Tua dalam 24 jam terakhir.
    3. Daftar Top 10 Alert paling kritis dengan badge keparahan, lokasi petak & kebun, judul, dan rekomendasi.
    4. Call to Action (CTA) Button "Buka Dashboard Pemantauan".
    5. Footer perusahaan agribisnis Tani.
    """
    date_str = format_indonesian_date()
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000").rstrip("/")
    dashboard_url = f"{frontend_url}/dashboard"

    # Ekstraksi dan kalkulasi statistik
    parsed_alerts = [_extract_alert_info(a) for a in alerts]
    count_merah = sum(1 for a in parsed_alerts if a["severity"] == "merah")
    count_oranye = sum(1 for a in parsed_alerts if a["severity"] == "oranye")
    count_kuning = sum(1 for a in parsed_alerts if a["severity"] == "kuning")
    count_hijau = sum(1 for a in parsed_alerts if a["severity"] == "hijau_tua")

    # Sort berdasarkan urgensi keparahan (Merah > Oranye > Kuning > Hijau) lalu tanggal terbaru
    sorted_alerts = sorted(
        parsed_alerts,
        key=lambda x: (
            SEVERITY_PRIORITY.get(x["severity"], 99),
            -x["created_at"].timestamp() if isinstance(x["created_at"], datetime) else 0,
        ),
    )
    top_alerts = sorted_alerts[:10]

    # Generate baris tabel/kartu alert
    alert_rows_html = ""
    for idx, item in enumerate(top_alerts, start=1):
        sev = item["severity"]
        cfg = SEVERITY_CONFIG.get(sev, SEVERITY_CONFIG["kuning"])
        badge_style = (
            f"display: inline-block; padding: 3px 10px; border-radius: 9999px; "
            f"background-color: {cfg['badge_bg']}; color: {cfg['badge_text']}; "
            f"border: 1px solid {cfg['badge_border']}; font-size: 11px; font-weight: 700; "
            f"text-transform: uppercase; letter-spacing: 0.05em;"
        )

        created_str = ""
        if isinstance(item["created_at"], datetime):
            created_str = item["created_at"].strftime("%d %b %Y, %H:%M WIB")

        escaped_plot_name = html_escape(str(item.get("plot_name") or "Petak Lahan"))
        escaped_estate_name = html_escape(str(item.get("estate_name") or "Kebun Operasional"))
        escaped_title = html_escape(str(item.get("title") or "Peringatan Anomali"))
        raw_desc = item.get("description") or ""
        escaped_desc = html_escape(str(raw_desc))
        escaped_recommendation = html_escape(str(item.get("recommendation") or ""))

        desc_html = (
            f'<div style="font-size: 12px; color: #4B5563; margin-bottom: 6px; line-height: 1.4;">{escaped_desc}</div>'
            if raw_desc
            else ""
        )

        time_span = (
            f'<span style="float: right; font-size: 11px; color: #9CA3AF;">{created_str}</span>'
            if created_str
            else ""
        )

        alert_rows_html += f"""
        <tr>
          <td style="padding: 14px 16px; border-bottom: 1px solid #E5E7EB; vertical-align: top;">
            <div style="margin-bottom: 6px;">
              <span style="{badge_style}">{cfg['icon']} {cfg['label']}</span>
              <span style="font-size: 12px; color: #6B7280; margin-left: 8px; font-weight: 500;">
                🌾 <strong>{escaped_plot_name}</strong> &bull; {escaped_estate_name}
              </span>
              {time_span}
            </div>
            <div style="font-size: 14px; font-weight: 700; color: #111827; margin-bottom: 4px; line-height: 1.4;">
              {escaped_title}
            </div>
            {desc_html}
            <div style="background-color: #F8FAFC; border-left: 3px solid #10B981; padding: 8px 12px; border-radius: 0 4px 4px 0; font-size: 12px; color: #1E293B; line-height: 1.5;">
              <strong style="color: #059669;">💡 Rekomendasi Aksi:</strong> {escaped_recommendation}
            </div>
          </td>
        </tr>
        """

    escaped_recipient = html_escape(str(recipient_name)) if recipient_name else ""
    greeting_text = f"Halo <strong>{escaped_recipient}</strong>," if escaped_recipient else "Halo Tim Operasional Kebun,"

    html = f"""<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ringkasan Peringatan Harian — Tani</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F3F4F6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1F2937;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F3F4F6; padding: 24px 12px;">
    <tr>
      <td align="center">
        <!-- Container Card -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 640px; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); border: 1px solid #E5E7EB;">
          
          <!-- Header Tani -->
          <tr>
            <td style="background: linear-gradient(135deg, #15803D 0%, #166534 100%); padding: 28px 24px; text-align: left; color: #FFFFFF;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="display: inline-block; background-color: rgba(255, 255, 255, 0.2); padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 8px;">
                      {date_str}
                    </div>
                    <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.2;">
                      Ringkasan Peringatan Harian — Tani
                    </h1>
                    <p style="margin: 6px 0 0 0; font-size: 13px; color: #D1FAE5; opacity: 0.95;">
                      Laporan otomatis anomali vegetasi satelit, ketersediaan air, dan fase fenologi tanaman.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Greeting -->
          <tr>
            <td style="padding: 24px 24px 12px 24px;">
              <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #374151;">
                {greeting_text}
              </p>
              <p style="margin: 8px 0 0 0; font-size: 13px; line-height: 1.5; color: #4B5563;">
                Berikut adalah rekapitulasi peringatan agronomi yang terdeteksi oleh <strong>Alert Engine Tani</strong> dalam 24 jam terakhir pada petak lahan aktif Anda:
              </p>
            </td>
          </tr>

          <!-- Stat Counters (4 Severity Boxes) -->
          <tr>
            <td style="padding: 6px 20px 20px 20px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: separate; border-spacing: 8px 0;">
                <tr>
                  <!-- Merah -->
                  <td width="25%" style="background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 12px 8px; text-align: center;">
                    <div style="font-size: 20px; font-weight: 800; color: #DC2626; line-height: 1;">{count_merah}</div>
                    <div style="font-size: 11px; font-weight: 700; color: #991B1B; margin-top: 4px; text-transform: uppercase;">Kritis</div>
                  </td>
                  <!-- Oranye -->
                  <td width="25%" style="background-color: #FFF7ED; border: 1px solid #FED7AA; border-radius: 8px; padding: 12px 8px; text-align: center;">
                    <div style="font-size: 20px; font-weight: 800; color: #EA580C; line-height: 1;">{count_oranye}</div>
                    <div style="font-size: 11px; font-weight: 700; color: #9A3412; margin-top: 4px; text-transform: uppercase;">Tinggi</div>
                  </td>
                  <!-- Kuning -->
                  <td width="25%" style="background-color: #FEFCE8; border: 1px solid #FEF08A; border-radius: 8px; padding: 12px 8px; text-align: center;">
                    <div style="font-size: 20px; font-weight: 800; color: #CA8A04; line-height: 1;">{count_kuning}</div>
                    <div style="font-size: 11px; font-weight: 700; color: #854D0E; margin-top: 4px; text-transform: uppercase;">Sedang</div>
                  </td>
                  <!-- Hijau Tua -->
                  <td width="25%" style="background-color: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 12px 8px; text-align: center;">
                    <div style="font-size: 20px; font-weight: 800; color: #16A34A; line-height: 1;">{count_hijau}</div>
                    <div style="font-size: 11px; font-weight: 700; color: #166534; margin-top: 4px; text-transform: uppercase;">Panen</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Section Title: Top 10 Alerts -->
          <tr>
            <td style="padding: 0 24px 10px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <h2 style="margin: 0; font-size: 15px; font-weight: 700; color: #111827;">
                      Top 10 Peringatan Membutuhkan Perhatian Cepat
                    </h2>
                    <p style="margin: 2px 0 0 0; font-size: 12px; color: #6B7280;">
                      Menampilkan maksimal 10 anomali dengan tingkat keparahan paling mendesak.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Alerts Table/List -->
          <tr>
            <td style="padding: 0 24px 20px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden; border-collapse: collapse;">
                {alert_rows_html}
              </table>
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td style="padding: 8px 24px 28px 24px; text-align: center;">
              <a href="{dashboard_url}" target="_blank" style="display: inline-block; background-color: #15803D; color: #FFFFFF; text-decoration: none; font-size: 14px; font-weight: 700; padding: 12px 32px; border-radius: 6px; box-shadow: 0 2px 4px rgba(21, 128, 61, 0.3);">
                Buka Dashboard Pemantauan &rarr;
              </a>
              <p style="margin: 8px 0 0 0; font-size: 11px; color: #9CA3AF;">
                Akses peta interaktif, indeks spektral Sentinel-2, dan manajemen status petak lahan.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F9FAFB; border-top: 1px solid #E5E7EB; padding: 20px 24px; text-align: center; color: #6B7280; font-size: 11px; line-height: 1.5;">
              <div style="font-weight: 600; color: #374151; margin-bottom: 4px;">
                Tani &mdash; Platform SaaS Monitoring & Inteligensi Pertanian Presisi
              </div>
              <div>
                Email ini dikirim secara otomatis oleh Sistem Notifikasi Pintar Tani setiap pagi jam 07:30 WIB.
              </div>
              <div style="margin-top: 6px; color: #9CA3AF;">
                Hak Cipta &copy; 2026 Tani Inc. Seluruh hak cipta dilindungi undang-undang.
              </div>
            </td>
          </tr>

        </table>
        <!-- End Container -->
      </td>
    </tr>
  </table>
</body>
</html>
"""
    return html


def render_daily_alert_email_text(alerts: List[Any]) -> str:
    """Menyusun versi teks polos (plain text) untuk fallback email."""
    date_str = format_indonesian_date()
    parsed_alerts = [_extract_alert_info(a) for a in alerts]
    count_merah = sum(1 for a in parsed_alerts if a["severity"] == "merah")
    count_oranye = sum(1 for a in parsed_alerts if a["severity"] == "oranye")
    count_kuning = sum(1 for a in parsed_alerts if a["severity"] == "kuning")
    count_hijau = sum(1 for a in parsed_alerts if a["severity"] == "hijau_tua")

    lines = [
        "RINGKASAN PERINGATAN HARIAN — TANI",
        f"Tanggal: {date_str}",
        "=" * 50,
        "Statistik 24 Jam Terakhir:",
        f"- Kritis (Merah): {count_merah}",
        f"- Tinggi (Oranye): {count_oranye}",
        f"- Sedang (Kuning): {count_kuning}",
        f"- Siap Panen (Hijau): {count_hijau}",
        f"Total Peringatan: {len(parsed_alerts)}",
        "=" * 50,
        "TOP 10 PERINGATAN MEMBUTUHKAN TINDAKAN:",
    ]

    sorted_alerts = sorted(
        parsed_alerts,
        key=lambda x: (
            SEVERITY_PRIORITY.get(x["severity"], 99),
            -x["created_at"].timestamp() if isinstance(x["created_at"], datetime) else 0,
        ),
    )[:10]

    for idx, a in enumerate(sorted_alerts, start=1):
        plot_label = a["plot_name"] if a["plot_name"].lower().startswith("petak") else f"Petak {a['plot_name']}"
        estate_label = a["estate_name"] if a["estate_name"].lower().startswith("kebun") else f"Kebun {a['estate_name']}"
        lines.append(f"\n[{idx}] {a['severity'].upper()} — {a['title']}")
        lines.append(f"    Lokasi: {plot_label} ({estate_label})")
        lines.append(f"    Rekomendasi: {a['recommendation']}")


    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000")
    lines.append("\n" + "=" * 50)
    lines.append(f"Buka Dashboard Pemantauan: {frontend_url}/dashboard")
    lines.append("© 2026 Tani Inc. Hak Cipta Dilindungi Undang-Undang.")

    return "\n".join(lines)


def generate_sample_alerts() -> List[Dict[str, Any]]:
    """Membuat daftar alert sampel realistis untuk keperluan pengujian dan pratinjau."""
    now = datetime.now(timezone.utc)
    return [
        {
            "id": 1,
            "title": "Cekaman Air Berat (Kekeringan Akut)",
            "severity": "merah",
            "alert_type": "water_stress",
            "description": "Delta NDWI 7 hari turun drastis (-0.22) dengan curah hujan kumulatif 0.0 mm.",
            "recommendation": "Segera lakukan irigasi darurat atau penggenangan petak dalam 24 jam untuk mencegah kerontokan bulir.",
            "plot_name": "Petak B-04 (Padi Ciherang)",
            "estate_name": "Kebun Karawang Makmur",
            "created_at": now - timedelta(hours=2),
        },
        {
            "id": 2,
            "title": "Indikasi Serangan Hama Penggerek Batang",
            "severity": "merah",
            "alert_type": "pest_anomaly",
            "description": "Penurunan kanopi tajuk NDVI sebesar 31.4% dalam 5 hari berturut-turut.",
            "recommendation": "Inspeksi fisik segera di lapangan dan aplikasikan bio-pestisida atau musuh alami pada spot terdampak.",
            "plot_name": "Petak A-12 (Padi Inpari 32)",
            "estate_name": "Kebun Subang Sejahtera",
            "created_at": now - timedelta(hours=4),
        },
        {
            "id": 3,
            "title": "Defisiensi Klorofil & Stres Nitrogen",
            "severity": "oranye",
            "alert_type": "nitrogen_stress",
            "description": "Tajuk rimbun (NDVI 0.74) namun indeks klorofil NDRE rendah (0.23 < 0.28).",
            "recommendation": "Lakukan pemupukan susulan urea/NPK cair atau pemupukan lewat daun (foliar spray).",
            "plot_name": "Petak C-08 (Jagung Hibrida Pioneer)",
            "estate_name": "Kebun Karawang Makmur",
            "created_at": now - timedelta(hours=6),
        },
        {
            "id": 4,
            "title": "Potensi Stres Air Ringan",
            "severity": "kuning",
            "alert_type": "water_stress",
            "description": "Kelembapan tajuk NDWI menurun bertahap (-0.16) dengan curah hujan 7.5 mm.",
            "recommendation": "Pantau kelembapan tanah dan jadwalkan pembukaan pintu air saluran irigasi sekunder.",
            "plot_name": "Petak D-01 (Padi Pandan Wangi)",
            "estate_name": "Kebun Cianjur Asri",
            "created_at": now - timedelta(hours=10),
        },
        {
            "id": 5,
            "title": "Tanaman Memasuki Fase Matang Fisiologis — Siap Panen",
            "severity": "hijau_tua",
            "alert_type": "harvest_ready",
            "description": "Akumulasi suhu GDD telah melampaui target varietas (1940 / 1850 °C hari) dan NDVI turun ke 0.31.",
            "recommendation": "Jadwalkan alat pemanen kombinasi (combine harvester) dan siapkan logistik pengeringan gabah.",
            "plot_name": "Petak A-03 (Padi Ciherang)",
            "estate_name": "Kebun Subang Sejahtera",
            "created_at": now - timedelta(hours=14),
        },
    ]


def send_daily_alert_summary(user_email: str, alerts: List[Any]) -> bool:
    """Mengirimkan email ringkasan alert harian ke pengguna via SMTP.

    Jika SMTP_HOST belum dikonfigurasi, mencatat peringatan dan mengembalikan False tanpa crash.
    """
    if not alerts:
        logger.info("Tidak ada alert untuk dikirimkan ke %s.", user_email)
        return False

    # Validasi keamanan: Mencegah email header injection via karakter baris baru
    if not user_email or "\r" in user_email or "\n" in user_email:
        logger.warning("Potensi email header injection atau format email tidak valid: %r", user_email)
        return False

    date_str = format_indonesian_date()
    subject = f"Ringkasan Peringatan Harian — Tani ({date_str})"
    html_content = render_daily_alert_email_html(alerts, recipient_name=user_email.split("@")[0])
    text_content = render_daily_alert_email_text(alerts)

    smtp_host = getattr(settings, "SMTP_HOST", "")
    smtp_port = getattr(settings, "SMTP_PORT", 587)
    smtp_tls = getattr(settings, "SMTP_TLS", True)
    smtp_user = getattr(settings, "SMTP_USER", "")
    smtp_password = getattr(settings, "SMTP_PASSWORD", "")
    smtp_from = getattr(settings, "SMTP_FROM_EMAIL", "noreply@tani.ag")

    # Validasi konfigurasi SMTP
    if not smtp_host:
        logger.warning(
            "Konfigurasi SMTP_HOST belum diisi pada file konfigurasi/env. "
            "Email ringkasan alert harian untuk %s tidak dikirim riil ke server SMTP.",
            user_email,
        )
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = smtp_from
        msg["To"] = user_email

        part_text = MIMEText(text_content, "plain", "utf-8")
        part_html = MIMEText(html_content, "html", "utf-8")
        msg.attach(part_text)
        msg.attach(part_html)

        logger.info(
            "Menghubungkan ke SMTP server %s:%s (TLS: %s)...",
            smtp_host,
            smtp_port,
            smtp_tls,
        )
        server = smtplib.SMTP(smtp_host, smtp_port, timeout=15)
        if smtp_tls:
            server.starttls()
        if smtp_user and smtp_password:
            server.login(smtp_user, smtp_password)

        server.sendmail(smtp_from, [user_email], msg.as_string())
        server.quit()

        logger.info("Email ringkasan peringatan harian berhasil dikirim ke: %s", user_email)
        return True

    except Exception as exc:
        logger.error(
            "Gagal mengirimkan email ringkasan alert ke %s melalui SMTP %s:%s. Detail: %s",
            user_email,
            smtp_host,
            smtp_port,
            str(exc),
            exc_info=True,
        )
        return False


async def process_and_send_daily_alert_emails(db: "AsyncSession") -> Dict[str, Any]:
    """Mengambil alert dalam 24 jam terakhir dan mengirimkan ringkasan ke seluruh pengguna aktif.

    Jika tidak ada alert baru dalam 24 jam, proses dilewati (skip) dan dicatat di log.
    """
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.models.alert import Alert
    from app.models.division import Division
    from app.models.estate import Estate
    from app.models.plot import Plot
    from app.models.user import User

    now_utc = datetime.now(timezone.utc)
    cutoff_time = now_utc - timedelta(hours=24)

    # Ambil alert 24 jam terakhir beserta relasi Plot dan Estate
    stmt = (
        select(Alert)
        .options(
            selectinload(Alert.plot).selectinload(Plot.division).selectinload(Division.estate),
        )
        .where(Alert.created_at >= cutoff_time)
        .order_by(Alert.created_at.desc())
    )
    result = await db.execute(stmt)
    alerts = result.scalars().all()

    if not alerts:
        msg = "Tidak ada peringatan baru dalam 24 jam terakhir. Pengiriman email harian dilewati (skip)."
        logger.info(msg)
        return {
            "status": "skipped",
            "message": msg,
            "emails_sent": 0,
            "alerts_count": 0,
            "users_total": 0,
        }

    # Ambil seluruh user terdaftar
    user_stmt = select(User)
    user_res = await db.execute(user_stmt)
    users = user_res.scalars().all()

    if not users:
        msg = "Tidak ditemukan pengguna dalam database untuk dikirimi email."
        logger.warning(msg)
        return {
            "status": "skipped",
            "message": msg,
            "emails_sent": 0,
            "alerts_count": len(alerts),
            "users_total": 0,
        }

    sent_count = 0
    for user in users:
        if not user.email:
            continue
        try:
            success = send_daily_alert_summary(user.email, list(alerts))
            if success:
                sent_count += 1
        except Exception as exc:
            logger.error("Terjadi galat saat memproses email user %s: %s", user.email, str(exc))

    message = (
        f"Pemrosesan selesai. {sent_count} email berhasil dikirim dari {len(users)} pengguna terdaftar. "
        f"Total alert 24 jam terakhir: {len(alerts)}."
    )
    logger.info(message)

    return {
        "status": "success",
        "message": message,
        "emails_sent": sent_count,
        "alerts_count": len(alerts),
        "users_total": len(users),
    }
