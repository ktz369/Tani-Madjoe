"""Comprehensive Simulation Test Suite for Alert Engine 4 Agronomic Rules & SMTP Notification Dispatcher (Wave 10 - Worker 5).

Covers:
1. Synthetic dataset injection triggering 4 agronomic alert rules:
   - Rule 1: Water Stress (NDWI < 0.15 and ET0 > 5.0 mm/day, plus legacy delta NDWI).
   - Rule 2: Pest & Disease (NDVI drop > 15% in 10 days, plus spatial variance).
   - Rule 3: Nitrogen Deficiency (NDRE < 0.25 in vegetative stage).
   - Rule 4: Extreme Drought (Rainfall 0 mm for 7 consecutive days + moisture deficit).
2. Deduplication mechanism:
   - Consecutive runs do not produce duplicate active alerts for the same plot and condition.
   - Updates existing active alert trigger values and description.
   - Allows new alert after resolution or after 7-day lookback window expiry.
   - Different alert types on the same plot coexist independently.
3. SMTP email dispatcher simulation:
   - Real local loopback mock socket SMTP server receiving MIME messages.
   - Offline / connection refused graceful fallback without crashing.
   - Socket timeout graceful fallback without crashing.
   - Authentication failure graceful fallback.
   - HTML template rendering: 4 stat counter boxes, Indonesian date formatting, severity sorting.
   - XSS / HTML injection sanitization.
   - CRLF email header injection rejection.
4. Edge cases & bug hunting:
   - Plot with only 1 observation (telemetry partial history).
   - NaN values in ET0, NDWI, NDVI, NDRE, and rainfall handled cleanly without JSON corruption.
   - Special characters, unicode, and emojis in plot name.
"""

from datetime import date, datetime, timedelta, timezone
import math
import select
import smtplib
import socket
import threading
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.alert_service import (
    ALERT_TYPE_DROUGHT,
    ALERT_TYPE_HARVEST,
    ALERT_TYPE_NITROGEN,
    ALERT_TYPE_PEST,
    ALERT_TYPE_WATER,
    SEVERITY_HIJAU_TUA,
    SEVERITY_KUNING,
    SEVERITY_MERAH,
    SEVERITY_ORANYE,
    check_extreme_drought,
    check_harvest_ready,
    check_nitrogen_stress,
    check_pest_anomaly,
    check_water_stress,
    evaluate_alerts_for_plot,
    get_active_alert,
    is_duplicate_active_alert,
)
from app.services.email_service import (
    format_indonesian_date,
    process_and_send_daily_alert_emails,
    render_daily_alert_email_html,
    render_daily_alert_email_text,
    send_daily_alert_summary,
)


class MockSMTPServerThread(threading.Thread):
    """Lightweight RFC 5321 SMTP server on local ephemeral port for end-to-end socket testing."""

    def __init__(self):
        super().__init__(daemon=True)
        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server_socket.bind(("127.0.0.1", 0))
        self.port = self.server_socket.getsockname()[1]
        self.server_socket.listen(1)
        self.server_socket.settimeout(3.0)
        self.received_messages = []
        self.running = True

    def run(self):
        while self.running:
            try:
                conn, _ = self.server_socket.accept()
            except (socket.timeout, OSError):
                continue

            try:
                conn.sendall(b"220 127.0.0.1 Service ready\r\n")
                in_data = False
                data_buffer = []

                while True:
                    line = conn.recv(1024)
                    if not line:
                        break

                    decoded = line.decode("latin1")
                    if in_data:
                        data_buffer.append(decoded)
                        if "\r\n.\r\n" in decoded or decoded == ".\r\n":
                            in_data = False
                            self.received_messages.append("".join(data_buffer))
                            conn.sendall(b"250 OK message queued\r\n")
                    else:
                        upper = decoded.upper().strip()
                        if upper.startswith("EHLO") or upper.startswith("HELO"):
                            conn.sendall(b"250-127.0.0.1\r\n250 HELP\r\n")
                        elif upper.startswith("MAIL FROM:"):
                            conn.sendall(b"250 OK\r\n")
                        elif upper.startswith("RCPT TO:"):
                            conn.sendall(b"250 OK\r\n")
                        elif upper.startswith("DATA"):
                            in_data = True
                            data_buffer = []
                            conn.sendall(b"354 Start mail input; end with <CRLF>.<CRLF>\r\n")
                        elif upper.startswith("QUIT"):
                            conn.sendall(b"221 Bye\r\n")
                            break
                        else:
                            conn.sendall(b"250 OK\r\n")
            except Exception:
                pass
            finally:
                conn.close()

    def stop(self):
        self.running = False
        try:
            self.server_socket.close()
        except Exception:
            pass


