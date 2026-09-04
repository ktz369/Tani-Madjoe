"""Unit tests for Email Notification Service (TIKET 17).

Tests cover:
1. Template HTML rendering: Header, date badge, stat counters (Merah, Oranye, Kuning, Hijau),
   Top 10 sorted critical alerts, CTA button, and agrobusiness footer.
2. Plain text fallback rendering.
3. Sample alert generator for testing/previewing.
4. Graceful handling when SMTP_HOST is not configured.
5. Successful email dispatch via mocked smtplib.SMTP.
6. Error handling when SMTP server connection fails.
7. Alert skip logic when no alerts are found in last 24 hours.
"""

from datetime import datetime, timedelta, timezone
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.email_service import (
    format_indonesian_date,
    generate_sample_alerts,
    render_daily_alert_email_html,
    render_daily_alert_email_text,
    send_daily_alert_summary,
)


class TestEmailNotificationService(unittest.TestCase):
    """Test suite for email notification generation and sending."""

    def setUp(self):
        self.sample_alerts = [
            {
                "id": 101,
                "title": "Stres Air Kritis",
                "severity": "merah",
                "alert_type": "water_stress",
                "description": "Delta NDWI turun -0.25",
                "recommendation": "Lakukan irigasi darurat",
                "plot_name": "Petak Alfa",
                "estate_name": "Kebun Suka Maju",
                "created_at": datetime(2026, 9, 5, 6, 0, tzinfo=timezone.utc),
            },
            {
                "id": 102,
                "title": "Defisiensi Nitrogen",
                "severity": "oranye",
                "alert_type": "nitrogen_stress",
                "description": "NDRE rendah di bawah threshold",
                "recommendation": "Aplikasi pupuk urea susulan",
                "plot_name": "Petak Beta",
                "estate_name": "Kebun Suka Maju",
                "created_at": datetime(2026, 9, 5, 5, 30, tzinfo=timezone.utc),
            },
            {
                "id": 103,
                "title": "Potensi Hama Kanopi",
                "severity": "kuning",
                "alert_type": "pest_anomaly",
                "description": "Variasi piksel tajuk terdeteksi",
                "recommendation": "Inspeksi visual lapangan",
                "plot_name": "Petak Gamma",
                "estate_name": "Kebun Makmur",
                "created_at": datetime(2026, 9, 5, 5, 0, tzinfo=timezone.utc),
            },
            {
                "id": 104,
                "title": "Siap Panen",
                "severity": "hijau_tua",
                "alert_type": "harvest_ready",
                "description": "GDD telah mencapai target varietas",
                "recommendation": "Siapkan mesin pemanen",
                "plot_name": "Petak Delta",
                "estate_name": "Kebun Makmur",
                "created_at": datetime(2026, 9, 5, 4, 30, tzinfo=timezone.utc),
            },
        ]

    def test_format_indonesian_date(self):
        """Memastikan fungsi pemformatan tanggal menghasilkan Bahasa Indonesia baku."""
        dt = datetime(2026, 9, 5, 10, 0, 0)
        formatted = format_indonesian_date(dt)
        self.assertEqual(formatted, "Sabtu, 05 September 2026")

        dt2 = datetime(2026, 1, 1, 0, 0, 0)
        formatted2 = format_indonesian_date(dt2)
        self.assertEqual(formatted2, "Kamis, 01 Januari 2026")

    def test_render_daily_alert_email_html_content(self):
        """Memverifikasi struktur HTML, teks header, counter, badge, dan CTA button."""
        html = render_daily_alert_email_html(self.sample_alerts, recipient_name="Petani Handal")

        # 1. Header & Greeting
        self.assertIn("Ringkasan Peringatan Harian — Tani", html)
        self.assertIn("Halo <strong>Petani Handal</strong>,", html)

        # 2. Stat counters (1 merah, 1 oranye, 1 kuning, 1 hijau)
        self.assertIn(">1</div>\n                    <div style=\"font-size: 11px; font-weight: 700; color: #991B1B; margin-top: 4px; text-transform: uppercase;\">Kritis</div>", html)
        self.assertIn("Tinggi", html)
        self.assertIn("Sedang", html)
        self.assertIn("Panen", html)

        # 3. Top alerts list
        self.assertIn("Top 10 Peringatan Membutuhkan Perhatian Cepat", html)
        self.assertIn("Stres Air Kritis", html)
        self.assertIn("Petak Alfa", html)
        self.assertIn("Kebun Suka Maju", html)
        self.assertIn("Lakukan irigasi darurat", html)

        # 4. CTA Button & Footer
        self.assertIn("Buka Dashboard Pemantauan", html)
        self.assertIn("Tani &mdash; Platform SaaS Monitoring", html)
        self.assertIn("Hak Cipta &copy; 2026 Tani Inc.", html)

    def test_render_daily_alert_email_text_content(self):
        """Memverifikasi struktur fallback teks biasa (plain text)."""
        text = render_daily_alert_email_text(self.sample_alerts)
        self.assertIn("RINGKASAN PERINGATAN HARIAN — TANI", text)
        self.assertIn("Kritis (Merah): 1", text)
        self.assertIn("Tinggi (Oranye): 1", text)
        self.assertIn("Sedang (Kuning): 1", text)
        self.assertIn("Siap Panen (Hijau): 1", text)
        self.assertIn("Total Peringatan: 4", text)
        self.assertIn("Petak Alfa (Kebun Suka Maju)", text)
        self.assertIn("Buka Dashboard Pemantauan:", text)

    def test_generate_sample_alerts(self):
        """Memastikan generator data sampel menghasilkan minimal 5 alert dengan berbagai tipe."""
        samples = generate_sample_alerts()
        self.assertGreaterEqual(len(samples), 5)
        severities = {s["severity"] for s in samples}
        self.assertIn("merah", severities)
        self.assertIn("oranye", severities)
        self.assertIn("kuning", severities)
        self.assertIn("hijau_tua", severities)

    def test_send_daily_alert_summary_empty_alerts(self):
        """Jika daftar alert kosong, fungsi harus mengembalikan False tanpa mencoba kirim SMTP."""
        result = send_daily_alert_summary("test@tani.ag", [])
        self.assertFalse(result)

    def test_send_daily_alert_summary_unconfigured_smtp(self):
        """Jika SMTP_HOST kosong, fungsi harus mencatat warning dan mengembalikan False dengan aman."""
        with patch("app.services.email_service.settings") as mock_settings:
            mock_settings.SMTP_HOST = ""
            result = send_daily_alert_summary("petani@tani.ag", self.sample_alerts)
            self.assertFalse(result)

    @patch("smtplib.SMTP")
    def test_send_daily_alert_summary_success(self, mock_smtp_cls):
        """Memastikan fungsi mengirim email dengan sukses saat konfigurasi SMTP valid."""
        mock_server = MagicMock()
        mock_smtp_cls.return_value = mock_server

        with patch("app.services.email_service.settings") as mock_settings:
            mock_settings.SMTP_HOST = "smtp.example.com"
            mock_settings.SMTP_PORT = 587
            mock_settings.SMTP_TLS = True
            mock_settings.SMTP_USER = "user@example.com"
            mock_settings.SMTP_PASSWORD = "secretpassword"
            mock_settings.SMTP_FROM_EMAIL = "noreply@tani.ag"
            mock_settings.FRONTEND_URL = "http://localhost:3000"

            success = send_daily_alert_summary("agronom@kebun.co.id", self.sample_alerts)

            self.assertTrue(success)
            mock_smtp_cls.assert_called_once_with("smtp.example.com", 587, timeout=15)
            mock_server.starttls.assert_called_once()
            mock_server.login.assert_called_once_with("user@example.com", "secretpassword")
            mock_server.sendmail.assert_called_once()
            mock_server.quit.assert_called_once()

    @patch("smtplib.SMTP")
    def test_send_daily_alert_summary_smtp_exception_handled(self, mock_smtp_cls):
        """Memastikan fungsi menangani kegagalan koneksi SMTP tanpa melempar unhandled exception."""
        mock_smtp_cls.side_effect = Exception("SMTP Connection Timeout")

        with patch("app.services.email_service.settings") as mock_settings:
            mock_settings.SMTP_HOST = "smtp.broken.com"
            mock_settings.SMTP_PORT = 587
            mock_settings.SMTP_TLS = True
            mock_settings.SMTP_USER = ""
            mock_settings.SMTP_PASSWORD = ""
            mock_settings.SMTP_FROM_EMAIL = "noreply@tani.ag"

            success = send_daily_alert_summary("user@tani.ag", self.sample_alerts)
            self.assertFalse(success)

    def test_alert_severity_priority_sorting(self):
        """Memastikan urutan Top 10 mengutamakan severity Merah, kemudian Oranye, Kuning, dan Hijau."""
        many_alerts = [
            {"title": "Alert Kuning 1", "severity": "kuning", "created_at": datetime(2026, 9, 5, 1, 0, tzinfo=timezone.utc)},
            {"title": "Alert Hijau 1", "severity": "hijau_tua", "created_at": datetime(2026, 9, 5, 2, 0, tzinfo=timezone.utc)},
            {"title": "Alert Merah 1", "severity": "merah", "created_at": datetime(2026, 9, 5, 3, 0, tzinfo=timezone.utc)},
            {"title": "Alert Oranye 1", "severity": "oranye", "created_at": datetime(2026, 9, 5, 4, 0, tzinfo=timezone.utc)},
        ]
        html = render_daily_alert_email_html(many_alerts)
        idx_merah = html.find("Alert Merah 1")
        idx_oranye = html.find("Alert Oranye 1")
        idx_kuning = html.find("Alert Kuning 1")
        idx_hijau = html.find("Alert Hijau 1")

        self.assertTrue(idx_merah < idx_oranye < idx_kuning < idx_hijau)


