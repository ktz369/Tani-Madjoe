"""Simulation test suite for PDF ReportLab and CSV Export Pipeline (Wave 10 / Ticket 06).

Simulates:
1. PDF generation with ReportLab:
   - Multi-page layout, portrait/landscape orientation.
   - Dynamic pagination (5 compact records vs 50+ dense records) with repeated table headers.
   - Institutional header, plot metadata profile, KPI cards, satellite telemetry table, weather summary table.
   - Robustness against non-ASCII characters, XML/HTML entities (&, <, >, ", '), emojis, and ultra-long plot names (>100 chars).
2. CSV export simulation:
   - Proper standard snake_case headers (tanggal, hst, ndvi, ndre, ndwi, savi, bsi, suhu_min, suhu_max, curah_hujan, et0).
   - UTF-8 BOM encoding for seamless Microsoft Excel compatibility.
   - Decimal number formatting and parsing validation.
3. Boundary & edge cases:
   - Plot with 0 telemetry points (must not raise 500 error / exception).
   - Microscopic plot (< 0.01 Ha) and massive plot (> 10,000 Ha).
   - Metrics average calculation when data is sparse or null (no ZeroDivisionError / TypeError).
   - High-density 1-year (365 days) time-series memory and performance stress test.
4. Estate-level reports (health, harvest prediction, water usage) with edge-case inputs.
"""

import csv
from datetime import date, datetime, timedelta, timezone
import io
import sys
import time
from typing import Any, Dict, List, Optional, Tuple, Union
import unittest
from unittest.mock import AsyncMock, MagicMock

# Mock database dependencies if running in standalone test environment
class DummyCol:
    def __init__(self, *args, **kwargs): pass
    def __call__(self, *args, **kwargs): return self
    def __ge__(self, other): return True
    def __le__(self, other): return True
    def __gt__(self, other): return True
    def __lt__(self, other): return True
    def __eq__(self, other): return True
    def __ne__(self, other): return True
    def in_(self, other): return True
    def desc(self): return self
    def asc(self): return self
    def is_(self, other): return True
    def isnot(self, other): return True
    def is_not(self, other): return True
    def __getattr__(self, name): return DummyCol()

class DummyMeta(type):
    def __getattr__(cls, name):
        return DummyCol()

class DummyModel(metaclass=DummyMeta):
    def __init__(self, *args, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)
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
    if mod not in sys.modules:
        m = MagicMock()
        for cls_name in [
            "Estate", "Division", "Plot", "CropVariety", "SpectralIndex",
            "WeatherData", "GddAccumulation", "PlantingSeason", "GeneratedReport",
            "Alert", "PhenologyPhase",
        ]:
            setattr(m, cls_name, DummyModel)
        sys.modules[mod] = m
    else:
        for cls_name in [
            "Estate", "Division", "Plot", "CropVariety", "SpectralIndex",
            "WeatherData", "GddAccumulation", "PlantingSeason", "GeneratedReport",
            "Alert", "PhenologyPhase",
        ]:
            if not hasattr(sys.modules[mod], cls_name):
                setattr(sys.modules[mod], cls_name, DummyModel)

from app.services.report_service import (
    _escape_xml,
    _format_hectares,
    export_plot_telemetry_csv,
    export_timeseries_csv,
    generate_harvest_prediction_report,
    generate_health_report,
    generate_plot_telemetry_report,
    generate_season_comparison,
    generate_water_usage_report,
)


def _build_sim_estate(
    estate_id: int = 1,
    name: str = "Kebun Percobaan Subang",
    kabupaten: str = "Subang",
    province: str = "Jawa Barat",
):
    """Factory helper to build a mock Estate."""
    estate = MagicMock()
    estate.id = estate_id
    estate.name = name
    estate.kabupaten = kabupaten
    estate.province = province
    estate.company = MagicMock()
    estate.company.name = "PT Agro Cerdas Nusantara"
    return estate