# ===========================================================================
# 1. Test Suite: 4 Agronomic Rules Evaluation
# ===========================================================================


class TestAgronomicAlertRulesSimulation(unittest.TestCase):
    """Simulasi pengujian 4 aturan deteksi anomali agronomis secara mendalam."""

    # -----------------------------------------------------------------------
    # Aturan 1: Water Stress (NDWI < 0.15 dan ET0 > 5.0 mm/hari)
    # -----------------------------------------------------------------------

    def test_rule1_water_stress_triggered_by_ndwi_and_et0(self):
        """Uji Rule 1: Water Stress positif terpicu saat NDWI < 0.15 dan ET0 > 5.0 mm/hari."""
        # NDWI = 0.11 (< 0.15), ET0 = 5.8 mm/hari (> 5.0)
        alert = check_water_stress(
            latest_ndwi=0.11,
            et0_daily_mm=5.8,
        )
        self.assertIsNotNone(alert, "Water stress harus terpicu saat NDWI rendah dan ET0 tinggi.")
        self.assertEqual(alert["alert_type"], ALERT_TYPE_WATER)
        self.assertEqual(alert["severity"], SEVERITY_ORANYE)
        self.assertIn("Cekaman Kekeringan", alert["title"])
        self.assertIn("irigasi", alert["recommendation"].lower())
        self.assertEqual(alert["trigger_values"]["latest_ndwi"], 0.11)
        self.assertEqual(alert["trigger_values"]["et0_daily_mm"], 5.8)
        self.assertEqual(alert["trigger_values"]["ndwi_threshold"], 0.15)
        self.assertEqual(alert["trigger_values"]["et0_threshold"], 5.0)

    def test_rule1_water_stress_not_triggered_adequate_ndwi(self):
        """Uji Rule 1: Water stress tidak terpicu jika NDWI cukup tinggi (>= 0.15) meskipun ET0 tinggi."""
        # NDWI = 0.28 (tajuk lembab), ET0 = 6.2 mm/hari
        alert = check_water_stress(
            latest_ndwi=0.28,
            et0_daily_mm=6.2,
        )
        self.assertIsNone(alert, "Water stress tidak boleh terpicu jika kelembaban tajuk memadai.")

    def test_rule1_water_stress_not_triggered_low_et0(self):
        """Uji Rule 1: Water stress tidak terpicu jika ET0 rendah (<= 5.0 mm/hari) meskipun NDWI < 0.15."""
        # NDWI = 0.12, ET0 = 3.2 mm/hari (evaporasi rendah, misal mendung/hujan)
        alert = check_water_stress(
            latest_ndwi=0.12,
            et0_daily_mm=3.2,
        )
        self.assertIsNone(alert, "Water stress tidak terpicu jika laju evaporasi rendah.")

    def test_rule1_water_stress_triggered_by_delta_ndwi_and_rainfall(self):
        """Uji Rule 1: Water stress juga terpicu via mekanisme delta NDWI 7 hari dan curah hujan minim."""
        # NDWI drop dari 0.30 ke 0.10 (delta = -0.20 < -0.15), curah hujan 7 hari = 2.5 mm (< 10.0 mm)
        alert = check_water_stress(
            latest_ndwi=0.10,
            prev_ndwi=0.30,
            rainfall_7d_mm=2.5,
        )
        self.assertIsNotNone(alert)
        self.assertEqual(alert["alert_type"], ALERT_TYPE_WATER)
        self.assertEqual(alert["trigger_values"]["delta_ndwi"], -0.20)
        self.assertEqual(alert["trigger_values"]["rainfall_7d_mm"], 2.5)

    # -----------------------------------------------------------------------
    # Aturan 2: Pest & Disease (Penurunan NDVI > 15% dalam kurun 10 hari)
    # -----------------------------------------------------------------------

    def test_rule2_pest_disease_triggered_by_ndvi_drop_in_10_days(self):
        """Uji Rule 2: Anomali hama/penyakit terpicu saat penurunan NDVI > 15% dalam rentang <= 10 hari."""
        # NDVI sebelumnya = 0.70, terbaru = 0.56 (penurunan (0.70 - 0.56)/0.70 = 20.0% > 15%)
        # Selang waktu = 7 hari (<= 10 hari)
        alert = check_pest_anomaly(
            latest_ndvi=0.56,
            prev_ndvi=0.70,
            days_between=7,
            custom_thresholds={"pest_drop_pct": 0.15},
        )
        self.assertIsNotNone(alert, "Hama/penyakit harus terpicu pada penurunan tajam NDVI dalam 7 hari.")
        self.assertEqual(alert["alert_type"], ALERT_TYPE_PEST)
        self.assertEqual(alert["severity"], SEVERITY_MERAH)
        self.assertIn("POPT", alert["recommendation"])
        self.assertEqual(alert["trigger_values"]["drop_percentage"], 20.0)
        self.assertEqual(alert["trigger_values"]["days_between"], 7)

    def test_rule2_pest_disease_not_triggered_slow_drop_over_10_days(self):
        """Uji Rule 2: Penurunan tajam tetapi dalam kurun waktu lama (> 10 hari, misal penuaan alami) diabaikan."""
        # Penurunan 20% namun terjadi selama 30 hari (bukan serangan hama mendadak)
        alert = check_pest_anomaly(
            latest_ndvi=0.56,
            prev_ndvi=0.70,
            days_between=30,
            custom_thresholds={"pest_drop_pct": 0.15},
        )
        self.assertIsNone(alert, "Penurunan bertahap > 10 hari bukan serangan hama akut.")

    def test_rule2_pest_disease_not_triggered_minor_drop(self):
        """Uji Rule 2: Penurunan wajar (< 15%) tidak memicu alarm palsu."""
        # Penurunan dari 0.70 ke 0.64 (penurunan 8.6% < 15%)
        alert = check_pest_anomaly(
            latest_ndvi=0.64,
            prev_ndvi=0.70,
            days_between=6,
            custom_thresholds={"pest_drop_pct": 0.15},
        )
        self.assertIsNone(alert)

    def test_rule2_pest_disease_triggered_by_pixel_variance(self):
        """Uji Rule 2: Terpicu oleh variansi piksel kanopi tinggi (> 25%)."""
        alert = check_pest_anomaly(
            latest_ndvi=0.68,
            prev_ndvi=0.70,
            pixel_variance=0.32,
        )
        self.assertIsNotNone(alert)
        self.assertEqual(alert["alert_type"], ALERT_TYPE_PEST)
        self.assertEqual(alert["severity"], SEVERITY_MERAH)
        self.assertEqual(alert["trigger_values"]["pixel_variance"], 0.32)

    # -----------------------------------------------------------------------
    # Aturan 3: Nitrogen Deficiency (NDRE < 0.25 pada fase vegetatif aktif)
    # -----------------------------------------------------------------------

    def test_rule3_nitrogen_deficiency_triggered_vegetative_stage(self):
        """Uji Rule 3: Defisiensi Nitrogen terpicu saat NDRE < 0.25 pada fase vegetatif rimbun (NDVI > 0.60)."""
        # Tajuk lebat (NDVI = 0.74 > 0.60), NDRE = 0.22 (< 0.25)
        alert = check_nitrogen_stress(
            latest_ndvi=0.74,
            latest_ndre=0.22,
            custom_thresholds={"nitrogen_max_ndre": 0.25},
        )
        self.assertIsNotNone(alert, "Defisiensi N harus terpicu saat NDRE < 0.25 pada kanopi rimbun.")
        self.assertEqual(alert["alert_type"], ALERT_TYPE_NITROGEN)
        self.assertEqual(alert["severity"], SEVERITY_KUNING)
        self.assertIn("Defisiensi N", alert["title"])
        self.assertIn("SPAD", alert["recommendation"])
        self.assertEqual(alert["trigger_values"]["latest_ndre"], 0.22)
        self.assertEqual(alert["trigger_values"]["ndre_threshold"], 0.25)

    def test_rule3_nitrogen_deficiency_not_triggered_sparse_canopy(self):
        """Uji Rule 3: Tidak terpicu jika tanaman masih bibit/tajuk belum rapat (NDVI <= 0.60)."""
        # NDVI = 0.40, NDRE = 0.18
        alert = check_nitrogen_stress(
            latest_ndvi=0.40,
            latest_ndre=0.18,
            custom_thresholds={"nitrogen_max_ndre": 0.25},
        )
        self.assertIsNone(alert, "Kanopi belum rapat tidak dievaluasi sebagai defisiensi N kanopi lebat.")

    def test_rule3_nitrogen_deficiency_not_triggered_healthy_ndre(self):
        """Uji Rule 3: Tidak terpicu jika kadar klorofil kanopi optimal (NDRE >= 0.25)."""
        # NDVI = 0.76, NDRE = 0.34
        alert = check_nitrogen_stress(
            latest_ndvi=0.76,
            latest_ndre=0.34,
            custom_thresholds={"nitrogen_max_ndre": 0.25},
        )
        self.assertIsNone(alert)

    # -----------------------------------------------------------------------
    # Aturan 4: Extreme Drought (Hujan 0 mm selama 7 hari + defisit kelembaban)
    # -----------------------------------------------------------------------

    def test_rule4_extreme_drought_triggered_by_consecutive_dry_days_and_deficit(self):
        """Uji Rule 4: Kekeringan ekstrem terpicu saat hujan 0 mm 7 hari berturut-turut dan NDWI < 0.15."""
        alert = check_extreme_drought(
            consecutive_dry_days=7,
            latest_ndwi=0.08,
            moisture_deficit=0.42,
        )
        self.assertIsNotNone(alert, "Kekeringan ekstrem harus terpicu pada 7 hari kering + defisit kelembaban.")
        self.assertEqual(alert["alert_type"], ALERT_TYPE_DROUGHT)
        self.assertEqual(alert["severity"], SEVERITY_MERAH)
        self.assertIn("Kekeringan Ekstrem", alert["title"])
        self.assertIn("irigasi darurat", alert["recommendation"].lower())
        self.assertEqual(alert["trigger_values"]["consecutive_dry_days"], 7)
        self.assertEqual(alert["trigger_values"]["latest_ndwi"], 0.08)
        self.assertEqual(alert["trigger_values"]["moisture_deficit"], 0.42)

    def test_rule4_extreme_drought_triggered_by_rainfall_7d_zero(self):
        """Uji Rule 4: Terpicu saat total akumulasi rainfall 7 hari = 0.0 mm dan defisit kelembaban terdeteksi."""
        alert = check_extreme_drought(
            rainfall_7d_mm=0.0,
            latest_ndwi=0.09,
        )
        self.assertIsNotNone(alert)
        self.assertEqual(alert["alert_type"], ALERT_TYPE_DROUGHT)
        self.assertEqual(alert["severity"], SEVERITY_MERAH)

    def test_rule4_extreme_drought_not_triggered_insufficient_dry_days(self):
        """Uji Rule 4: Tidak terpicu jika hari tanpa hujan baru 4 hari (< 7 hari)."""
        alert = check_extreme_drought(
            consecutive_dry_days=4,
            latest_ndwi=0.08,
            rainfall_7d_mm=5.0,
        )
        self.assertIsNone(alert)

    def test_rule4_extreme_drought_not_triggered_no_moisture_deficit(self):
        """Uji Rule 4: Tidak terpicu jika 7 hari tanpa hujan namun tanah/tajuk masih lembab (NDWI >= 0.15)."""
        alert = check_extreme_drought(
            consecutive_dry_days=7,
            latest_ndwi=0.32,
            moisture_deficit=0.0,
        )
        self.assertIsNone(alert, "Jika kelembaban masih tinggi (misal lahan beririgasi teknis), bukan kekeringan ekstrem.")