class TestProcessAndSendDailyAlertEmails(unittest.IsolatedAsyncioTestCase):
    """Test suite untuk fungsi async process_and_send_daily_alert_emails."""

    async def test_process_and_send_skipped_no_alerts(self):
        """Memastikan eksekusi di-skip ketika tidak ada alert baru dalam 24 jam."""
        import sys
        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result

        mock_sa = MagicMock()
        mock_sa_orm = MagicMock()
        mock_alert_cls = MagicMock()
        mock_alert_cls.created_at.__ge__.return_value = MagicMock()

        with patch.dict(
            sys.modules,
            {
                "sqlalchemy": mock_sa,
                "sqlalchemy.orm": mock_sa_orm,
                "app.models.alert": MagicMock(Alert=mock_alert_cls),
                "app.models.division": MagicMock(),
                "app.models.estate": MagicMock(),
                "app.models.plot": MagicMock(),
                "app.models.user": MagicMock(),
            },
        ):
            from app.services.email_service import process_and_send_daily_alert_emails
            result = await process_and_send_daily_alert_emails(mock_db)

            self.assertEqual(result["status"], "skipped")
            self.assertEqual(result["emails_sent"], 0)
            self.assertIn("dilewati", result["message"].lower())

    async def test_process_and_send_success(self):
        """Memastikan proses berhasil mengirim email ke seluruh user ketika ada alert."""
        import sys
        mock_db = AsyncMock()

        # Alert mock
        mock_alert = MagicMock()
        mock_alert.title = "Stres Air"
        mock_alert.severity = "merah"
        mock_alert.alert_type = "water_stress"
        mock_alert.description = "Delta NDWI turun"
        mock_alert.recommendation = "Irigasi darurat"
        mock_alert.plot = MagicMock()
        mock_alert.plot.name = "Petak 1"
        mock_alert.plot.division = MagicMock()
        mock_alert.plot.division.estate = MagicMock()
        mock_alert.plot.division.estate.name = "Kebun Makmur"
        mock_alert.created_at = datetime.now(timezone.utc)

        # User mock
        mock_user1 = MagicMock(email="user1@tani.ag")
        mock_user2 = MagicMock(email="user2@tani.ag")

        mock_alert_res = MagicMock()
        mock_alert_res.scalars.return_value.all.return_value = [mock_alert]

        mock_user_res = MagicMock()
        mock_user_res.scalars.return_value.all.return_value = [mock_user1, mock_user2]

        mock_db.execute.side_effect = [mock_alert_res, mock_user_res]

        mock_sa = MagicMock()
        mock_sa_orm = MagicMock()
        mock_alert_cls = MagicMock()
        mock_alert_cls.created_at.__ge__.return_value = MagicMock()

        with patch.dict(
            sys.modules,
            {
                "sqlalchemy": mock_sa,
                "sqlalchemy.orm": mock_sa_orm,
                "app.models.alert": MagicMock(Alert=mock_alert_cls),
                "app.models.division": MagicMock(),
                "app.models.estate": MagicMock(),
                "app.models.plot": MagicMock(),
                "app.models.user": MagicMock(),
            },
        ):
            with patch("app.services.email_service.send_daily_alert_summary", return_value=True) as mock_send:
                from app.services.email_service import process_and_send_daily_alert_emails
                res = await process_and_send_daily_alert_emails(mock_db)

                self.assertEqual(res["status"], "success")
                self.assertEqual(res["emails_sent"], 2)
                self.assertEqual(res["alerts_count"], 1)
                self.assertEqual(res["users_total"], 2)
                self.assertEqual(mock_send.call_count, 2)




if __name__ == "__main__":
    unittest.main()

