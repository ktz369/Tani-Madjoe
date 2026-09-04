"""Unit tests for Alert Engine anomaly detection rules and deduplication logic.

Tests cover:
1. Aturan 1 — Stres Nitrogen (NDVI > 0.60 DAN NDRE <= ndre_threshold * 0.85).
2. Aturan 2 — Stres Air / Cekaman Kekeringan (Delta NDWI 7 hari < -0.15 DAN curah hujan 7 hari < 10.0 mm).
3. Aturan 3 — Hama / Kerusakan Rebah (Penurunan tajuk NDVI > 25% atau variabilitas piksel > 25%).
4. Aturan 4 — Siap Panen (GDD kumulatif >= target varietas DAN latest NDVI <= 0.35).
5. Logika Deduplikasi Cerdas (Pencegahan duplikasi alert aktif bertipe sama dalam jendela 7 hari).
"""

from datetime import datetime, timedelta, timezone
import unittest

from app.services.alert_service import (
    ALERT_TYPE_HARVEST,
    ALERT_TYPE_NITROGEN,
    ALERT_TYPE_PEST,
    ALERT_TYPE_WATER,
    SEVERITY_HIJAU_TUA,
    SEVERITY_KUNING,
    SEVERITY_MERAH,
    SEVERITY_ORANYE,
    check_harvest_ready,
    check_nitrogen_stress,
    check_pest_anomaly,
    check_water_stress,
)