# ===========================================================================
# 2. Test Suite: Deduplication Mechanism Simulation
# ===========================================================================


class TestAlertDeduplicationSimulation(unittest.IsolatedAsyncioTestCase):
    """Simulasi pengujian mekanisme deduplikasi alert untuk mencegah spamming."""

    async def test_deduplication_consecutive_runs_prevent_duplicate_creation(self):
        """Uji deduplikasi: Eksekusi berurutan pada kondisi anomali yang sama tidak membuat alert duplikat."""
        mock_db = AsyncMock()
        plot_id = 42

        # Skenario: Di DB sudah ada alert aktif sejenis yang dibuat 1 hari yang lalu
        now = datetime.now(timezone.utc)
        existing_alert = MagicMock()
        existing_alert.id = 1001
        existing_alert.plot_id = plot_id
        existing_alert.alert_type = ALERT_TYPE_WATER
        existing_alert.is_resolved = False
        existing_alert.created_at = now - timedelta(days=1)
        existing_alert.trigger_values = {"latest_ndwi": 0.14, "et0_daily_mm": 5.2}

        # Mock query return
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = existing_alert
        mock_db.execute.return_value = mock_result

        # Verifikasi get_active_alert menemukan alert yang aktif
        found = await get_active_alert(mock_db, plot_id, ALERT_TYPE_WATER, lookback_days=7)
        self.assertIsNotNone(found)
        self.assertEqual(found.id, 1001)

        # Verifikasi is_duplicate_active_alert mengembalikan True
        is_dup = await is_duplicate_active_alert(mock_db, plot_id, ALERT_TYPE_WATER, lookback_days=7)
        self.assertTrue(is_dup, "Harus mengembalikan True karena alert aktif sudah ada dalam 7 hari.")

    async def test_deduplication_allows_new_alert_after_resolved(self):
        """Uji deduplikasi: Alert lama yang sudah di-resolve memperbolehkan pembuatan alert baru."""
        mock_db = AsyncMock()
        plot_id = 42

        # Di DB query hanya mencari Alert.is_resolved.is_(False), maka query akan mengembalikan None
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        is_dup = await is_duplicate_active_alert(mock_db, plot_id, ALERT_TYPE_WATER, lookback_days=7)
        self.assertFalse(is_dup, "Alert yang sudah diselesaikan (resolved) tidak boleh memblokir alert baru.")

    async def test_deduplication_lookback_window_expiry(self):
        """Uji deduplikasi: Alert aktif yang telah melampaui 7 hari (> lookback_days) memperbolehkan pembuatan alert baru."""
        mock_db = AsyncMock()
        plot_id = 42

        # Mock database tidak menemukan alert aktif dalam 7 hari terakhir (karena cutoff_time)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        is_dup = await is_duplicate_active_alert(mock_db, plot_id, ALERT_TYPE_WATER, lookback_days=7)
        self.assertFalse(is_dup, "Alert aktif berusia > 7 hari harus memperbolehkan penerbitan evaluasi baru.")

    async def test_deduplication_different_alert_types_coexist(self):
        """Uji deduplikasi: Dua tipe alert berbeda pada petak yang sama tidak saling memblokir."""
        mock_db = AsyncMock()
        plot_id = 42

        # Saat mencari ALERT_TYPE_NITROGEN, tidak ditemukan (None) meskipun ALERT_TYPE_WATER aktif
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        is_dup = await is_duplicate_active_alert(mock_db, plot_id, ALERT_TYPE_NITROGEN, lookback_days=7)
        self.assertFalse(is_dup, "Tipe alert yang berbeda tidak boleh terhalang oleh deduplikasi tipe lain.")


