"""Simulation and deep audit test suite for Wave 10.

Modules covered:
1. Open-Meteo Client Resilience:
   - Rate limiting handling (HTTP 429)
   - Network timeout & connection error resilience
   - Partial/missing response fields (solar radiation 0, null wind speed, null elevation, empty/null time series)
   - Fallback ET₀ mechanics & weather condition text derivations
2. FAO-56 Penman-Monteith Evapotranspiration Numerical Audit:
   - Zero solar radiation (nighttime / heavy overcast) -> Rn < 0, ET₀ non-negative
   - Relative humidity 100% (VPD = 0, aerodynamic term = 0)
   - Zero wind speed (u₂ = 0, aerodynamic term = 0, denominator = Δ + γ)
   - Extreme winds (cyclonic/gale speeds up to 50 m/s)
   - Numerical boundary risks: absolute zero (T + 273 ≤ 0), formula singularity at T = -237.3°C
   - Extreme temperatures (-50°C to +60°C), temperature gap (Tmax - Tmin = 60°C), inverted temperatures (Tmin > Tmax)
   - Extreme elevations (stratospheric 50,000m, Dead Sea -400m), extreme latitudes (poles ±90°, equator 0°)
   - Strict immunity against NaN and Inf propagation
3. Growing Degree Days (GDD) & Phenology Simulation (Padi & Jagung):
   - Extreme cold (< 10°C, freezing < 0°C) -> GDD strictly zero, non-negative
   - Extreme heat (> 40°C) -> Jagung temperature capping (30°C) vs Padi uncapped
   - Inverted temperature observations (Tmin > Tmax)
   - Planting date variations: today (HST 0), past mature (120-150 HST), ancient (> 365 HST), future planting dates
   - Phenological stage stability: strict monotonicity, smooth stage progression, threshold boundary hits
   - Crop evapotranspiration (ETc = ET₀ × Kc) across all growth stages
4. End-to-end 120-day seasonal agrometeorological simulation pipeline
"""

from datetime import date, datetime, timedelta
import math
import sys
from typing import Any, Dict, List, Optional
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

# ---------------------------------------------------------------------
# Environment Mocks: Ensure suite runs seamlessly in headless test runner
# ---------------------------------------------------------------------
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
    "sqlalchemy.dialects", "sqlalchemy.dialects.postgresql",
    "geoalchemy2", "shapely", "pydantic_settings", "pydantic", "app.database",
]:
    if mod not in sys.modules:
        sys.modules[mod] = MagicMock()

# Setup httpx mock if httpx is not installed in the environment
try:
    import httpx
except ImportError:
    class HTTPStatusError(Exception):
        def __init__(self, message="HTTP Status Error", request=None, response=None):
            super().__init__(message)
            self.request = request
            self.response = response

    class TimeoutException(Exception):
        pass

    class ConnectError(Exception):
        pass

    class Request:
        def __init__(self, method="GET", url=""):
            self.method = method
            self.url = url

    class Response:
        def __init__(self, status_code=200, request=None, text="", json_data=None):
            self.status_code = status_code
            self.request = request
            self.text = text
            self._json_data = json_data

        def raise_for_status(self):
            if self.status_code >= 400:
                raise HTTPStatusError(f"HTTP {self.status_code}", request=self.request, response=self)

        def json(self):
            if self._json_data is not None:
                return self._json_data
            import json
            return json.loads(self.text) if self.text else {}

    class AsyncClient:
        def __init__(self, *args, **kwargs):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass
        async def get(self, *args, **kwargs):
            return Response(200)

    httpx_mock = MagicMock()
    httpx_mock.HTTPStatusError = HTTPStatusError
    httpx_mock.TimeoutException = TimeoutException
    httpx_mock.ConnectError = ConnectError
    httpx_mock.Request = Request
    httpx_mock.Response = Response
    httpx_mock.AsyncClient = AsyncClient
    sys.modules["httpx"] = httpx_mock
    httpx = httpx_mock

for mod in [
    "app.models", "app.models.estate", "app.models.weather_data",
    "app.schemas", "app.schemas.weather",
]:
    if mod not in sys.modules:
        m = MagicMock()
        for cls_name in ["Estate", "WeatherData", "WeatherCurrentResponse", "WeatherDataResponse"]:
            setattr(m, cls_name, DummyModel)
        sys.modules[mod] = m