def _build_sim_plot(
    plot_id: int = 1,
    name: str = "Petak Alfa-01",
    crop_type: str = "padi",
    area_ha: float = 5.0,
    planting_date: date = date(2026, 6, 1),
    current_hst: int = 75,
    current_phase: str = "Generatif / Pengisian Bulir",
    variety_name: str = "Inpari 32 HDB",
    estate: Optional[MagicMock] = None,
):
    """Factory helper to build a mock Plot with complete relations."""
    if estate is None:
        estate = _build_sim_estate()

    division = MagicMock()
    division.id = 10
    division.name = "Divisi Tengah"
    division.estate_id = estate.id
    division.estate = estate

    phase1 = MagicMock()
    phase1.phase_name = "Vegetatif Awal"
    phase1.gdd_target = 350.0
    phase1.kc_value = 1.05

    phase2 = MagicMock()
    phase2.phase_name = "Generatif / Pengisian Bulir"
    phase2.gdd_target = 900.0
    phase2.kc_value = 1.20

    variety = MagicMock()
    variety.id = 101
    variety.name = variety_name
    variety.crop_type = crop_type
    variety.cycle_days = 115
    variety.phases = [phase1, phase2]

    plot = MagicMock()
    plot.id = plot_id
    plot.name = name
    plot.crop_type = crop_type
    plot.area_hectares = area_ha
    plot.planting_date = planting_date
    plot.current_hst = current_hst
    plot.current_phase = current_phase
    plot.division_id = division.id
    plot.division = division
    plot.variety_id = variety.id
    plot.variety = variety
    plot.alerts = []
    plot.seasons = []
    plot.gdd_records = []

    return plot, estate


def _generate_telemetry_series(plot_id: int, num_days: int, start_dt: date, sparse: bool = False):
    """Generate a series of mock SpectralIndex objects."""
    records = []
    for i in range(num_days):
        obs_date = start_dt + timedelta(days=i)
        spec = MagicMock()
        spec.plot_id = plot_id
        spec.observation_date = obs_date
        spec.satellite = "sentinel-2" if i % 2 == 0 else "sentinel-1"

        if sparse and (i % 3 == 0):
            # Simulate missing/cloud-obscured satellite values
            spec.ndvi = None
            spec.ndre = None
            spec.ndwi = None
            spec.savi = None
            spec.bsi = None
            spec.sar_vv_db = None
            spec.sar_vh_db = None
        else:
            spec.ndvi = round(0.45 + (i % 30) * 0.01, 4)
            spec.ndre = round(0.28 + (i % 20) * 0.008, 4)
            spec.ndwi = round(0.12 + (i % 15) * 0.005, 4)
            spec.savi = round(0.40 + (i % 25) * 0.009, 4)
            spec.bsi = round(-0.15 + (i % 10) * 0.01, 4)
            spec.sar_vv_db = round(-12.5 + (i % 5) * 0.5, 1)
            spec.sar_vh_db = round(-18.0 + (i % 5) * 0.4, 1)

        records.append(spec)
    return records


def _generate_weather_series(estate_id: int, num_days: int, start_dt: date, sparse: bool = False):
    """Generate a series of mock WeatherData objects."""
    records = []
    for i in range(num_days):
        obs_date = start_dt + timedelta(days=i)
        w = MagicMock()
        w.estate_id = estate_id
        w.observation_date = obs_date

        if sparse and (i % 4 == 0):
            w.temp_max_c = None
            w.temp_min_c = None
            w.rainfall_mm = None
            w.et0_mm = None
        else:
            w.temp_max_c = round(31.0 + (i % 5) * 0.6, 1)
            w.temp_min_c = round(22.5 + (i % 4) * 0.4, 1)
            w.rainfall_mm = round(0.0 if i % 3 != 0 else (5.0 + i % 15), 1)
            w.et0_mm = round(4.0 + (i % 3) * 0.25, 2)

        records.append(w)
    return records