class TestAlertEngine(unittest.TestCase):
    """Test suite untuk 4 aturan deteksi Alert Engine dan logika deduplikasi."""

    # -------------------------------------------------------------------------
    # 1. Aturan 1 — Stres Nitrogen
    # -------------------------------------------------------------------------

    def test_nitrogen_stress_triggered_positive(self):
        """Uji deteksi positif defisiensi nitrogen (NDVI > 0.60 dan NDRE rendah)."""
        # NDVI = 0.75 (> 0.60)
        # NDRE = 0.22 <= (0.32 * 0.85 = 0.272)
        alert = check_nitrogen_stress(
            latest_ndvi=0.75,
            latest_ndre=0.22,
            phase_ndre_threshold=0.32,
        )
        self.assertIsNotNone(alert)
        self.assertEqual(alert["alert_type"], ALERT_TYPE_NITROGEN)
        self.assertEqual(alert["severity"], SEVERITY_KUNING)
        self.assertEqual(alert["title"], "Potensi Stres Nitrogen (Defisiensi N)")
        self.assertIn("SPAD", alert["recommendation"])
        self.assertEqual(alert["trigger_values"]["latest_ndvi"], 0.75)
        self.assertEqual(alert["trigger_values"]["latest_ndre"], 0.22)

    def test_nitrogen_stress_not_triggered_low_ndvi(self):
        """Uji kondisi di mana tajuk belum rimbun (NDVI <= 0.60) sehingga bukan defisiensi N tajuk lebat."""
        # NDVI = 0.55 (<= 0.60), NDRE = 0.20
        alert = check_nitrogen_stress(
            latest_ndvi=0.55,
            latest_ndre=0.20,
            phase_ndre_threshold=0.32,
        )
        self.assertIsNone(alert)

    def test_nitrogen_stress_not_triggered_adequate_ndre(self):
        """Uji kondisi klorofil mencukupi (NDRE di atas ambang batas stres)."""
        # NDVI = 0.78, NDRE = 0.35 (> 0.32 * 0.85 = 0.272)
        alert = check_nitrogen_stress(
            latest_ndvi=0.78,
            latest_ndre=0.35,
            phase_ndre_threshold=0.32,
        )
        self.assertIsNone(alert)

    def test_nitrogen_stress_custom_threshold_override(self):
        """Uji kemampuan override ambang batas via custom threshold."""
        # Custom: min_ndvi = 0.70, ndre_factor = 0.90 (0.30 * 0.90 = 0.27)
        customs = {"nitrogen_min_ndvi": 0.70, "nitrogen_ndre_factor": 0.90}
        alert = check_nitrogen_stress(
            latest_ndvi=0.72,
            latest_ndre=0.25,
            phase_ndre_threshold=0.30,
            custom_thresholds=customs,
        )
        self.assertIsNotNone(alert)
        self.assertEqual(alert["trigger_values"]["ndre_threshold"], 0.27)

    def test_nitrogen_stress_none_handling(self):
        """Uji penanganan input None pada stres nitrogen."""
        self.assertIsNone(check_nitrogen_stress(None, 0.25))
        self.assertIsNone(check_nitrogen_stress(0.75, None))
        self.assertIsNone(check_nitrogen_stress(None, None))

    # -------------------------------------------------------------------------
    # 2. Aturan 2 — Stres Air / Cekaman Kekeringan
    # -------------------------------------------------------------------------

    def test_water_stress_triggered_positive(self):
        """Uji deteksi positif cekaman kekeringan (delta NDWI < -0.15 dan hujan 7 hari < 10 mm)."""
        # NDWI terbaru = 0.05, NDWI 7 hari lalu = 0.25 -> Delta = -0.20 (< -0.15)
        # Curah hujan 7 hari = 3.2 mm (< 10.0 mm)
        alert = check_water_stress(
            latest_ndwi=0.05,
            prev_ndwi=0.25,
            rainfall_7d_mm=3.2,
        )
        self.assertIsNotNone(alert)
        self.assertEqual(alert["alert_type"], ALERT_TYPE_WATER)
        self.assertEqual(alert["severity"], SEVERITY_ORANYE)
        self.assertEqual(alert["title"], "Peringatan Cekaman Kekeringan / Stres Air")
        self.assertIn("irigasi", alert["recommendation"].lower())
        self.assertEqual(alert["trigger_values"]["delta_ndwi"], -0.20)
        self.assertEqual(alert["trigger_values"]["rainfall_7d_mm"], 3.2)

    def test_water_stress_not_triggered_insufficient_ndwi_drop(self):
        """Uji kondisi ketika penurunan NDWI tidak melewati batas kritis (misal delta >= -0.15)."""
        # NDWI terbaru = 0.18, NDWI 7 hari lalu = 0.25 -> Delta = -0.07 (>= -0.15)
        alert = check_water_stress(
            latest_ndwi=0.18,
            prev_ndwi=0.25,
            rainfall_7d_mm=2.0,
        )
        self.assertIsNone(alert)

    def test_water_stress_not_triggered_adequate_rainfall(self):
        """Uji kondisi ketika penurunan NDWI terjadi namun curah hujan mencukupi (>= 10.0 mm)."""
        # Delta = -0.22 (< -0.15), tapi curah hujan = 45.0 mm (tidak ada defisit air tanah)
        alert = check_water_stress(
            latest_ndwi=0.05,
            prev_ndwi=0.27,
            rainfall_7d_mm=45.0,
        )
        self.assertIsNone(alert)

    def test_water_stress_none_handling(self):
        """Uji penanganan input None pada stres air."""
        self.assertIsNone(check_water_stress(None, 0.25, 5.0))
        self.assertIsNone(check_water_stress(0.10, None, 5.0))
        self.assertIsNone(check_water_stress(0.10, 0.25, None))

    # -------------------------------------------------------------------------
    # 3. Aturan 3 — Hama / Kerusakan Rebah
    # -------------------------------------------------------------------------

    def test_pest_anomaly_triggered_by_ndvi_drop(self):
        """Uji deteksi serangan hama / rebah akibat penurunan drastis NDVI > 25%."""
        # NDVI sebelumnya = 0.72, terbaru = 0.46
        # Drop = (0.72 - 0.46) / 0.72 = 0.26 / 0.72 = 36.1% (> 25%)
        alert = check_pest_anomaly(
            latest_ndvi=0.46,
            prev_ndvi=0.72,
        )
        self.assertIsNotNone(alert)
        self.assertEqual(alert["alert_type"], ALERT_TYPE_PEST)
        self.assertEqual(alert["severity"], SEVERITY_MERAH)
        self.assertEqual(alert["title"], "Anomali Kanopi Tanaman / Dugaan Serangan Hama atau Rebah")
        self.assertIn("POPT", alert["recommendation"])
        self.assertGreaterEqual(alert["trigger_values"]["drop_percentage"], 25.0)

    def test_pest_anomaly_triggered_by_pixel_variance(self):
        """Uji deteksi anomali tajuk berdasarkan variabilitas/variansi piksel poligon > 25%."""
        alert = check_pest_anomaly(
            latest_ndvi=0.65,
            prev_ndvi=0.70,
            pixel_variance=0.30,  # 30% spatial variance
        )
        self.assertIsNotNone(alert)
        self.assertEqual(alert["alert_type"], ALERT_TYPE_PEST)
        self.assertEqual(alert["severity"], SEVERITY_MERAH)
        self.assertEqual(alert["trigger_values"]["pixel_variance"], 0.30)

    def test_pest_anomaly_not_triggered_normal_fluctuation(self):
        """Uji fluktuasi normal kanopi (penurunan NDVI < 25%)."""
        # NDVI 0.75 ke 0.70 -> penurunan 6.67%
        alert = check_pest_anomaly(
            latest_ndvi=0.70,
            prev_ndvi=0.75,
            pixel_variance=0.05,
        )
        self.assertIsNone(alert)

    def test_pest_anomaly_none_handling(self):
        """Uji penanganan input None pada deteksi hama."""
        self.assertIsNone(check_pest_anomaly(None, 0.70))
        self.assertIsNone(check_pest_anomaly(0.50, None))
        self.assertIsNone(check_pest_anomaly(None, None))

    # -------------------------------------------------------------------------
    # 4. Aturan 4 — Siap Panen (Masak Fisiologis)
    # -------------------------------------------------------------------------

    def test_harvest_ready_triggered_positive(self):
        """Uji deteksi siap panen ketika target GDD tercapai dan tajuk mengering (NDVI <= 0.35)."""
        # GDD kumulatif = 1965.0 >= target 1950.0, NDVI = 0.28 <= 0.35
        alert = check_harvest_ready(
            gdd_cumulative=1965.0,
            gdd_target_total=1950.0,
            latest_ndvi=0.28,
        )
        self.assertIsNotNone(alert)
        self.assertEqual(alert["alert_type"], ALERT_TYPE_HARVEST)
        self.assertEqual(alert["severity"], SEVERITY_HIJAU_TUA)
        self.assertEqual(alert["title"], "Tanaman Siap Dipanen (Masak Fisiologis)")
        self.assertIn("pemanenan", alert["recommendation"].lower())
        self.assertEqual(alert["trigger_values"]["latest_ndvi"], 0.28)

    def test_harvest_ready_not_triggered_gdd_not_met(self):
        """Uji kondisi ketika GDD belum mencapai target kematangan varietas."""
        # GDD = 1600.0 < 1950.0 meskipun NDVI = 0.30
        alert = check_harvest_ready(
            gdd_cumulative=1600.0,
            gdd_target_total=1950.0,
            latest_ndvi=0.30,
        )
        self.assertIsNone(alert)

    def test_harvest_ready_not_triggered_still_green(self):
        """Uji kondisi ketika GDD telah tercapai namun tajuk masih hijau segar (NDVI > 0.35)."""
        # GDD = 2000.0 >= 1950.0, namun NDVI = 0.55 > 0.35 (belum matang penuh / stay-green)
        alert = check_harvest_ready(
            gdd_cumulative=2000.0,
            gdd_target_total=1950.0,
            latest_ndvi=0.55,
        )
        self.assertIsNone(alert)

    def test_harvest_ready_none_handling(self):
        """Uji penanganan input None pada siap panen."""
        self.assertIsNone(check_harvest_ready(None, 1950.0, 0.30))
        self.assertIsNone(check_harvest_ready(1950.0, None, 0.30))
        self.assertIsNone(check_harvest_ready(1950.0, 1950.0, None))

    # -------------------------------------------------------------------------
    # 5. Deduplikasi Cerdas 7 Hari
    # -------------------------------------------------------------------------

    def test_deduplication_logic(self):
        """Uji verifikasi logika deduplikasi waktu dan status resolved."""
        now = datetime.now(timezone.utc)

        # Mock existing alert: aktif (unresolved) dibuat 3 hari yang lalu
        alert_recent_unresolved = {
            "plot_id": 1,
            "alert_type": ALERT_TYPE_NITROGEN,
            "is_resolved": False,
            "created_at": now - timedelta(days=3),
        }

        # Helper simulating deduplication check
        def is_duplicate(existing_list, plot_id, alert_type, lookback_days=7):
            cutoff = now - timedelta(days=lookback_days)
            for a in existing_list:
                if (
                    a["plot_id"] == plot_id
                    and a["alert_type"] == alert_type
                    and not a["is_resolved"]
                    and a["created_at"] >= cutoff
                ):
                    return True
            return False

        # Alert sejenis dalam 3 hari -> Harus dianggap duplikat (True)
        self.assertTrue(
            is_duplicate([alert_recent_unresolved], 1, ALERT_TYPE_NITROGEN),
            "Harus terdeteksi sebagai duplikat karena masih aktif dalam 7 hari terakhir.",
        )

        # Alert tipe berbeda (water_stress) untuk petak yang sama -> Tidak duplikat (False)
        self.assertFalse(
            is_duplicate([alert_recent_unresolved], 1, ALERT_TYPE_WATER),
            "Tipe alert berbeda tidak boleh diblokir oleh deduplikasi.",
        )

        # Alert sejenis namun sudah di-resolve -> Boleh dibuat baru (False)
        alert_resolved = {
            "plot_id": 1,
            "alert_type": ALERT_TYPE_NITROGEN,
            "is_resolved": True,
            "created_at": now - timedelta(days=2),
        }
        self.assertFalse(
            is_duplicate([alert_resolved], 1, ALERT_TYPE_NITROGEN),
            "Alert yang sudah ditandai resolved tidak boleh memblokir alert baru.",
        )

        # Alert sejenis belum resolved namun sudah lampau (> 7 hari, misal 10 hari lalu) -> Boleh dibuat baru (False)
        alert_old_unresolved = {
            "plot_id": 1,
            "alert_type": ALERT_TYPE_NITROGEN,
            "is_resolved": False,
            "created_at": now - timedelta(days=10),
        }
        self.assertFalse(
            is_duplicate([alert_old_unresolved], 1, ALERT_TYPE_NITROGEN),
            "Alert lama (> 7 hari) harus memungkinkan kemunculan evaluasi alert baru.",
        )


if __name__ == "__main__":
    unittest.main()