from app.models.estate import Estate
from app.services.et0_calculator import (
    actual_vapor_pressure,
    atmospheric_pressure,
    calculate_daily_et0,
    clear_sky_solar_radiation,
    extraterrestrial_radiation,
    mean_saturation_vapor_pressure,
    net_longwave_radiation,
    net_radiation,
    net_solar_radiation,
    penman_monteith_fao56,
    psychrometric_constant,
    saturation_vapor_pressure,
    slope_vapor_pressure_curve,
    wind_speed_at_2m,
)
from app.services.gdd_service import (
    calculate_etc,
    calculate_gdd_daily,
    get_active_phase,
    predict_harvest_date,
    predict_phase,
)
from app.services.weather_service import (
    _determine_condition_text,
    fetch_weather_from_open_meteo,
    sync_weather_for_all_estates,
    sync_weather_for_estate,
)


class MockPhenologyPhase:
    """Mock object mimicking SQLAlchemy PhenologyPhase model."""

    def __init__(
        self,
        phase_code: str,
        phase_name: str,
        gdd_target: float,
        kc_value: float,
        hst_start: int = 0,
        hst_end: int = 10,
    ):
        self.phase_code = phase_code
        self.phase_name = phase_name
        self.gdd_target = gdd_target
        self.kc_value = kc_value
        self.hst_start = hst_start
        self.hst_end = hst_end


