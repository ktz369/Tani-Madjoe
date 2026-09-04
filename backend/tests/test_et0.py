"""Unit tests for FAO-56 Penman-Monteith Reference Evapotranspiration (ET₀) Calculator.

Validates calculations against reference values from FAO Irrigation and Drainage Paper No. 56
(including Example 18: Determination of ET₀ with daily data).
"""

import math
import unittest
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


class TestET0Calculator(unittest.TestCase):
    """Test suite for FAO-56 Penman-Monteith equations."""

    def test_atmospheric_pressure_and_gamma(self):
        """Test atmospheric pressure and psychrometric constant against FAO-56 Table 2.2."""
        # Sea level (z = 0 m)
        p_sea = atmospheric_pressure(0.0)
        self.assertAlmostEqual(p_sea, 101.3, places=1)
        gamma_sea = psychrometric_constant(p_sea)
        self.assertAlmostEqual(gamma_sea, 0.067, places=2)

        # Elevation 1200 m (as in Example 18)
        p_1200 = atmospheric_pressure(1200.0)
        # FAO-56 Eq. 7 gives ~87.9 kPa
        self.assertAlmostEqual(p_1200, 87.9, delta=0.5)
        gamma_1200 = psychrometric_constant(p_1200)
        self.assertAlmostEqual(gamma_1200, 0.058, places=2)

    def test_vapor_pressure_and_slope(self):
        """Test saturation vapor pressure, actual vapor pressure, and delta slope."""
        # Tmax = 24.5 °C -> e°(24.5) ≈ 3.075 kPa
        e_max = saturation_vapor_pressure(24.5)
        self.assertAlmostEqual(e_max, 3.075, delta=0.02)

        # Tmin = 15.0 °C -> e°(15.0) ≈ 1.705 kPa
        e_min = saturation_vapor_pressure(15.0)
        self.assertAlmostEqual(e_min, 1.705, delta=0.02)

        # es = (e_max + e_min) / 2 ≈ 2.39 kPa
        es = mean_saturation_vapor_pressure(24.5, 15.0)
        self.assertAlmostEqual(es, 2.39, delta=0.02)

        # Tmean = 19.75 °C -> delta ≈ 0.143 kPa / °C
        t_mean = (24.5 + 15.0) / 2.0
        delta = slope_vapor_pressure_curve(t_mean)
        self.assertAlmostEqual(delta, 0.143, places=2)

        # RHmax = 76%, RHmin = 34% -> ea ≈ 1.17 kPa
        ea = actual_vapor_pressure(
            rh_pct=55.0,
            es_kpa=es,
            rh_min_pct=34.0,
            rh_max_pct=76.0,
            temp_max_c=24.5,
            temp_min_c=15.0,
        )
        self.assertAlmostEqual(ea, 1.17, delta=0.02)

    def test_wind_speed_height_adjustment(self):
        """Test wind speed conversion from 10 m to 2 m using logarithmic profile."""
        # At 2m height, wind speed should remain unchanged
        u2 = wind_speed_at_2m(2.0, height_m=2.0)
        self.assertAlmostEqual(u2, 2.0, places=4)

        # At 10m height, factor is 4.87 / ln(678 - 5.42) ≈ 4.87 / 6.5118 ≈ 0.748
        u10 = 3.0
        u2_from_10 = wind_speed_at_2m(u10, height_m=10.0)
        self.assertAlmostEqual(u2_from_10, 3.0 * 0.748, delta=0.05)

    def test_fao56_example18_direct_formula(self):
        """Test core Penman-Monteith equation directly with FAO-56 Example 18 intermediate values.

        Values from FAO-56 Paper 56:
        Rn = 10.13 MJ m-2 day-1
        Tmean = 19.75 °C
        u2 = 2.0 m/s
        es = 2.39 kPa
        ea = 1.17 kPa
        delta = 0.143 kPa/°C
        gamma = 0.058 kPa/°C
        Expected ET₀ ≈ 4.27 mm/day (rounded to 4.3 mm/day)
        """
        et0 = penman_monteith_fao56(
            net_radiation_mjm2=10.13,
            t_mean_c=19.75,
            wind_speed_2m_ms=2.0,
            es_kpa=2.39,
            ea_kpa=1.17,
            delta_kpa_c=0.143,
            gamma_kpa_c=0.058,
            soil_heat_flux_mjm2=0.0,
        )
        self.assertAlmostEqual(et0, 4.27, delta=0.1)
        self.assertEqual(round(et0, 1), 4.3)

    def test_fao56_example18_full_pipeline(self):
        """Test complete calculate_daily_et0 pipeline against FAO-56 Example 18."""
        et0 = calculate_daily_et0(
            temp_max_c=24.5,
            temp_min_c=15.0,
            humidity_pct=55.0,  # Mean RH
            wind_speed_ms=2.0,
            solar_radiation_mjm2=22.0,
            latitude_deg=-16.22,
            elevation_m=1200.0,
            day_of_year=196,
            wind_height_m=2.0,
        )
        self.assertIsNotNone(et0)
        # Expected ET₀ is between 4.1 and 4.4 mm/day (~4.27 mm/day)
        self.assertAlmostEqual(et0, 4.27, delta=0.2)

    def test_tropical_estate_conditions(self):
        """Test ET₀ calculation for Indonesian equatorial estate climate (Riau / Sumatra)."""
        et0 = calculate_daily_et0(
            temp_max_c=32.5,
            temp_min_c=23.0,
            humidity_pct=82.0,
            wind_speed_ms=2.5,  # Measured at 10m
            solar_radiation_mjm2=19.5,
            latitude_deg=0.5,
            elevation_m=30.0,
            observation_date="2026-09-04",
            wind_height_m=10.0,
        )
        self.assertIsNotNone(et0)
        # Tropical conditions in Indonesia generally yield ET₀ between 3.0 and 5.5 mm/day
        self.assertGreaterEqual(et0, 3.0)
        self.assertLessEqual(et0, 6.0)

    def test_fallback_when_inputs_missing(self):
        """Test fallback behavior when meteorological inputs are incomplete."""
        # Missing solar radiation and temperature -> should return fallback_et0
        et0_fallback = calculate_daily_et0(
            temp_max_c=None,
            temp_min_c=None,
            humidity_pct=None,
            wind_speed_ms=None,
            solar_radiation_mjm2=None,
            fallback_et0=4.15,
        )
        self.assertEqual(et0_fallback, 4.15)

        # Missing inputs and no fallback -> should return None
        et0_none = calculate_daily_et0(
            temp_max_c=None,
            temp_min_c=None,
            humidity_pct=None,
            wind_speed_ms=None,
            solar_radiation_mjm2=None,
            fallback_et0=None,
        )
        self.assertIsNone(et0_none)


if __name__ == "__main__":
    unittest.main()