# ===========================================================================
# 3. Test Suite: Edge Cases & Bug Hunting
# ===========================================================================


class TestEdgeCasesAndAdversarialInput(unittest.TestCase):
    """Simulasi pengujian input ekstrem, nilai NaN, dan data telemetri parsial."""

    def test_edge_case_plot_with_only_one_observation(self):
        """Uji petak dengan riwayat data telemetri parsial (hanya 1 observasi Sentinel-2)."""
        latest_ndvi = 0.72
        latest_ndre = 0.21
        latest_ndwi = 0.11

        # Aturan observasi tunggal: Stres Nitrogen
        n_alert = check_nitrogen_stress(
            latest_ndvi=latest_ndvi,
            latest_ndre=latest_ndre,
            phase_ndre_threshold=0.32,
        )
        self.assertIsNotNone(n_alert, "Aturan Nitrogen harus dapat dievaluasi dengan 1 observasi.")

        # Aturan observasi tunggal: Stres Air via ET0 harian
        w_alert = check_water_stress(
            latest_ndwi=latest_ndwi,
            prev_ndwi=None,  # Tidak ada observasi historis sebelumnya
            et0_daily_mm=5.6,
        )
        self.assertIsNotNone(w_alert, "Aturan Water Stress via ET0 harus dapat berjalan dengan 1 observasi.")

        # Aturan diferensial: Hama/penyakit yang memerlukan observasi sebelumnya
        p_alert = check_pest_anomaly(
            latest_ndvi=latest_ndvi,
            prev_ndvi=None,
        )
        self.assertIsNone(p_alert, "Aturan penurunan NDVI harus aman mengembalikan None saat prev_ndvi None tanpa melempar exception.")

    def test_edge_case_nan_values_handled_gracefully(self):
        """Uji nilai float('nan') pada ET0, NDWI, NDVI, NDRE tidak menyebabkan crash atau payload corrupt."""
        nan_val = float("nan")

        # Uji NaN pada Water Stress
        self.assertIsNone(check_water_stress(latest_ndwi=nan_val, et0_daily_mm=5.5))
        self.assertIsNone(check_water_stress(latest_ndwi=0.10, et0_daily_mm=nan_val))
        self.assertIsNone(check_water_stress(latest_ndwi=0.10, prev_ndwi=nan_val, rainfall_7d_mm=5.0))
        self.assertIsNone(check_water_stress(latest_ndwi=0.10, prev_ndwi=0.25, rainfall_7d_mm=nan_val))

        # Uji NaN pada Nitrogen Stress
        self.assertIsNone(check_nitrogen_stress(latest_ndvi=nan_val, latest_ndre=0.20))
        self.assertIsNone(check_nitrogen_stress(latest_ndvi=0.75, latest_ndre=nan_val))

        # Uji NaN pada Pest Anomaly
        self.assertIsNone(check_pest_anomaly(latest_ndvi=nan_val, prev_ndvi=0.70))
        self.assertIsNone(check_pest_anomaly(latest_ndvi=0.50, prev_ndvi=nan_val))

        # Uji NaN pada Extreme Drought
        self.assertIsNone(check_extreme_drought(rainfall_7d_mm=nan_val, latest_ndwi=0.10))
        self.assertIsNone(check_extreme_drought(consecutive_dry_days=7, latest_ndwi=nan_val))
        self.assertIsNone(check_extreme_drought(consecutive_dry_days=7, moisture_deficit=nan_val))

        # Uji NaN pada Harvest Ready
        self.assertIsNone(check_harvest_ready(gdd_cumulative=nan_val, gdd_target_total=1900.0, latest_ndvi=0.30))
        self.assertIsNone(check_harvest_ready(gdd_cumulative=1950.0, gdd_target_total=nan_val, latest_ndvi=0.30))
        self.assertIsNone(check_harvest_ready(gdd_cumulative=1950.0, gdd_target_total=1900.0, latest_ndvi=nan_val))

    def test_edge_case_special_characters_and_emojis_in_plot_name(self):
        """Uji karakter khusus, simbol non-ASCII, dan emoji pada nama petak lahan."""
        complex_plot_name = "🌾 Petak #404: \"Subur\" & 'Makmur' <Blok-C> \u2600\ufe0f"
        complex_estate_name = "Kebun Sawit & Padi (Unit 100% Organik)"

        alert_item = {
            "title": "Uji Nama Petak Khusus",
            "severity": "merah",
            "alert_type": "water_stress",
            "description": "Pengujian karakter Unicode & simbol.",
            "recommendation": "Lakukan verifikasi visual.",
            "plot_name": complex_plot_name,
            "estate_name": complex_estate_name,
            "created_at": datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc),
        }

        # Rendering HTML harus sukses tanpa exception dan karakter khusus ter-escape
        html = render_daily_alert_email_html([alert_item], recipient_name="Manajer Kebun & Operasional")
        self.assertIn("&amp;", html)
        self.assertIn("&quot;Subur&quot;", html)
        self.assertIn("&lt;Blok-C&gt;", html)
        self.assertIn("🌾", html)

        # Rendering Teks biasa harus sukses
        text = render_daily_alert_email_text([alert_item])
        self.assertIn(complex_plot_name, text)
        self.assertIn(complex_estate_name, text)