# =====================================================================
# 1. Open-Meteo Client Resilience Simulation
# =====================================================================
class TestOpenMeteoClientResilience(unittest.IsolatedAsyncioTestCase):
    """Simulates API anomalies, rate limiting, network failures, and malformed responses."""

    async def test_rate_limit_429_handling(self):
        """Simulate Open-Meteo returning HTTP 429 Too Many Requests."""
        mock_response = httpx.Response(
            status_code=429,
            request=httpx.Request("GET", "https://api.open-meteo.com/v1/forecast"),
            text="Hourly API request limit exceeded.",
        )

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response

            with self.assertRaises(httpx.HTTPStatusError) as ctx:
                await fetch_weather_from_open_meteo(latitude=-6.2, longitude=106.8)

            self.assertEqual(ctx.exception.response.status_code, 429)

    async def test_network_timeout_handling(self):
        """Simulate network timeout during Open-Meteo API call."""
        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.side_effect = httpx.TimeoutException("Connection timed out after 15.0s")

            with self.assertRaises(httpx.TimeoutException):
                await fetch_weather_from_open_meteo(latitude=-6.2, longitude=106.8, timeout_seconds=1.0)

    async def test_sync_all_estates_handles_api_exceptions_gracefully(self):
        """Verify sync_weather_for_all_estates aggregates errors without crashing when API fails."""
        mock_db = AsyncMock()
        mock_estate_1 = MagicMock(spec=Estate)
        mock_estate_1.id = 1
        mock_estate_1.name = "Kebun Riau Sentosa"
        mock_estate_1.location_point = "POINT(101.44 0.53)"

        mock_estate_2 = MagicMock(spec=Estate)
        mock_estate_2.id = 2
        mock_estate_2.name = "Kebun Sumbar Makmur"
        mock_estate_2.location_point = "POINT(100.35 -0.95)"

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [mock_estate_1, mock_estate_2]
        mock_db.execute.return_value = mock_result

        # First estate fails with 429, second succeeds with 10 records
        with patch("app.services.weather_service.sync_weather_for_estate") as mock_sync_single:
            mock_sync_single.side_effect = [
                httpx.HTTPStatusError("429 Too Many Requests", request=MagicMock(), response=MagicMock()),
                10,
            ]

            summary = await sync_weather_for_all_estates(mock_db)

            self.assertEqual(summary["status"], "partial_success")
            self.assertEqual(summary["estates_processed"], 1)
            self.assertEqual(summary["records_synced"], 10)
            self.assertEqual(len(summary["errors"]), 1)
            self.assertIn("Kebun Riau Sentosa", summary["errors"][0])

    async def test_partial_response_null_elevation_and_missing_solar(self):
        """Verify sync_weather_for_estate survives null elevation and null solar/wind metrics."""
        mock_db = AsyncMock()
        mock_estate = MagicMock(spec=Estate)
        mock_estate.id = 101
        mock_estate.name = "Kebun Test Nulls"
        mock_estate.location_point = "POINT(106.8 -6.2)"

        # Open-Meteo returns payload where elevation is null and solar radiation list contains None
        anomalous_payload = {
            "latitude": -6.2,
            "longitude": 106.8,
            "elevation": None,  # Can cause TypeError: float(None) if not guarded
            "daily": {
                "time": ["2026-09-01", "2026-09-02"],
                "temperature_2m_max": [32.0, 31.5],
                "temperature_2m_min": [23.0, 22.5],
                "relative_humidity_2m_mean": [80.0, 85.0],
                "wind_speed_10m_max": [None, 2.0],  # None wind
                "shortwave_radiation_sum": [None, 0.0],  # None solar & 0.0 solar
                "precipitation_sum": [0.0, 15.5],
                "et0_fao_evapotranspiration": [3.75, 2.90],  # Fallback provided
            },
        }

        with patch("app.services.weather_service.fetch_weather_from_open_meteo", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = anomalous_payload

            with patch("app.services.weather_service.upsert_weather_records", new_callable=AsyncMock) as mock_upsert:
                mock_upsert.return_value = 2

                count = await sync_weather_for_estate(mock_db, mock_estate)
                self.assertEqual(count, 2)

                # Verify records passed to upsert
                call_args = mock_upsert.call_args[0][1]
                self.assertGreaterEqual(len(call_args), 2)
                # Day 1 had missing wind & solar -> should use fallback ET0 = 3.75
                day1_record = call_args[0]
                self.assertEqual(day1_record["et0_mm"], 3.75)
                self.assertIsNone(day1_record["wind_speed_ms"])

    async def test_empty_or_null_daily_section(self):
        """Verify sync_weather_for_estate returns 0 safely when daily payload is empty or None."""
        mock_db = AsyncMock()
        mock_estate = MagicMock(spec=Estate)
        mock_estate.id = 102
        mock_estate.name = "Kebun Empty Daily"
        mock_estate.location_point = "POINT(106.8 -6.2)"

        # Open-Meteo returns empty daily or None daily
        for payload in [{"elevation": 15.0, "daily": None}, {"elevation": 15.0, "daily": {}}, {"daily": {"time": []}}]:
            with patch("app.services.weather_service.fetch_weather_from_open_meteo", new_callable=AsyncMock) as mock_fetch:
                mock_fetch.return_value = payload
                count = await sync_weather_for_estate(mock_db, mock_estate)
                self.assertEqual(count, 0)

    def test_condition_text_heuristic(self):
        """Test Indonesian weather condition text derivation under various rain & solar combinations."""
        # Extreme rain
        self.assertEqual(_determine_condition_text(65.0, 5.0), "Hujan Sangat Lebat")
        self.assertEqual(_determine_condition_text(25.0, 10.0), "Hujan Lebat")
        self.assertEqual(_determine_condition_text(8.0, 12.0), "Hujan Sedang")
        self.assertEqual(_determine_condition_text(2.0, 15.0), "Hujan Ringan")
        self.assertEqual(_determine_condition_text(0.2, 10.0), "Gerimis / Berawan")

        # No rain, solar variation
        self.assertEqual(_determine_condition_text(0.0, 20.0), "Cerah Terik")
        self.assertEqual(_determine_condition_text(0.0, 15.0), "Cerah Berawan")
        self.assertEqual(_determine_condition_text(0.0, 8.0), "Berawan")
        self.assertEqual(_determine_condition_text(0.0, 0.0), "Berawan")

        # Null values
        self.assertEqual(_determine_condition_text(None, None), "Cerah Berawan")


# =====================================================================
# 2. FAO-56 Penman-Monteith Evapotranspiration Numerical Audit
# =====================================================================
class TestFAO56PenmanMonteithNumericalAudit(unittest.TestCase):
    """Deep numerical audit of FAO-56 formulas under physical edge cases, extremes, and singularities."""

    def test_solar_radiation_zero_nighttime_overcast(self):
        """Audit ET₀ when solar radiation is 0.0 MJ m-2 day-1 (deep overcast or polar night).

        Net solar radiation Rns = 0, net longwave Rnl > 0, so net radiation Rn = -Rnl < 0.
        Penman-Monteith must NOT yield negative ET₀ or crash.
        """
        et0 = calculate_daily_et0(
            temp_max_c=25.0,
            temp_min_c=20.0,
            humidity_pct=80.0,
            wind_speed_ms=2.0,
            solar_radiation_mjm2=0.0,
            latitude_deg=-6.2,
            elevation_m=50.0,
            day_of_year=180,
        )
        self.assertIsNotNone(et0)
        self.assertGreaterEqual(et0, 0.0)
        self.assertFalse(math.isnan(et0))
        self.assertFalse(math.isinf(et0))

    def test_relative_humidity_100_percent_vpd_zero(self):
        """Audit ET₀ when RH = 100% (saturated atmosphere, es = ea, VPD = 0).

        Aerodynamic drying power becomes zero. ET₀ is driven purely by available radiation.
        """
        es = mean_saturation_vapor_pressure(30.0, 20.0)
        ea = actual_vapor_pressure(rh_pct=100.0, es_kpa=es)
        self.assertAlmostEqual(es, ea, places=5)

        et0 = calculate_daily_et0(
            temp_max_c=30.0,
            temp_min_c=20.0,
            humidity_pct=100.0,
            wind_speed_ms=3.0,
            solar_radiation_mjm2=18.0,
            latitude_deg=-6.2,
            elevation_m=50.0,
            day_of_year=180,
        )
        self.assertIsNotNone(et0)
        self.assertGreaterEqual(et0, 0.0)
        self.assertFalse(math.isnan(et0))

    def test_relative_humidity_zero_and_negative_clamping(self):
        """Audit ET₀ when RH is 0% or negative (sensor glitch). Must clamp to [0, 100]."""
        ea_zero = actual_vapor_pressure(rh_pct=0.0, es_kpa=2.5)
        self.assertEqual(ea_zero, 0.0)

        ea_neg = actual_vapor_pressure(rh_pct=-15.0, es_kpa=2.5)
        self.assertEqual(ea_neg, 0.0)

        ea_over = actual_vapor_pressure(rh_pct=120.0, es_kpa=2.5)
        self.assertEqual(ea_over, 2.5)

    def test_wind_speed_zero(self):
        """Audit ET₀ when wind speed is completely still (0.0 m/s).

        Aerodynamic term = 0, denominator = Δ + γ. Formula must evaluate smoothly.
        """
        u2 = wind_speed_at_2m(0.0, height_m=10.0)
        self.assertEqual(u2, 0.0)

        et0 = calculate_daily_et0(
            temp_max_c=28.0,
            temp_min_c=22.0,
            humidity_pct=75.0,
            wind_speed_ms=0.0,
            solar_radiation_mjm2=15.0,
            latitude_deg=0.0,
            elevation_m=10.0,
            day_of_year=100,
        )
        self.assertIsNotNone(et0)
        self.assertGreater(et0, 0.0)
        self.assertFalse(math.isnan(et0))

    def test_extreme_cyclonic_wind_speed(self):
        """Audit ET₀ under extreme gale / tropical storm wind speeds (e.g. 40 - 50 m/s)."""
        et0 = calculate_daily_et0(
            temp_max_c=30.0,
            temp_min_c=24.0,
            humidity_pct=60.0,
            wind_speed_ms=45.0,
            solar_radiation_mjm2=20.0,
            latitude_deg=-6.2,
            elevation_m=20.0,
            day_of_year=180,
        )
        self.assertIsNotNone(et0)
        self.assertGreater(et0, 0.0)
        self.assertFalse(math.isinf(et0))

    def test_zero_division_guard_absolute_zero(self):
        """Audit Penman-Monteith denominator and Kelvin temperature near absolute zero (-273°C)."""
        # t_mean = -273.0°C would cause division by zero in (900 / (T + 273)) if unguarded
        et0 = penman_monteith_fao56(
            net_radiation_mjm2=5.0,
            t_mean_c=-273.0,
            wind_speed_2m_ms=2.0,
            es_kpa=0.1,
            ea_kpa=0.05,
            delta_kpa_c=0.01,
            gamma_kpa_c=0.06,
        )
        self.assertFalse(math.isnan(et0))
        self.assertFalse(math.isinf(et0))
        self.assertGreaterEqual(et0, 0.0)

    def test_singularity_temperature_minus_237_3(self):
        """Audit saturation vapor pressure and curve slope at T = -237.3°C (denominator zero)."""
        e_singularity = saturation_vapor_pressure(-237.3)
        self.assertEqual(e_singularity, 0.0)

        delta_singularity = slope_vapor_pressure_curve(-237.3)
        self.assertEqual(delta_singularity, 0.0)

    def test_extreme_temperatures_and_wide_gap(self):
        """Audit ET₀ with extreme temperature range: Tmax = 55°C, Tmin = -5°C (ΔT = 60°C)."""
        et0 = calculate_daily_et0(
            temp_max_c=55.0,
            temp_min_c=-5.0,
            humidity_pct=40.0,
            wind_speed_ms=3.0,
            solar_radiation_mjm2=25.0,
            latitude_deg=10.0,
            elevation_m=100.0,
            day_of_year=150,
        )
        self.assertIsNotNone(et0)
        self.assertFalse(math.isnan(et0))
        self.assertFalse(math.isinf(et0))
        self.assertGreater(et0, 0.0)

    def test_inverted_temperatures_resilience(self):
        """Audit ET₀ when sensor swaps Tmax and Tmin (Tmax = 18°C < Tmin = 28°C)."""
        et0 = calculate_daily_et0(
            temp_max_c=18.0,
            temp_min_c=28.0,
            humidity_pct=70.0,
            wind_speed_ms=2.0,
            solar_radiation_mjm2=16.0,
            latitude_deg=0.0,
            elevation_m=50.0,
            day_of_year=200,
        )
        self.assertIsNotNone(et0)
        self.assertFalse(math.isnan(et0))
        self.assertGreater(et0, 0.0)

    def test_extreme_elevation_and_latitudes(self):
        """Audit atmospheric pressure and extraterrestrial radiation at physical extremes."""
        # Dead Sea (-400m) and Stratosphere (50,000m)
        p_dead_sea = atmospheric_pressure(-400.0)
        self.assertGreater(p_dead_sea, 100.0)

        p_stratosphere = atmospheric_pressure(50000.0)
        self.assertGreaterEqual(p_stratosphere, 0.0)
        self.assertFalse(math.isnan(p_stratosphere))

        # North & South poles (avoiding tan(90 deg) singularity)
        ra_north_pole = extraterrestrial_radiation(90.0, 180)
        self.assertGreaterEqual(ra_north_pole, 0.0)
        self.assertFalse(math.isnan(ra_north_pole))

        ra_south_pole = extraterrestrial_radiation(-90.0, 180)
        self.assertGreaterEqual(ra_south_pole, 0.0)
        self.assertFalse(math.isnan(ra_south_pole))

        # Equator
        ra_equator = extraterrestrial_radiation(0.0, 180)
        self.assertGreater(ra_equator, 25.0)

    def test_nan_and_inf_immunity(self):
        """Audit that NaN or Inf passed into calculate_daily_et0 never propagates to output."""
        nan_val = float("nan")
        inf_val = float("inf")

        # Passing NaN in temp_max
        et0_nan = calculate_daily_et0(
            temp_max_c=nan_val,
            temp_min_c=22.0,
            humidity_pct=80.0,
            wind_speed_ms=2.0,
            solar_radiation_mjm2=18.0,
            fallback_et0=4.10,
        )
        self.assertEqual(et0_nan, 4.10)

        # Passing Inf in wind speed without fallback
        et0_inf = calculate_daily_et0(
            temp_max_c=32.0,
            temp_min_c=22.0,
            humidity_pct=80.0,
            wind_speed_ms=inf_val,
            solar_radiation_mjm2=18.0,
            fallback_et0=None,
        )
        self.assertIsNone(et0_inf)

        # Penman-Monteith direct function with NaN
        et0_pm_nan = penman_monteith_fao56(
            net_radiation_mjm2=nan_val,
            t_mean_c=25.0,
            wind_speed_2m_ms=2.0,
            es_kpa=2.5,
            ea_kpa=1.5,
            delta_kpa_c=0.14,
            gamma_kpa_c=0.06,
        )
        self.assertEqual(et0_pm_nan, 0.0)


# =====================================================================
# 3. Growing Degree Days (GDD) & Phenology Phase Simulation
# =====================================================================
class TestGddAndPhenologySimulation(unittest.TestCase):
    """Simulates GDD thermal accumulation and phenological progression for Rice (Padi) and Corn (Jagung)."""

    def setUp(self):
        """Set up standard variety phases for Rice (Inpari 32) and Corn (Bisi 18)."""
        self.padi_phases = [
            {"phase_code": "P0", "phase_name": "Olah Tanah & Pembibitan", "gdd_target": 50.0, "kc_value": 1.05},
            {"phase_code": "V1", "phase_name": "Transplanting & Pemulihan", "gdd_target": 150.0, "kc_value": 1.05},
            {"phase_code": "V2", "phase_name": "Pertunasan / Anakan Aktif", "gdd_target": 450.0, "kc_value": 1.10},
            {"phase_code": "V3", "phase_name": "Inisiasi Malai (PI)", "gdd_target": 750.0, "kc_value": 1.15},
            {"phase_code": "R1", "phase_name": "Fase Bunting (Booting)", "gdd_target": 1000.0, "kc_value": 1.20},
            {"phase_code": "R2", "phase_name": "Keluar Malai (Heading)", "gdd_target": 1200.0, "kc_value": 1.20},
            {"phase_code": "R3", "phase_name": "Pengisian Bulir", "gdd_target": 1500.0, "kc_value": 1.05},
            {"phase_code": "R4", "phase_name": "Masak Fisiologis", "gdd_target": 1800.0, "kc_value": 0.90},
            {"phase_code": "P1", "phase_name": "Pasca-Panen (Harvesting)", "gdd_target": 1950.0, "kc_value": 0.50},
        ]

        self.jagung_phases = [
            {"phase_code": "VE", "phase_name": "Muncul Tunas (Emergence)", "gdd_target": 80.0, "kc_value": 0.40},
            {"phase_code": "V1-V4", "phase_name": "Pertumbuhan Vegetatif Awal", "gdd_target": 250.0, "kc_value": 0.60},
            {"phase_code": "V6-V12", "phase_name": "Vegetatif Cepat", "gdd_target": 650.0, "kc_value": 0.95},
            {"phase_code": "VT/R1", "phase_name": "Berbunga & Polinasi (Tasseling)", "gdd_target": 1050.0, "kc_value": 1.20},
            {"phase_code": "R2-R4", "phase_name": "Pengisian Biji (Dough/Dent)", "gdd_target": 1450.0, "kc_value": 1.10},
            {"phase_code": "R6", "phase_name": "Masak Fisiologis (Black Layer)", "gdd_target": 1780.0, "kc_value": 0.65},
        ]

    def test_padi_vs_jagung_gdd_extreme_heat(self):
        """Simulate hot tropical heatwave: Tmax = 44.0°C, Tmin = 28.0°C.

        Padi does not cap Tmax (Tmean = (44 + 28)/2 = 36°C -> GDD = 26.0).
        Jagung caps Tmax at 30.0°C (Tmean = (30 + 28)/2 = 29°C -> GDD = 19.0).
        """
        gdd_padi = calculate_gdd_daily(tmax=44.0, tmin=28.0, tbase=10.0, crop_type="padi")
        self.assertEqual(gdd_padi, 26.0)

        gdd_jagung = calculate_gdd_daily(tmax=44.0, tmin=28.0, tbase=10.0, crop_type="jagung")
        self.assertEqual(gdd_jagung, 19.0)
        self.assertLess(gdd_jagung, gdd_padi)

    def test_padi_vs_jagung_gdd_extreme_cold(self):
        """Simulate high-altitude cold weather: Tmax = 8.0°C, Tmin = 2.0°C (< 10°C).

        Both crops should yield 0.0 GDD, strictly non-negative.
        """
        gdd_padi = calculate_gdd_daily(tmax=8.0, tmin=2.0, tbase=10.0, crop_type="padi")
        self.assertEqual(gdd_padi, 0.0)

        gdd_jagung = calculate_gdd_daily(tmax=8.0, tmin=2.0, tbase=10.0, crop_type="jagung")
        self.assertEqual(gdd_jagung, 0.0)

    def test_gdd_freezing_and_negative_temperatures(self):
        """Simulate negative sub-zero temperatures (e.g. Tmax = -2°C, Tmin = -10°C)."""
        gdd_padi = calculate_gdd_daily(tmax=-2.0, tmin=-10.0, tbase=10.0, crop_type="padi")
        self.assertEqual(gdd_padi, 0.0)

        gdd_jagung = calculate_gdd_daily(tmax=-2.0, tmin=-10.0, tbase=10.0, crop_type="jagung")
        self.assertEqual(gdd_jagung, 0.0)

    def test_gdd_nan_and_inf_inputs(self):
        """Simulate corrupted sensor feeds containing NaN or Inf."""
        self.assertEqual(calculate_gdd_daily(float("nan"), 25.0, 10.0, "padi"), 0.0)
        self.assertEqual(calculate_gdd_daily(32.0, float("inf"), 10.0, "jagung"), 0.0)
        self.assertEqual(calculate_gdd_daily(float("nan"), float("nan"), 10.0, "padi"), 0.0)

    def test_phenological_progression_monotonicity(self):
        """Simulate continuous thermal accumulation and verify monotonic progression through all phases."""
        phase_names_seen: List[str] = []
        last_phase = None

        # Accumulate GDD from 0 to 2200 in steps of 15 °C-days
        cum_gdd = 0.0
        while cum_gdd <= 2200.0:
            current_phase = predict_phase(cum_gdd, self.padi_phases)
            self.assertIsNotNone(current_phase)

            if current_phase != last_phase:
                phase_names_seen.append(current_phase)
                last_phase = current_phase

            cum_gdd += 15.0

        # All 9 phases must have been traversed in sequence
        expected_names = [p["phase_name"] for p in self.padi_phases]
        self.assertEqual(phase_names_seen, expected_names)

    def test_phenological_exact_threshold_boundary_hits(self):
        """Verify exact matches on stage transition boundaries."""
        for phase in self.padi_phases:
            predicted = predict_phase(phase["gdd_target"], self.padi_phases)
            self.assertEqual(predicted, phase["phase_name"])

    def test_phenology_exceeded_total_gdd(self):
        """Verify GDD beyond physiological maturity stays at final harvesting stage."""
        predicted = predict_phase(3500.0, self.padi_phases)
        self.assertEqual(predicted, "Pasca-Panen (Harvesting)")

        predicted_corn = predict_phase(2500.0, self.jagung_phases)
        self.assertEqual(predicted_corn, "Masak Fisiologis (Black Layer)")

    def test_phenology_with_nan_cumulative(self):
        """Verify predict_phase and get_active_phase return None safely with NaN."""
        self.assertIsNone(predict_phase(float("nan"), self.padi_phases))
        self.assertIsNone(get_active_phase(float("nan"), self.padi_phases))

    def test_harvest_date_prediction_past_matured_plot(self):
        """Simulate plot planted 140 days ago having reached maturity (HST 140)."""
        today = date.today()
        planting = today - timedelta(days=140)

        # Target = 1950, Cumulative = 2100 -> maturity reached -> predicted harvest date is today
        pred_date = predict_harvest_date(
            planting_date=planting,
            gdd_cumulative=2100.0,
            gdd_target_total=1950.0,
            avg_daily_gdd=15.0,
        )
        self.assertEqual(pred_date, today)

    def test_harvest_date_prediction_in_progress_plot(self):
        """Simulate plot at HST 50 with 800 accumulated GDD."""
        today = date.today()
        planting = today - timedelta(days=50)

        # Target = 1950, Cumulative = 800 -> Remaining = 1150 -> 1150 / 15 ≈ 77 days left
        pred_date = predict_harvest_date(
            planting_date=planting,
            gdd_cumulative=800.0,
            gdd_target_total=1950.0,
            avg_daily_gdd=15.0,
        )
        self.assertEqual(pred_date, today + timedelta(days=77))

    def test_harvest_date_prediction_future_planting_date(self):
        """Simulate future planting date (e.g. 20 days ahead).

        Predicted harvest date must count thermal units starting from the future planting date.
        """
        today = date.today()
        future_planting = today + timedelta(days=20)

        # Target = 1950, Cumulative = 0.0 -> Days left = 1950 / 15 = 130 days from planting date
        pred_date = predict_harvest_date(
            planting_date=future_planting,
            gdd_cumulative=0.0,
            gdd_target_total=1950.0,
            avg_daily_gdd=15.0,
        )
        expected_date = future_planting + timedelta(days=130)
        self.assertEqual(pred_date, expected_date)

    def test_harvest_date_ancient_planting_date(self):
        """Simulate plot planted > 365 days ago (e.g. 400 HST). Should report maturity safely."""
        today = date.today()
        ancient_planting = today - timedelta(days=400)

        pred_date = predict_harvest_date(
            planting_date=ancient_planting,
            gdd_cumulative=6200.0,
            gdd_target_total=1950.0,
            avg_daily_gdd=15.0,
        )
        self.assertEqual(pred_date, today)

    def test_etc_crop_evapotranspiration_simulation(self):
        """Audit ETc = ET0 × Kc across stages from germination to maturity."""
        # Initial stage (Kc = 0.40, ET0 = 4.20)
        self.assertEqual(calculate_etc(4.20, 0.40), 1.68)

        # Peak vegetative / booting (Kc = 1.20, ET0 = 5.10)
        self.assertEqual(calculate_etc(5.10, 1.20), 6.12)

        # Ripening (Kc = 0.65, ET0 = 3.80)
        self.assertEqual(calculate_etc(3.80, 0.65), 2.47)

        # Missing or NaN values
        self.assertIsNone(calculate_etc(None, 1.10))
        self.assertIsNone(calculate_etc(4.50, None))
        self.assertIsNone(calculate_etc(float("nan"), 1.10))


# =====================================================================
# 4. End-to-End 120-Day Agrometeorology Pipeline Simulation
# =====================================================================
class TestEndToEndAgrometeorologyPipeline(unittest.TestCase):
    """Simulates a full 120-day cropping season under varying equatorial weather dynamics."""

    def test_full_season_padi_cycle(self):
        """Simulate day-by-day 120 days of Indonesian estate climate:

        - Temperature fluctuation (Tmax 29 - 36°C, Tmin 21 - 25°C)
        - Humidity dynamics (RH 65% - 98%)
        - Solar radiation (8.0 - 24.0 MJ/m2)
        - Wind (0.5 - 4.5 m/s)
        Verify:
        1. ET₀ is always between 2.0 and 7.0 mm/day and never NaN/Inf.
        2. Daily GDD is between 14.0 and 22.0 °C-days.
        3. Cumulative GDD strictly increases.
        4. Plot transitions through all phenological phases and completes cycle within 110-120 days.
        """
        padi_phases = [
            {"phase_code": "P0", "phase_name": "Olah Tanah & Pembibitan", "gdd_target": 50.0, "kc_value": 1.05},
            {"phase_code": "V1", "phase_name": "Transplanting & Pemulihan", "gdd_target": 150.0, "kc_value": 1.05},
            {"phase_code": "V2", "phase_name": "Pertunasan / Anakan Aktif", "gdd_target": 450.0, "kc_value": 1.10},
            {"phase_code": "V3", "phase_name": "Inisiasi Malai (PI)", "gdd_target": 750.0, "kc_value": 1.15},
            {"phase_code": "R1", "phase_name": "Fase Bunting (Booting)", "gdd_target": 1000.0, "kc_value": 1.20},
            {"phase_code": "R2", "phase_name": "Keluar Malai (Heading)", "gdd_target": 1200.0, "kc_value": 1.20},
            {"phase_code": "R3", "phase_name": "Pengisian Bulir", "gdd_target": 1500.0, "kc_value": 1.05},
            {"phase_code": "R4", "phase_name": "Masak Fisiologis", "gdd_target": 1800.0, "kc_value": 0.90},
            {"phase_code": "P1", "phase_name": "Pasca-Panen (Harvesting)", "gdd_target": 1950.0, "kc_value": 0.50},
        ]

        start_date = date(2026, 1, 1)
        cumulative_gdd = 0.0
        active_phases_traversed = []

        for day_idx in range(120):
            sim_date = start_date + timedelta(days=day_idx)
            doy = sim_date.timetuple().tm_yday

            # Pseudo-deterministic weather pattern (simulating alternating sunny & wet monsoonal days)
            wave = math.sin(day_idx / 5.0)
            tmax = 32.0 + 3.0 * wave
            tmin = 23.0 + 1.5 * math.cos(day_idx / 7.0)
            rh = 80.0 - 15.0 * wave
            solar = 18.0 + 6.0 * wave
            wind = 2.0 + 1.0 * math.sin(day_idx / 3.0)

            # 1. ET0 calculation
            et0 = calculate_daily_et0(
                temp_max_c=tmax,
                temp_min_c=tmin,
                humidity_pct=rh,
                wind_speed_ms=wind,
                solar_radiation_mjm2=solar,
                latitude_deg=0.5,
                elevation_m=25.0,
                day_of_year=doy,
            )
            self.assertIsNotNone(et0)
            self.assertGreaterEqual(et0, 2.0)
            self.assertLessEqual(et0, 7.0)
            self.assertFalse(math.isnan(et0))

            # 2. Daily GDD calculation
            daily_gdd = calculate_gdd_daily(tmax, tmin, tbase=10.0, crop_type="padi")
            self.assertGreater(daily_gdd, 14.0)
            self.assertLess(daily_gdd, 22.0)

            cumulative_gdd += daily_gdd

            # 3. Phenology tracking
            phase_name = predict_phase(cumulative_gdd, padi_phases)
            active_phase = get_active_phase(cumulative_gdd, padi_phases)
            self.assertIsNotNone(phase_name)
            self.assertIsNotNone(active_phase)

            if not active_phases_traversed or active_phases_traversed[-1] != phase_name:
                active_phases_traversed.append(phase_name)

            # 4. Crop water demand ETc
            kc = active_phase["kc_value"]
            etc = calculate_etc(et0, kc)
            self.assertIsNotNone(etc)
            self.assertGreater(etc, 1.0)
            self.assertLess(etc, 8.0)

        # Verify plot achieved maturity
        self.assertGreaterEqual(cumulative_gdd, 1950.0)
        self.assertEqual(active_phases_traversed[-1], "Pasca-Panen (Harvesting)")
        self.assertEqual(len(active_phases_traversed), len(padi_phases))


if __name__ == "__main__":
    unittest.main()