class TestSimReportingPipeline(unittest.IsolatedAsyncioTestCase):
    """Comprehensive test suite simulating the ReportLab PDF & CSV pipeline."""

    def setUp(self):
        self.mock_db = AsyncMock()

    # =========================================================================
    # 1. PDF Generation Simulations (Portrait, Landscape, Dynamic Pagination)
    # =========================================================================

    async def test_pdf_portrait_and_landscape_generation(self):
        """Simulate generating plot telemetry report in both portrait and landscape mode."""
        plot, estate = _build_sim_plot()
        specs = _generate_telemetry_series(plot.id, num_days=10, start_dt=date(2026, 8, 1))
        weather = _generate_weather_series(estate.id, num_days=10, start_dt=date(2026, 8, 1))

        # Test Portrait
        res_plot = MagicMock()
        res_plot.scalar_one_or_none.return_value = plot
        res_spec = MagicMock()
        res_spec.scalars.return_value.all.return_value = specs
        res_weather = MagicMock()
        res_weather.scalars.return_value.all.return_value = weather

        self.mock_db.execute.side_effect = [res_plot, res_spec, res_weather]

        pdf_portrait = await generate_plot_telemetry_report(
            db=self.mock_db,
            plot_id=plot.id,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 10),
            orientation="portrait",
        )
        self.assertIsInstance(pdf_portrait, bytes)
        self.assertTrue(pdf_portrait.startswith(b"%PDF-"))
        self.assertGreater(len(pdf_portrait), 2000)

        # Test Landscape
        self.mock_db.execute.side_effect = [res_plot, res_spec, res_weather]

        pdf_landscape = await generate_plot_telemetry_report(
            db=self.mock_db,
            plot_id=plot.id,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 10),
            orientation="landscape",
        )
        self.assertIsInstance(pdf_landscape, bytes)
        self.assertTrue(pdf_landscape.startswith(b"%PDF-"))
        self.assertGreater(len(pdf_landscape), 2000)

    async def test_pdf_dynamic_pagination_5_vs_50_plus(self):
        """Simulate dynamic multi-page layout: 5 records (1-2 pages) vs 60 records (multi-page)."""
        plot, estate = _build_sim_plot()

        # Run 5 observations
        specs_5 = _generate_telemetry_series(plot.id, num_days=5, start_dt=date(2026, 8, 1))
        weather_5 = _generate_weather_series(estate.id, num_days=5, start_dt=date(2026, 8, 1))

        res_plot_5 = MagicMock()
        res_plot_5.scalar_one_or_none.return_value = plot
        res_spec_5 = MagicMock()
        res_spec_5.scalars.return_value.all.return_value = specs_5
        res_weather_5 = MagicMock()
        res_weather_5.scalars.return_value.all.return_value = weather_5

        self.mock_db.execute.side_effect = [res_plot_5, res_spec_5, res_weather_5]
        pdf_compact = await generate_plot_telemetry_report(
            db=self.mock_db,
            plot_id=plot.id,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 5),
            orientation="portrait",
        )

        # Run 60 observations (triggers multi-page pagination with repeated table headers)
        specs_60 = _generate_telemetry_series(plot.id, num_days=60, start_dt=date(2026, 7, 1))
        weather_60 = _generate_weather_series(estate.id, num_days=60, start_dt=date(2026, 7, 1))

        res_plot_60 = MagicMock()
        res_plot_60.scalar_one_or_none.return_value = plot
        res_spec_60 = MagicMock()
        res_spec_60.scalars.return_value.all.return_value = specs_60
        res_weather_60 = MagicMock()
        res_weather_60.scalars.return_value.all.return_value = weather_60

        self.mock_db.execute.side_effect = [res_plot_60, res_spec_60, res_weather_60]
        pdf_dense = await generate_plot_telemetry_report(
            db=self.mock_db,
            plot_id=plot.id,
            start_date=date(2026, 7, 1),
            end_date=date(2026, 8, 30),
            orientation="portrait",
        )

        self.assertTrue(pdf_compact.startswith(b"%PDF-"))
        self.assertTrue(pdf_dense.startswith(b"%PDF-"))
        # Dense multi-page PDF must be noticeably larger than compact 5-row PDF
        self.assertGreater(len(pdf_dense), len(pdf_compact))

    async def test_pdf_robustness_against_xml_html_entities(self):
        """Ensure plot & estate names with XML/HTML entities (&, <, >, ", ') do not crash ReportLab."""
        tricky_plot_name = 'Blok <Utama> & "Sekunder" \'A\' > B'
        tricky_estate_name = 'PT Perkebunan & Nusantara <Subang> "Jabar"'
        tricky_var_name = 'R&D Variety <Gen-4> "Super"'

        estate = _build_sim_estate(name=tricky_estate_name)
        plot, _ = _build_sim_plot(
            name=tricky_plot_name,
            variety_name=tricky_var_name,
            estate=estate,
        )
        specs = _generate_telemetry_series(plot.id, num_days=5, start_dt=date(2026, 8, 1))
        weather = _generate_weather_series(estate.id, num_days=5, start_dt=date(2026, 8, 1))

        res_plot = MagicMock()
        res_plot.scalar_one_or_none.return_value = plot
        res_spec = MagicMock()
        res_spec.scalars.return_value.all.return_value = specs
        res_weather = MagicMock()
        res_weather.scalars.return_value.all.return_value = weather

        self.mock_db.execute.side_effect = [res_plot, res_spec, res_weather]

        # Must generate cleanly without xml.parsers.expat.ExpatError or paraparser syntax error
        pdf_bytes = await generate_plot_telemetry_report(
            db=self.mock_db,
            plot_id=plot.id,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 5),
            orientation="portrait",
        )
        self.assertTrue(pdf_bytes.startswith(b"%PDF-"))

    async def test_pdf_robustness_against_emojis_and_non_ascii(self):
        """Ensure emojis (🌾, 🚜) and non-ASCII characters do not raise UnicodeEncodeError."""
        emoji_plot_name = "🌾 Petak Sawah Ciherang 🚜 🌱 Blok-10"
        estate = _build_sim_estate(name="Kebun Lembah Subang 🌾")
        plot, _ = _build_sim_plot(name=emoji_plot_name, estate=estate)
        specs = _generate_telemetry_series(plot.id, num_days=5, start_dt=date(2026, 8, 1))
        weather = _generate_weather_series(estate.id, num_days=5, start_dt=date(2026, 8, 1))

        res_plot = MagicMock()
        res_plot.scalar_one_or_none.return_value = plot
        res_spec = MagicMock()
        res_spec.scalars.return_value.all.return_value = specs
        res_weather = MagicMock()
        res_weather.scalars.return_value.all.return_value = weather

        self.mock_db.execute.side_effect = [res_plot, res_spec, res_weather]

        pdf_bytes = await generate_plot_telemetry_report(
            db=self.mock_db,
            plot_id=plot.id,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 5),
        )
        self.assertTrue(pdf_bytes.startswith(b"%PDF-"))

    async def test_pdf_robustness_against_ultra_long_plot_names(self):
        """Ensure ultra-long plot names (> 100 chars) are wrapped nicely without overflowing canvas."""
        ultra_long_name = (
            "Kawasan-Lahan-Pertanian-Terpadu-Subang-Jawa-Barat-Sektor-Utara-Plot-Percobaan-Agronomi-Unggulan-Nasional-00123"
        )
        self.assertGreater(len(ultra_long_name), 100)

        plot, estate = _build_sim_plot(name=ultra_long_name)
        specs = _generate_telemetry_series(plot.id, num_days=3, start_dt=date(2026, 8, 1))
        weather = _generate_weather_series(estate.id, num_days=3, start_dt=date(2026, 8, 1))

        res_plot = MagicMock()
        res_plot.scalar_one_or_none.return_value = plot
        res_spec = MagicMock()
        res_spec.scalars.return_value.all.return_value = specs
        res_weather = MagicMock()
        res_weather.scalars.return_value.all.return_value = weather

        self.mock_db.execute.side_effect = [res_plot, res_spec, res_weather]

        pdf_bytes = await generate_plot_telemetry_report(
            db=self.mock_db,
            plot_id=plot.id,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 3),
        )
        self.assertTrue(pdf_bytes.startswith(b"%PDF-"))

    # =========================================================================
    # 2. CSV Export Simulations (Standard Headers, UTF-8 BOM, Decimal Formatting)
    # =========================================================================

    async def test_csv_standard_headers_and_parsing_compliance(self):
        """Simulate CSV export and verify exact standard headers in snake_case."""
        plot, estate = _build_sim_plot()
        specs = _generate_telemetry_series(plot.id, num_days=5, start_dt=date(2026, 8, 1))
        weather = _generate_weather_series(estate.id, num_days=5, start_dt=date(2026, 8, 1))

        res_plot = MagicMock()
        res_plot.scalar_one_or_none.return_value = plot
        res_spec = MagicMock()
        res_spec.scalars.return_value.all.return_value = specs
        res_weather = MagicMock()
        res_weather.scalars.return_value.all.return_value = weather

        self.mock_db.execute.side_effect = [res_plot, res_spec, res_weather]

        csv_str = await export_plot_telemetry_csv(
            db=self.mock_db,
            plot_id=plot.id,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 5),
            include_bom=True,
        )

        # 1. Verify UTF-8 BOM prefix
        self.assertTrue(csv_str.startswith("\ufeff"))
        raw_content = csv_str.lstrip("\ufeff")

        # 2. Parse using standard csv.reader
        reader = csv.reader(io.StringIO(raw_content))
        headers = next(reader)
        expected_headers = [
            "tanggal", "hst", "ndvi", "ndre", "ndwi", "savi", "bsi",
            "suhu_min", "suhu_max", "curah_hujan", "et0",
        ]
        self.assertEqual(headers, expected_headers)

        # 3. Verify data rows
        rows = list(reader)
        self.assertEqual(len(rows), 5)
        for r in rows:
            self.assertEqual(len(r), 11)
            # Tanggal ISO format
            obs_dt = date.fromisoformat(r[0])
            self.assertGreaterEqual(obs_dt, date(2026, 8, 1))
            # HST numeric
            self.assertTrue(r[1].isdigit())

    async def test_csv_utf8_bom_encoding_for_excel(self):
        """Verify that encoding CSV string with utf-8 preserves BOM bytes 0xEF 0xBB 0xBF."""
        plot, estate = _build_sim_plot()
        specs = _generate_telemetry_series(plot.id, num_days=2, start_dt=date(2026, 8, 1))
        weather = _generate_weather_series(estate.id, num_days=2, start_dt=date(2026, 8, 1))

        res_plot = MagicMock()
        res_plot.scalar_one_or_none.return_value = plot
        res_spec = MagicMock()
        res_spec.scalars.return_value.all.return_value = specs
        res_weather = MagicMock()
        res_weather.scalars.return_value.all.return_value = weather

        self.mock_db.execute.side_effect = [res_plot, res_spec, res_weather]

        csv_str = await export_plot_telemetry_csv(
            db=self.mock_db,
            plot_id=plot.id,
            include_bom=True,
        )

        csv_bytes = csv_str.encode("utf-8")
        # Standard UTF-8 BOM sequence: \xEF\xBB\xBF
        self.assertEqual(csv_bytes[:3], b"\xef\xbb\xbf")

    async def test_csv_decimal_number_formatting(self):
        """Verify decimal precision: 4 decimals for indices, 1 for temp/rain, 2 for ET0."""
        plot, estate = _build_sim_plot()
        spec = MagicMock()
        spec.plot_id = plot.id
        spec.observation_date = date(2026, 8, 15)
        spec.ndvi = 0.74238
        spec.ndre = 0.35129
        spec.ndwi = 0.18001
        spec.savi = 0.62114
        spec.bsi = -0.12345

        weather = MagicMock()
        weather.estate_id = estate.id
        weather.observation_date = date(2026, 8, 15)
        weather.temp_min_c = 23.456
        weather.temp_max_c = 33.789
        weather.rainfall_mm = 12.34
        weather.et0_mm = 4.567

        res_plot = MagicMock()
        res_plot.scalar_one_or_none.return_value = plot
        res_spec = MagicMock()
        res_spec.scalars.return_value.all.return_value = [spec]
        res_weather = MagicMock()
        res_weather.scalars.return_value.all.return_value = [weather]

        self.mock_db.execute.side_effect = [res_plot, res_spec, res_weather]

        csv_str = await export_plot_telemetry_csv(
            db=self.mock_db,
            plot_id=plot.id,
            start_date=date(2026, 8, 15),
            end_date=date(2026, 8, 15),
            include_bom=False,
        )

        reader = csv.reader(io.StringIO(csv_str))
        _ = next(reader)  # Header
        row = next(reader)

        self.assertEqual(row[2], "0.7424")  # NDVI (4 decimals)
        self.assertEqual(row[3], "0.3513")  # NDRE (4 decimals)
        self.assertEqual(row[4], "0.1800")  # NDWI (4 decimals)
        self.assertEqual(row[5], "0.6211")  # SAVI (4 decimals)
        self.assertEqual(row[6], "-0.1235") # BSI (4 decimals)
        self.assertEqual(row[7], "23.5")    # suhu_min (1 decimal)
        self.assertEqual(row[8], "33.8")    # suhu_max (1 decimal)
        self.assertEqual(row[9], "12.3")    # curah_hujan (1 decimal)
        self.assertEqual(row[10], "4.57")   # et0 (2 decimals)

    # =========================================================================
    # 3. Boundary & Edge Cases (0 Telemetry, Microscopic/Massive, Sparse/Null)
    # =========================================================================

    async def test_zero_telemetry_points_pdf_and_csv(self):
        """Ensure plot with 0 telemetry points does not raise 500 error in PDF or CSV."""
        plot, estate = _build_sim_plot()

        res_plot = MagicMock()
        res_plot.scalar_one_or_none.return_value = plot
        res_spec = MagicMock()
        res_spec.scalars.return_value.all.return_value = []
        res_weather = MagicMock()
        res_weather.scalars.return_value.all.return_value = []

        # 1. PDF generation with 0 telemetry
        self.mock_db.execute.side_effect = [res_plot, res_spec, res_weather]
        pdf_bytes = await generate_plot_telemetry_report(
            db=self.mock_db,
            plot_id=plot.id,
        )
        self.assertIsInstance(pdf_bytes, bytes)
        self.assertTrue(pdf_bytes.startswith(b"%PDF-"))

        # 2. CSV export with 0 telemetry
        self.mock_db.execute.side_effect = [res_plot, res_spec, res_weather]
        csv_str = await export_plot_telemetry_csv(
            db=self.mock_db,
            plot_id=plot.id,
            include_bom=False,
        )
        reader = csv.reader(io.StringIO(csv_str))
        headers = next(reader)
        self.assertEqual(headers[0], "tanggal")
        self.assertEqual(len(list(reader)), 0)  # Empty data rows, valid header

    async def test_microscopic_and_massive_plot_area(self):
        """Ensure microscopic (<0.01 Ha) and massive (>10,000 Ha) plots format gracefully."""
        # Helper unit test for _format_hectares
        self.assertEqual(_format_hectares(0.0042), "0.0042 Ha")
        self.assertEqual(_format_hectares(0.008), "0.0080 Ha")
        self.assertEqual(_format_hectares(0.75), "0.75 Ha")
        self.assertEqual(_format_hectares(12500.5), "12,500.5 Ha")
        self.assertEqual(_format_hectares(0.0), "0.0 Ha")
        self.assertEqual(_format_hectares(None), "0.0 Ha")

        # Microscopic plot in PDF
        plot_micro, estate = _build_sim_plot(area_ha=0.006)
        res_plot_micro = MagicMock()
        res_plot_micro.scalar_one_or_none.return_value = plot_micro
        res_spec_empty = MagicMock()
        res_spec_empty.scalars.return_value.all.return_value = []
        res_weather_empty = MagicMock()
        res_weather_empty.scalars.return_value.all.return_value = []

        self.mock_db.execute.side_effect = [res_plot_micro, res_spec_empty, res_weather_empty]
        pdf_micro = await generate_plot_telemetry_report(
            db=self.mock_db,
            plot_id=plot_micro.id,
        )
        self.assertTrue(pdf_micro.startswith(b"%PDF-"))

        # Massive plot in PDF
        plot_mass, _ = _build_sim_plot(area_ha=15820.4)
        res_plot_mass = MagicMock()
        res_plot_mass.scalar_one_or_none.return_value = plot_mass

        self.mock_db.execute.side_effect = [res_plot_mass, res_spec_empty, res_weather_empty]
        pdf_mass = await generate_plot_telemetry_report(
            db=self.mock_db,
            plot_id=plot_mass.id,
        )
        self.assertTrue(pdf_mass.startswith(b"%PDF-"))

    async def test_sparse_and_null_metrics_average_calculation(self):
        """Ensure sparse and null data do not cause ZeroDivisionError or formatting crash."""
        plot, estate = _build_sim_plot()
        specs = _generate_telemetry_series(plot.id, num_days=10, start_dt=date(2026, 8, 1), sparse=True)
        weather = _generate_weather_series(estate.id, num_days=10, start_dt=date(2026, 8, 1), sparse=True)

        res_plot = MagicMock()
        res_plot.scalar_one_or_none.return_value = plot
        res_spec = MagicMock()
        res_spec.scalars.return_value.all.return_value = specs
        res_weather = MagicMock()
        res_weather.scalars.return_value.all.return_value = weather

        self.mock_db.execute.side_effect = [res_plot, res_spec, res_weather]

        pdf_bytes = await generate_plot_telemetry_report(
            db=self.mock_db,
            plot_id=plot.id,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 10),
        )
        self.assertTrue(pdf_bytes.startswith(b"%PDF-"))

        # In CSV export
        self.mock_db.execute.side_effect = [res_plot, res_spec, res_weather]
        csv_str = await export_plot_telemetry_csv(
            db=self.mock_db,
            plot_id=plot.id,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 10),
            include_bom=False,
        )
        reader = csv.reader(io.StringIO(csv_str))
        headers = next(reader)
        rows = list(reader)
        self.assertEqual(len(rows), 10)
        # Sparse rows should have empty strings for missing indices, not 'None'
        has_empty_cell = any(r[2] == "" for r in rows)
        self.assertTrue(has_empty_cell)

    async def test_high_density_1_year_timeseries_performance(self):
        """Stress test: 365 days of continuous satellite & weather observations."""
        plot, estate = _build_sim_plot()
        # 365 daily observations
        specs_365 = _generate_telemetry_series(plot.id, num_days=365, start_dt=date(2025, 9, 1))
        weather_365 = _generate_weather_series(estate.id, num_days=365, start_dt=date(2025, 9, 1))

        res_plot = MagicMock()
        res_plot.scalar_one_or_none.return_value = plot
        res_spec = MagicMock()
        res_spec.scalars.return_value.all.return_value = specs_365
        res_weather = MagicMock()
        res_weather.scalars.return_value.all.return_value = weather_365

        # Measure CSV export performance
        self.mock_db.execute.side_effect = [res_plot, res_spec, res_weather]
        t0 = time.perf_counter()
        csv_str = await export_plot_telemetry_csv(
            db=self.mock_db,
            plot_id=plot.id,
            start_date=date(2025, 9, 1),
            end_date=date(2026, 8, 31),
        )
        t_csv = time.perf_counter() - t0
        self.assertLess(t_csv, 2.0, "CSV export of 365 days should take < 2.0s")
        self.assertGreater(len(csv_str), 10000)

        # Measure PDF generation performance
        self.mock_db.execute.side_effect = [res_plot, res_spec, res_weather]
        t0 = time.perf_counter()
        pdf_bytes = await generate_plot_telemetry_report(
            db=self.mock_db,
            plot_id=plot.id,
            start_date=date(2025, 9, 1),
            end_date=date(2026, 8, 31),
            orientation="landscape",
        )
        t_pdf = time.perf_counter() - t0
        self.assertLess(t_pdf, 5.0, "PDF generation of 365 records should take < 5.0s")
        self.assertTrue(pdf_bytes.startswith(b"%PDF-"))

    # =========================================================================
    # 4. Estate Health, Harvest Prediction & Water Usage Edge Case Tests
    # =========================================================================

    async def test_estate_health_report_empty_and_special_chars(self):
        """Simulate health report with zero plots and special XML entities in estate name."""
        estate = _build_sim_estate(name="PT Perkebunan Subang & Rekan <Lahan 1>")
        res_estate = MagicMock()
        res_estate.scalar_one_or_none.return_value = estate
        res_plots = MagicMock()
        res_plots.scalars.return_value.all.return_value = []

        self.mock_db.execute.side_effect = [res_estate, res_plots]

        pdf_bytes = await generate_health_report(
            db=self.mock_db,
            estate_id=estate.id,
        )
        self.assertTrue(pdf_bytes.startswith(b"%PDF-"))

    async def test_estate_harvest_prediction_empty_and_special_chars(self):
        """Simulate harvest prediction report with zero plots and special XML characters."""
        estate = _build_sim_estate(name='Kebun "Sentosa" & Mitra <A>')
        res_estate = MagicMock()
        res_estate.scalar_one_or_none.return_value = estate
        res_plots = MagicMock()
        res_plots.scalars.return_value.all.return_value = []

        self.mock_db.execute.side_effect = [res_estate, res_plots]

        pdf_bytes = await generate_harvest_prediction_report(
            db=self.mock_db,
            estate_id=estate.id,
        )
        self.assertTrue(pdf_bytes.startswith(b"%PDF-"))

    async def test_estate_water_usage_report_empty_and_special_chars(self):
        """Simulate water usage report with zero plots and special characters."""
        estate = _build_sim_estate(name="Kebun & Irigasi <Tirta>")
        res_estate = MagicMock()
        res_estate.scalar_one_or_none.return_value = estate
        res_weather = MagicMock()
        res_weather.scalars.return_value.all.return_value = []
        res_plots = MagicMock()
        res_plots.scalars.return_value.all.return_value = []

        self.mock_db.execute.side_effect = [res_estate, res_weather, res_plots]

        pdf_bytes = await generate_water_usage_report(
            db=self.mock_db,
            estate_id=estate.id,
        )
        self.assertTrue(pdf_bytes.startswith(b"%PDF-"))


if __name__ == "__main__":
    unittest.main()