# ===========================================================================
# 4. Test Suite: SMTP Email Dispatcher & Security Sanitization
# ===========================================================================


class TestSMTPEmailDispatcherSimulation(unittest.TestCase):
    """Simulasi dispatcher email SMTP dengan server mock lokal, error handling, dan sanitasi."""

    def setUp(self):
        self.sample_alerts = [
            {
                "id": 1,
                "title": "Cekaman Kekeringan Kritis",
                "severity": "merah",
                "alert_type": "extreme_drought",
                "description": "7 hari berturut-turut tanpa hujan.",
                "recommendation": "Irigasi darurat segera.",
                "plot_name": "Petak A-01",
                "estate_name": "Kebun Karawang",
                "created_at": datetime(2026, 9, 5, 8, 0, tzinfo=timezone.utc),
            },
            {
                "id": 2,
                "title": "Stres Air",
                "severity": "oranye",
                "alert_type": "water_stress",
                "description": "NDWI < 0.15 dan ET0 > 5.0.",
                "recommendation": "Buka saluran irigasi sekunder.",
                "plot_name": "Petak B-02",
                "estate_name": "Kebun Subang",
                "created_at": datetime(2026, 9, 5, 7, 30, tzinfo=timezone.utc),
            },
            {
                "id": 3,
                "title": "Defisiensi Nitrogen",
                "severity": "kuning",
                "alert_type": "nitrogen_stress",
                "description": "NDRE < 0.25 pada fase vegetatif.",
                "recommendation": "Aplikasi pupuk urea susulan.",
                "plot_name": "Petak C-03",
                "estate_name": "Kebun Cianjur",
                "created_at": datetime(2026, 9, 5, 7, 0, tzinfo=timezone.utc),
            },
        ]

    def test_smtp_dispatch_with_real_loopback_mock_server(self):
        """Simulasikan pengiriman email SMTP riil via local socket mock SMTP server."""
        mock_server = MockSMTPServerThread()
        mock_server.start()

        try:
            with patch("app.services.email_service.settings") as mock_settings:
                mock_settings.SMTP_HOST = "127.0.0.1"
                mock_settings.SMTP_PORT = mock_server.port
                mock_settings.SMTP_TLS = False
                mock_settings.SMTP_USER = ""
                mock_settings.SMTP_PASSWORD = ""
                mock_settings.SMTP_FROM_EMAIL = "noreply@tani.ag"
                mock_settings.FRONTEND_URL = "http://localhost:3000"

                success = send_daily_alert_summary("agronom@tani.ag", self.sample_alerts)

                self.assertTrue(success, "Pengiriman ke mock SMTP server harus sukses.")
                self.assertGreaterEqual(len(mock_server.received_messages), 1)

                received = mock_server.received_messages[0]
                self.assertIn("agronom@tani.ag", received)
                self.assertIn("noreply@tani.ag", received)
                import email
                from email.header import decode_header
                msg = email.message_from_string(received)
                decoded_subject = "".join(
                    part.decode(enc or "utf-8") if isinstance(part, bytes) else part
                    for part, enc in decode_header(msg["Subject"])
                )
                self.assertIn("Ringkasan Peringatan Harian", decoded_subject)
        finally:
            mock_server.stop()

    def test_smtp_offline_connection_failure_graceful_handling(self):
        """Simulasikan server SMTP offline (Connection Refused) tanpa menyebabkan crash scheduler."""
        with patch("app.services.email_service.settings") as mock_settings:
            # Gunakan port lokal yang tertutup
            mock_settings.SMTP_HOST = "127.0.0.1"
            mock_settings.SMTP_PORT = 19999
            mock_settings.SMTP_TLS = False
            mock_settings.SMTP_USER = ""
            mock_settings.SMTP_PASSWORD = ""
            mock_settings.SMTP_FROM_EMAIL = "noreply@tani.ag"

            success = send_daily_alert_summary("agronom@tani.ag", self.sample_alerts)
            self.assertFalse(success, "Harus mengembalikan False secara aman saat server SMTP offline.")

    @patch("smtplib.SMTP")
    def test_smtp_timeout_graceful_handling(self, mock_smtp_cls):
        """Simulasikan penanganan timeout server SMTP tanpa menghentikan eksekusi."""
        mock_smtp_cls.side_effect = socket.timeout("Koneksi SMTP timeout")

        with patch("app.services.email_service.settings") as mock_settings:
            mock_settings.SMTP_HOST = "smtp.slow-server.com"
            mock_settings.SMTP_PORT = 587
            mock_settings.SMTP_TLS = True
            mock_settings.SMTP_USER = ""
            mock_settings.SMTP_PASSWORD = ""
            mock_settings.SMTP_FROM_EMAIL = "noreply@tani.ag"

            success = send_daily_alert_summary("agronom@tani.ag", self.sample_alerts)
            self.assertFalse(success, "Harus menangani timeout secara elegan tanpa melempar exception unhandled.")

    @patch("smtplib.SMTP")
    def test_smtp_authentication_failure_graceful_handling(self, mock_smtp_cls):
        """Simulasikan kegagalan otentikasi SMTP (535 Authentication failed)."""
        mock_server = MagicMock()
        mock_server.login.side_effect = smtplib.SMTPAuthenticationError(535, b"Otentikasi ditolak")
        mock_smtp_cls.return_value = mock_server

        with patch("app.services.email_service.settings") as mock_settings:
            mock_settings.SMTP_HOST = "smtp.secure.com"
            mock_settings.SMTP_PORT = 587
            mock_settings.SMTP_TLS = True
            mock_settings.SMTP_USER = "user@secure.com"
            mock_settings.SMTP_PASSWORD = "wrongpassword"
            mock_settings.SMTP_FROM_EMAIL = "noreply@tani.ag"

            success = send_daily_alert_summary("agronom@tani.ag", self.sample_alerts)
            self.assertFalse(success, "Harus menangani SMTPAuthenticationError secara aman.")

    def test_html_template_rendering_structure_and_stats(self):
        """Memverifikasi struktur HTML, badge tanggal Indonesia, 4 counter keparahan, dan tombol CTA."""
        html = render_daily_alert_email_html(self.sample_alerts, recipient_name="Budi Santoso")

        # 1. Header & Greeting
        self.assertIn("Ringkasan Peringatan Harian — Tani", html)
        self.assertIn("Halo <strong>Budi Santoso</strong>,", html)

        # 2. Tanggal format Indonesia
        current_date_str = format_indonesian_date()
        self.assertIn(current_date_str, html)

        # 3. Stat boxes
        self.assertIn("Kritis", html)
        self.assertIn("Tinggi", html)
        self.assertIn("Sedang", html)
        self.assertIn("Panen", html)

        # 4. CTA Button
        self.assertIn("Buka Dashboard Pemantauan", html)

    def test_html_xss_injection_sanitization(self):
        """Uji pencegahan HTML injection / XSS pada konten template email peringatan."""
        malicious_alerts = [
            {
                "id": 999,
                "title": "<script>alert('XSS-TITLE')</script>Serangan Hama",
                "severity": "merah",
                "alert_type": "pest_anomaly",
                "description": "<img src=x onerror=\"document.cookie='stolen'\">Tajuk rusak",
                "recommendation": "<a href=\"javascript:alert('pwn')\">Klik Rekomendasi</a>",
                "plot_name": "<b onmouseover=\"alert(1)\">Petak Alpha</b>",
                "estate_name": "<iframe src=\"http://attacker.com\">Kebun Beta</iframe>",
                "created_at": datetime.now(timezone.utc),
            }
        ]

        html = render_daily_alert_email_html(
            malicious_alerts,
            recipient_name="<script>alert('RECIPIENT')</script>Budi",
        )

        # Pastikan tidak ada raw HTML injection tags
        self.assertNotIn("<script>alert('XSS-TITLE')</script>", html)
        self.assertNotIn("<img src=x onerror=", html)
        self.assertNotIn("<iframe src=", html)
        self.assertNotIn("<script>alert('RECIPIENT')</script>", html)

        # Pastikan tag telah di-escape menjadi entity aman
        self.assertIn("&lt;script&gt;alert(&#x27;XSS-TITLE&#x27;)&lt;/script&gt;", html)
        self.assertIn("&lt;img src=x onerror=", html)
        self.assertIn("&lt;iframe src=", html)
        self.assertIn("&lt;script&gt;alert(&#x27;RECIPIENT&#x27;)&lt;/script&gt;Budi", html)

    def test_email_header_crlf_injection_blocked(self):
        """Uji pencegahan Email Header Injection via karakter baris baru (CRLF)."""
        malicious_emails = [
            "victim@tani.ag\r\nBcc: evil@attacker.com",
            "victim@tani.ag\nSubject: Spoofed Alert",
            "victim@tani.ag\r\n\r\nInjecting SMTP Body",
        ]

        for mal_email in malicious_emails:
            with self.subTest(email=mal_email):
                success = send_daily_alert_summary(mal_email, self.sample_alerts)
                self.assertFalse(success, f"Email header injection harus ditolak untuk: {mal_email!r}")


