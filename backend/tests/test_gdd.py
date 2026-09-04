"""Unit tests for Growing Degree Days (GDD) calculator, phenology prediction, and crop water demand (ETc).

Tests cover:
1. Padi GDD calculation (standard thermal calculation without capping, edge cases with None).
2. Jagung GDD calculation (temperature capping Tmax <= 30°C, Tmin >= 10°C).
3. Phenology growth phase prediction (dict & object support, ordered GDD target lookup, exceeded threshold).
4. Physiological harvest date prediction (remaining GDD, daily thermal accumulation rate).
5. Crop evapotranspiration (ETc = ET0 × Kc) calculation and rounding.
"""

from datetime import date, timedelta
import unittest

from app.services.gdd_service import (
    calculate_etc,
    calculate_gdd_daily,
    get_active_phase,
    predict_harvest_date,
    predict_phase,
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


class TestGddCalculator(unittest.TestCase):
    """Test suite for daily GDD calculation, phenology phase, and ETc."""

    # -------------------------------------------------------------
    # 1. Padi GDD Calculations
    # -------------------------------------------------------------

    def test_calculate_gdd_daily_padi_normal(self):
        """Test daily GDD calculation for padi under typical tropical temperatures."""
        # Tmax = 32.0°C, Tmin = 24.0°C, Tbase = 10.0°C
        # Tmean = (32 + 24) / 2 = 28.0°C
        # GDD = 28.0 - 10.0 = 18.0
        gdd = calculate_gdd_daily(tmax=32.0, tmin=24.0, tbase=10.0, crop_type="padi")
        self.assertEqual(gdd, 18.0)

    def test_calculate_gdd_daily_padi_below_tbase(self):
        """Test daily GDD when average temperature is below base temperature."""
        # Tmax = 12.0°C, Tmin = 6.0°C -> Tmean = 9.0°C < 10.0°C -> GDD = 0.0
        gdd = calculate_gdd_daily(tmax=12.0, tmin=6.0, tbase=10.0, crop_type="padi")
        self.assertEqual(gdd, 0.0)

    def test_calculate_gdd_daily_padi_custom_tbase(self):
        """Test daily GDD with custom base temperature."""
        # Tmax = 30.0, Tmin = 20.0 -> Tmean = 25.0, Tbase = 12.0 -> GDD = 13.0
        gdd = calculate_gdd_daily(tmax=30.0, tmin=20.0, tbase=12.0, crop_type="padi")
        self.assertEqual(gdd, 13.0)

    def test_calculate_gdd_daily_none_inputs(self):
        """Test daily GDD returns 0.0 when temperature observations are None."""
        self.assertEqual(calculate_gdd_daily(None, 24.0, 10.0, "padi"), 0.0)
        self.assertEqual(calculate_gdd_daily(32.0, None, 10.0, "padi"), 0.0)
        self.assertEqual(calculate_gdd_daily(None, None, 10.0, "padi"), 0.0)

    # -------------------------------------------------------------
    # 2. Jagung GDD Calculations (Temperature Capping)
    # -------------------------------------------------------------

    def test_calculate_gdd_daily_jagung_capping_max(self):
        """Test jagung GDD capping when Tmax exceeds 30.0°C."""
        # Tmax = 35.0°C (capped to 30.0), Tmin = 22.0°C
        # Tmean = (30.0 + 22.0) / 2 = 26.0°C
        # GDD = 26.0 - 10.0 = 16.0
        gdd = calculate_gdd_daily(tmax=35.0, tmin=22.0, tbase=10.0, crop_type="jagung")
        self.assertEqual(gdd, 16.0)

        # Contrast with padi under same temperatures:
        # Padi Tmean = (35.0 + 22.0) / 2 = 28.5 -> GDD = 18.5
        gdd_padi = calculate_gdd_daily(tmax=35.0, tmin=22.0, tbase=10.0, crop_type="padi")
        self.assertEqual(gdd_padi, 18.5)

    def test_calculate_gdd_daily_jagung_capping_min(self):
        """Test jagung GDD capping when Tmin is below 10.0°C."""
        # Tmax = 28.0°C, Tmin = 6.0°C (floored to 10.0)
        # Tmean = (28.0 + 10.0) / 2 = 19.0°C
        # GDD = 19.0 - 10.0 = 9.0
        gdd = calculate_gdd_daily(tmax=28.0, tmin=6.0, tbase=10.0, crop_type="jagung")
        self.assertEqual(gdd, 9.0)

    def test_calculate_gdd_daily_jagung_both_capped(self):
        """Test jagung GDD when both Tmax > 30 and Tmin < 10."""
        # Tmax = 36.0 (capped to 30.0), Tmin = 8.0 (floored to 10.0)
        # Tmean = (30.0 + 10.0) / 2 = 20.0°C
        # GDD = 20.0 - 10.0 = 10.0
        gdd = calculate_gdd_daily(tmax=36.0, tmin=8.0, tbase=10.0, crop_type="jagung")
        self.assertEqual(gdd, 10.0)

    def test_calculate_gdd_daily_jagung_extreme_cold(self):
        """Test jagung GDD when Tmax is also below 10.0°C."""
        # Tmax = 8.0 (floored to 10.0), Tmin = 4.0 (floored to 10.0)
        # Tmean = (10.0 + 10.0) / 2 = 10.0
        # GDD = max(0.0, 10.0 - 10.0) = 0.0
        gdd = calculate_gdd_daily(tmax=8.0, tmin=4.0, tbase=10.0, crop_type="jagung")
        self.assertEqual(gdd, 0.0)

    # -------------------------------------------------------------
    # 3. Phenology Growth Phase Prediction
    # -------------------------------------------------------------

    def setUp(self):
        """Set up standard variety phases for testing."""
        self.inpari_32_phases = [
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

    def test_predict_phase_dict_structure(self):
        """Test phase prediction using dictionary list."""
        # GDD = 30.0 -> P0 (target 50.0)
        self.assertEqual(predict_phase(30.0, self.inpari_32_phases), "Olah Tanah & Pembibitan")

        # GDD = 120.0 -> V1 (target 150.0)
        self.assertEqual(predict_phase(120.0, self.inpari_32_phases), "Transplanting & Pemulihan")

        # GDD = 450.0 -> exact match V2
        self.assertEqual(predict_phase(450.0, self.inpari_32_phases), "Pertunasan / Anakan Aktif")

        # GDD = 900.0 -> R1 (target 1000.0)
        self.assertEqual(predict_phase(900.0, self.inpari_32_phases), "Fase Bunting (Booting)")

        # GDD = 1750.0 -> R4 (target 1800.0)
        self.assertEqual(predict_phase(1750.0, self.inpari_32_phases), "Masak Fisiologis")

    def test_predict_phase_exceeds_total_target(self):
        """Test phase prediction when cumulative GDD exceeds total cycle target."""
        # Cumulative = 2100.0 > 1950.0 -> returns last phase P1
        self.assertEqual(predict_phase(2100.0, self.inpari_32_phases), "Pasca-Panen (Harvesting)")

    def test_predict_phase_object_structure(self):
        """Test phase prediction using ORM-like objects."""
        obj_phases = [
            MockPhenologyPhase("VE-V2", "Muncul Tunas", 180.0, 0.40),
            MockPhenologyPhase("V3-V5", "Fase Daun ke-3 s.d ke-5", 380.0, 0.60),
            MockPhenologyPhase("VT/R1", "Berbunga (Tasseling)", 1100.0, 1.15),
            MockPhenologyPhase("R5-R6", "Masak Fisiologis", 1650.0, 0.70),
        ]

        self.assertEqual(predict_phase(150.0, obj_phases), "Muncul Tunas")
        self.assertEqual(predict_phase(350.0, obj_phases), "Fase Daun ke-3 s.d ke-5")
        self.assertEqual(predict_phase(800.0, obj_phases), "Berbunga (Tasseling)")
        self.assertEqual(predict_phase(2000.0, obj_phases), "Masak Fisiologis")

    def test_predict_phase_empty(self):
        """Test predict_phase with empty list returns None."""
        self.assertIsNone(predict_phase(500.0, []))
        self.assertIsNone(predict_phase(500.0, None))

    def test_get_active_phase(self):
        """Test retrieving the active phase item to inspect kc_value."""
        active = get_active_phase(900.0, self.inpari_32_phases)
        self.assertIsNotNone(active)
        self.assertEqual(active["phase_code"], "R1")
        self.assertEqual(active["kc_value"], 1.20)

    # -------------------------------------------------------------
    # 4. Harvest Date Prediction
    # -------------------------------------------------------------

    def test_predict_harvest_date_normal(self):
        """Test predicting harvest date based on remaining thermal units."""
        today = date.today()
        # Cumulative = 1500.0, Target = 1950.0 -> Remaining = 450.0
        # Avg daily GDD = 15.0 -> Remaining days = 450 / 15 = 30 days
        predicted = predict_harvest_date(
            planting_date=today - timedelta(days=60),
            gdd_cumulative=1500.0,
            gdd_target_total=1950.0,
            avg_daily_gdd=15.0,
        )
        self.assertEqual(predicted, today + timedelta(days=30))

    def test_predict_harvest_date_already_mature(self):
        """Test predicting harvest date when cumulative GDD >= target total."""
        today = date.today()
        # Cumulative 2000 >= 1950 -> Remaining days = 0 -> predicted = today
        predicted = predict_harvest_date(
            planting_date=today - timedelta(days=120),
            gdd_cumulative=2000.0,
            gdd_target_total=1950.0,
            avg_daily_gdd=15.0,
        )
        self.assertEqual(predicted, today)

    def test_predict_harvest_date_invalid_target(self):
        """Test predicting harvest date when target is 0 or None."""
        self.assertIsNone(predict_harvest_date(date.today(), 500.0, 0.0))
        self.assertIsNone(predict_harvest_date(date.today(), 500.0, None))

    # -------------------------------------------------------------
    # 5. ETc Calculation (ET0 × Kc)
    # -------------------------------------------------------------

    def test_calculate_etc(self):
        """Test ETc equation and rounding."""
        # ET0 = 4.25 mm/day, Kc = 1.15 -> ETc = 4.8875 -> 4.89 mm/day
        self.assertEqual(calculate_etc(4.25, 1.15), 4.89)

        # ET0 = 3.80 mm/day, Kc = 0.50 -> ETc = 1.90 mm/day
        self.assertEqual(calculate_etc(3.80, 0.50), 1.90)

        # Zero evapotranspiration
        self.assertEqual(calculate_etc(0.0, 1.20), 0.0)

    def test_calculate_etc_none_handling(self):
        """Test calculate_etc handles None gracefully."""
        self.assertIsNone(calculate_etc(None, 1.15))
        self.assertIsNone(calculate_etc(4.25, None))
        self.assertIsNone(calculate_etc(None, None))


if __name__ == "__main__":
    unittest.main()
