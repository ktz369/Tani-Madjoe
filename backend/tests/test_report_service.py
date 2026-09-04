"""Unit tests for Reporting Engine Service (TIKET 16).

Tests cover:
1. PDF Laporan Kesehatan Lahan generation (Header, KPI, tabel petak, NDVI, alert aktif).
2. PDF Laporan Prediksi Panen generation (GDD cumulative vs target, prediksi tanggal, estimasi tonase).
3. PDF Laporan Kebutuhan Air & Irigasi generation (ET0, ETc, neraca air, volume m3, rekomendasi).
4. Export CSV Time-Series gabungan (Header lengkap, mapping nilai cuaca, GDD, dan satelit).
5. Analisis Komparasi Antar Musim (Perbandingan metrik antar musim tanam petak yang sama).
6. Graceful handling jika data belum lengkap atau estate tidak ditemukan.
"""

from datetime import date, datetime, timedelta, timezone
import io
import sys
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

# Mock modules that depend on database drivers not installed in test environment
class DummyCol:
    def __ge__(self, other): return True
    def __le__(self, other): return True
    def __gt__(self, other): return True
    def __lt__(self, other): return True
    def __eq__(self, other): return True
    def __ne__(self, other): return True
    def in_(self, other): return True
    def desc(self): return self
    def asc(self): return self
    def __getattr__(self, name): return DummyCol()

class DummyModel:
    def __getattr__(self, name):
        return DummyCol()

for mod in [
    "sqlalchemy", "sqlalchemy.ext", "sqlalchemy.ext.asyncio", "sqlalchemy.orm",
    "geoalchemy2", "shapely", "pydantic_settings", "app.database",
]:
    if mod not in sys.modules:
        sys.modules[mod] = MagicMock()

for mod in [
    "app.models", "app.models.crop_variety", "app.models.division",
    "app.models.estate", "app.models.plot", "app.models.spectral_index",
    "app.models.weather_data", "app.models.gdd_accumulation",
    "app.models.planting_season", "app.models.generated_report",
    "app.models.alert", "app.models.phenology_phase",
]:
    m = MagicMock()
    # Provide dummy model classes
    for cls_name in ["Estate", "Division", "Plot", "CropVariety", "SpectralIndex", "WeatherData", "GddAccumulation", "PlantingSeason", "GeneratedReport", "Alert", "PhenologyPhase"]:
        setattr(m, cls_name, DummyModel())
    sys.modules[mod] = m

from app.services.report_service import (
    export_timeseries_csv,
    generate_harvest_prediction_report,
    generate_health_report,
    generate_season_comparison,
    generate_water_usage_report,
)


def _build_mock_plot(plot_id=1, name="Petak Alfa", crop_type="padi", area=5.0):
    """Create a populated mock Plot instance with relationships."""
    estate = MagicMock()
    estate.id = 1
    estate.name = "Kebun Percobaan Subang"
    estate.kabupaten = "Subang"
    estate.province = "Jawa Barat"

    division = MagicMock()
    division.id = 1
    division.name = "Divisi Barat"
    division.estate_id = estate.id
    division.estate = estate

    phase1 = MagicMock()
    phase1.phase_name = "Vegetatif Awal"
    phase1.gdd_target = 350.0
    phase1.kc_value = 1.05

    phase2 = MagicMock()
    phase2.phase_name = "Generatif / Bunting"
    phase2.gdd_target = 900.0
    phase2.kc_value = 1.20

    phase3 = MagicMock()
    phase3.phase_name = "Pematangan / Panen"
    phase3.gdd_target = 1350.0
    phase3.kc_value = 0.90

    variety = MagicMock()
    variety.id = 1
    variety.name = "Inpari 32 HDB"
    variety.crop_type = "padi"
    variety.cycle_days = 115
    variety.t_base = 10.0
    variety.phases = [phase1, phase2, phase3]

    plot = MagicMock()
    plot.id = plot_id
    plot.name = name
    plot.division_id = division.id
    plot.division = division
    plot.variety_id = variety.id
    plot.variety = variety
    plot.crop_type = crop_type
    plot.area_hectares = area
    plot.planting_date = date(2026, 7, 1)
    plot.current_hst = 65
    plot.current_phase = "Generatif / Bunting"

    # GDD records
    gdd = MagicMock()
    gdd.id = 1
    gdd.plot_id = plot_id
    gdd.observation_date = date(2026, 9, 4)
    gdd.gdd_daily = 16.5
    gdd.gdd_cumulative = 950.0
    gdd.etc_mm = 4.8
    gdd.predicted_phase = "Generatif / Bunting"
    gdd.predicted_harvest_date = date(2026, 10, 15)
    plot.gdd_records = [gdd]

    # Alerts
    alert = MagicMock()
    alert.id = 1
    alert.plot_id = plot_id
    alert.alert_type = "nitrogen_stress"
    alert.severity = "kuning"
    alert.title = "Stres Nitrogen Ringan"
    alert.description = "NDRE turun di bawah target fase."
    alert.recommendation = "Aplikasi pemupukan urea susulan 50 kg/ha."
    alert.is_resolved = False
    alert.created_at = datetime(2026, 9, 3, 10, 0, tzinfo=timezone.utc)
    plot.alerts = [alert]

    # Seasons
    season = MagicMock()
    season.id = 1
    season.plot_id = plot_id
    season.variety_id = variety.id
    season.variety = variety
    season.planting_date = date(2026, 7, 1)
    season.harvest_date = None
    season.status = "active"
    season.yield_estimate_ton_per_ha = 6.8
    season.notes = "Musim Tanam Gadu 2026"
    plot.seasons = [season]

    return plot, estate