# ===========================================================================
# 5. Test Suite: Database-Integrated Alert Engine Evaluation
# ===========================================================================


class TestDatabaseIntegratedAlertEngine(unittest.IsolatedAsyncioTestCase):
    """Simulasi pengujian end-to-end evaluasi petak dan pengiriman email harian."""

    async def test_evaluate_alerts_for_plot_with_water_and_drought_data(self):
        """Simulasikan evaluasi petak dengan data cuaca dan spektral pemicu water stress dan drought."""
        mock_db = AsyncMock()

        # Mock Plot
        mock_plot = MagicMock()
        mock_plot.id = 101
        mock_plot.name = "Petak C-05"
        mock_plot.crop_type = "padi"
        mock_plot.planting_date = date.today() - timedelta(days=45)
        mock_plot.variety = MagicMock()
        mock_plot.variety.phases = []
        mock_plot.division = MagicMock()
        mock_plot.division.estate_id = 5

        mock_plot_res = MagicMock()
        mock_plot_res.scalar_one_or_none.return_value = mock_plot

        # Mock Spectral: NDWI rendah = 0.10, NDVI tinggi = 0.72, NDRE = 0.35
        mock_spec = MagicMock()
        mock_spec.ndvi = 0.72
        mock_spec.ndre = 0.35
        mock_spec.ndwi = 0.10
        mock_spec.observation_date = date.today()

        mock_spec_res = MagicMock()
        mock_spec_res.scalars.return_value.all.return_value = [mock_spec]

        # Mock Weather: 7 hari tanpa hujan, ET0 = 5.6 mm/hari
        weather_records = []
        for d in range(7):
            w = MagicMock()
            w.observation_date = date.today() - timedelta(days=d)
            w.rainfall_mm = 0.0
            w.et0_mm = 5.6
            weather_records.append(w)

        mock_weather_res = MagicMock()
        mock_weather_res.scalars.return_value.all.return_value = weather_records

        # Mock GDD
        mock_gdd_res = MagicMock()
        mock_gdd_res.scalar_one_or_none.return_value = None

        # Mock get_active_alert -> tidak ada alert aktif
        mock_active_alert_res = MagicMock()
        mock_active_alert_res.scalar_one_or_none.return_value = None

        mock_db.execute.side_effect = [
            mock_plot_res,          # Fetch Plot
            mock_spec_res,          # Fetch Spectral
            mock_weather_res,       # Fetch Weather
            mock_gdd_res,           # Fetch GDD
            mock_active_alert_res,  # Deduplication check 1 (Water Stress)
            mock_active_alert_res,  # Deduplication check 2 (Extreme Drought)
        ]

        alerts = await evaluate_alerts_for_plot(mock_db, plot_id=101)

        self.assertGreaterEqual(len(alerts), 2)
        alert_types = {a.alert_type for a in alerts}
        self.assertIn(ALERT_TYPE_WATER, alert_types)
        self.assertIn(ALERT_TYPE_DROUGHT, alert_types)

        # Verifikasi db.commit dipanggil untuk menyimpan alert baru
        mock_db.commit.assert_called_once()


if __name__ == "__main__":
    unittest.main()