class TestReportService(unittest.IsolatedAsyncioTestCase):
    """Test suite for PDF and CSV report engines."""

    def setUp(self):
        self.plot, self.estate = _build_mock_plot()
        self.mock_db = AsyncMock()

    async def test_generate_health_report_pdf(self):
        """Memastikan fungsi generate_health_report menghasilkan berkas PDF yang valid."""
        # Mock database execute results
        # 1. Estate query
        res_estate = MagicMock()
        res_estate.scalar_one_or_none.return_value = self.estate

        # 2. Plots query
        res_plots = MagicMock()
        res_plots.scalars.return_value.all.return_value = [self.plot]

        # 3. Spectral Index query
        spec = MagicMock()
        spec.plot_id = self.plot.id
        spec.observation_date = date(2026, 9, 1)
        spec.ndvi = 0.74
        spec.ndre = 0.35
        spec.ndwi = 0.18
        spec.savi = 0.62
        spec.sar_vv_db = -11.5
        spec.sar_vh_db = -18.2

        res_spec = MagicMock()
        res_spec.scalars.return_value.all.return_value = [spec]

        self.mock_db.execute.side_effect = [res_estate, res_plots, res_spec]

        pdf_bytes = await generate_health_report(
            db=self.mock_db,
            estate_id=1,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 9, 4),
        )

        self.assertIsInstance(pdf_bytes, bytes)
        self.assertGreater(len(pdf_bytes), 1000)
        # Check standard PDF magic header
        self.assertTrue(pdf_bytes.startswith(b"%PDF-"))

    async def test_generate_harvest_prediction_report_pdf(self):
        """Memastikan fungsi generate_harvest_prediction_report menghasilkan berkas PDF valid."""
        res_estate = MagicMock()
        res_estate.scalar_one_or_none.return_value = self.estate

        res_plots = MagicMock()
        res_plots.scalars.return_value.all.return_value = [self.plot]

        self.mock_db.execute.side_effect = [res_estate, res_plots]

        pdf_bytes = await generate_harvest_prediction_report(
            db=self.mock_db,
            estate_id=1,
        )

        self.assertIsInstance(pdf_bytes, bytes)
        self.assertGreater(len(pdf_bytes), 1000)
        self.assertTrue(pdf_bytes.startswith(b"%PDF-"))

    async def test_generate_water_usage_report_pdf(self):
        """Memastikan fungsi generate_water_usage_report menghasilkan berkas PDF valid."""
        res_estate = MagicMock()
        res_estate.scalar_one_or_none.return_value = self.estate

        # Weather query
        weather = MagicMock()
        weather.estate_id = 1
        weather.observation_date = date(2026, 9, 3)
        weather.et0_mm = 4.5
        weather.rainfall_mm = 12.0
        weather.temp_max_c = 32.5
        weather.temp_min_c = 23.0

        res_weather = MagicMock()
        res_weather.scalars.return_value.all.return_value = [weather]

        # Plots query
        res_plots = MagicMock()
        res_plots.scalars.return_value.all.return_value = [self.plot]

        self.mock_db.execute.side_effect = [res_estate, res_weather, res_plots]

        pdf_bytes = await generate_water_usage_report(
            db=self.mock_db,
            estate_id=1,
            start_date=date(2026, 8, 28),
            end_date=date(2026, 9, 4),
        )

        self.assertIsInstance(pdf_bytes, bytes)
        self.assertGreater(len(pdf_bytes), 1000)
        self.assertTrue(pdf_bytes.startswith(b"%PDF-"))

    async def test_export_timeseries_csv(self):
        """Memastikan format CSV time-series memiliki header lengkap dan data per petak."""
        # 1. Plots
        res_plots = MagicMock()
        res_plots.scalars.return_value.all.return_value = [self.plot]

        # 2. Weather
        weather = MagicMock()
        weather.observation_date = date(2026, 9, 1)
        weather.temp_max_c = 33.0
        weather.temp_min_c = 24.0
        weather.rainfall_mm = 5.0
        weather.et0_mm = 4.2
        res_weather = MagicMock()
        res_weather.scalars.return_value.all.return_value = [weather]

        # 3. Spectral
        spec = MagicMock()
        spec.plot_id = self.plot.id
        spec.observation_date = date(2026, 9, 1)
        spec.ndvi = 0.72
        spec.ndre = 0.33
        spec.ndwi = 0.15
        spec.savi = 0.60
        spec.sar_vv_db = -12.0
        spec.sar_vh_db = -19.0
        res_spec = MagicMock()
        res_spec.scalars.return_value.all.return_value = [spec]

        # 4. GDD
        gdd = MagicMock()
        gdd.plot_id = self.plot.id
        gdd.observation_date = date(2026, 9, 1)
        gdd.gdd_daily = 17.0
        gdd.gdd_cumulative = 910.0
        gdd.etc_mm = 4.6
        gdd.predicted_phase = "Generatif / Bunting"
        res_gdd = MagicMock()
        res_gdd.scalars.return_value.all.return_value = [gdd]

        self.mock_db.execute.side_effect = [res_plots, res_weather, res_spec, res_gdd]

        csv_str = await export_timeseries_csv(
            db=self.mock_db,
            estate_id=1,
            start_date=date(2026, 9, 1),
            end_date=date(2026, 9, 1),
        )

        self.assertIn("Tanggal,Nama Petak,Divisi,Komoditas,Varietas,HST", csv_str)
        self.assertIn("Petak Alfa", csv_str)
        self.assertIn("Inpari 32 HDB", csv_str)
        self.assertIn("0.7200", csv_str)
        self.assertIn("33.0", csv_str)
        self.assertIn("910.00", csv_str)

    async def test_generate_season_comparison(self):
        """Memastikan analisis perbandingan musim tanam menghitung metrik dan insight agronomi."""
        # Setup plot with 2 seasons (current active and previous harvested)
        prev_season = MagicMock()
        prev_season.id = 2
        prev_season.plot_id = self.plot.id
        prev_season.variety = self.plot.variety
        prev_season.planting_date = date(2026, 2, 1)
        prev_season.harvest_date = date(2026, 5, 25)
        prev_season.status = "harvested"
        prev_season.yield_estimate_ton_per_ha = 6.2
        prev_season.notes = "Musim Rendengan 2025/2026"

        self.plot.seasons = [self.plot.seasons[0], prev_season]

        # 1. Plot query
        res_plot = MagicMock()
        res_plot.scalar_one_or_none.return_value = self.plot

        # Spectral indices for season 1
        spec_s1 = MagicMock()
        spec_s1.ndvi = 0.78
        spec_s1.ndre = 0.36
        spec_s1.ndwi = 0.20
        res_spec_s1 = MagicMock()
        res_spec_s1.scalars.return_value.all.return_value = [spec_s1]

        # Spectral indices for season 2
        spec_s2 = MagicMock()
        spec_s2.ndvi = 0.70
        spec_s2.ndre = 0.32
        spec_s2.ndwi = 0.16
        res_spec_s2 = MagicMock()
        res_spec_s2.scalars.return_value.all.return_value = [spec_s2]

        self.mock_db.execute.side_effect = [res_plot, res_spec_s1, res_spec_s2]
        self.mock_db.scalar.side_effect = [350.0, 1250.0, 480.0, 1320.0]

        result = await generate_season_comparison(db=self.mock_db, plot_id=1)

        self.assertEqual(result["plot_name"], "Petak Alfa")
        self.assertIsNotNone(result["current_season"])
        self.assertEqual(result["current_season"]["status"], "active")
        self.assertEqual(len(result["historical_seasons"]), 1)
        self.assertEqual(result["historical_seasons"][0]["status"], "harvested")
        self.assertGreater(len(result["comparison_insights"]), 0)

    async def test_generate_health_report_estate_not_found(self):
        """Memastikan ValueError jika estate tidak ditemukan."""
        res = MagicMock()
        res.scalar_one_or_none.return_value = None
        self.mock_db.execute.return_value = res

        with self.assertRaises(ValueError):
            await generate_health_report(db=self.mock_db, estate_id=999)

    async def test_generate_harvest_prediction_report_estate_not_found(self):
        """Memastikan ValueError jika estate tidak ditemukan pada laporan prediksi panen."""
        res = MagicMock()
        res.scalar_one_or_none.return_value = None
        self.mock_db.execute.return_value = res

        with self.assertRaises(ValueError):
            await generate_harvest_prediction_report(db=self.mock_db, estate_id=999)

    async def test_generate_season_comparison_plot_not_found(self):
        """Memastikan ValueError jika plot tidak ditemukan pada analisis komparasi musim."""
        res = MagicMock()
        res.scalar_one_or_none.return_value = None
        self.mock_db.execute.return_value = res

        with self.assertRaises(ValueError):
            await generate_season_comparison(db=self.mock_db, plot_id=999)

    async def test_export_timeseries_csv_empty_plots(self):
        """Memastikan CSV tetap valid berisi baris header jika estate belum memiliki petak."""
        res = MagicMock()
        res.scalars.return_value.all.return_value = []
        self.mock_db.execute.return_value = res

        csv_str = await export_timeseries_csv(db=self.mock_db, estate_id=1)
        self.assertTrue(csv_str.startswith("Tanggal,Nama Petak,Divisi"))


if __name__ == "__main__":
    unittest.main()
