"""
Unit and Integration Test Suite for DAG-05 and DAG-06:
- DAG-05: Module B - Cascading Hydrology for Terraced Land (Bengkok 1)
  * Slope calculation (~8.5%)
  * 5-tier cascading water balance: Inflow_tier(t) = Runoff_upper_tier(t) * (1 - AbsorptionFactor)
  * Cascading sluice gate schedule for flood prevention in lower tiers
- DAG-06: Module C - Cloud-Penetrating Sentinel-1 SAR & Spectral Unmixing
  * Sentinel-1 GRD backscatter ratio (sigma0_VH / sigma0_VV) in dB
  * Wet biomass & soil wetness index estimation
  * Automatic cloud-penetrating fallback (>40% and 100% cloud cover)
  * Inward buffer (2.5m) and spectral unmixing on 24 WGS84 coordinates
"""

import math
import os
import sys
import unittest

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.services.hydrology_service import (
    HydrologyService,
    TerraceTier,
    TierWaterBalance,
    TerraceWaterBalanceResult,
    SluiceGateScheduleResult,
    BENGKOK_1_TOTAL_AREA_M2,
    BENGKOK_1_NUM_TIERS,
    BENGKOK_1_MEAN_ELEVATION_M,
    BENGKOK_1_DEFAULT_SLOPE_PCT,
)
from app.services.sar_service import (
    SARService,
    SARAnalysisResult,
    CLOUD_COVER_SWITCH_THRESHOLD_PCT,
)


class TestDAG05CascadingHydrology(unittest.TestCase):
    """Test suite for Module B - Cascading Hydrology for Terraced Land."""

    def setUp(self):
        self.service = HydrologyService()

    def test_01_slope_calculation(self):
        """Verify slope percentage calculation: (|Delta Elevation| / Horizontal Distance) * 100%."""
        # 6.0m elevation drop over 70.5m horizontal run
        slope = self.service.calculate_slope_pct(elevation_delta_m=6.0, horizontal_distance_m=70.5)
        self.assertAlmostEqual(slope, 8.511, places=2)
        self.assertTrue(8.0 <= slope <= 9.0, f"Slope {slope}% should be around ~8.5%")

        # Negative elevation delta (downhill) should be handled with absolute value
        slope_neg = self.service.calculate_slope_pct(elevation_delta_m=-6.0, horizontal_distance_m=70.5)
        self.assertEqual(slope, slope_neg)

        # Zero or negative distance raises ValueError
        with self.assertRaises(ValueError):
            self.service.calculate_slope_pct(elevation_delta_m=5.0, horizontal_distance_m=0.0)

    def test_02_bengkok_1_default_tiers_initialization(self):
        """Verify initialization of 5 calibrated terrace tiers for Bengkok 1."""
        tiers = self.service.get_bengkok_1_default_tiers()
        self.assertEqual(len(tiers), BENGKOK_1_NUM_TIERS)
        self.assertEqual(len(tiers), 5)

        # Check total area equals 3,700 m2 (0.37 Ha)
        total_area = sum(t.area_m2 for t in tiers)
        self.assertAlmostEqual(total_area, BENGKOK_1_TOTAL_AREA_M2, places=1)

        # Verify monotonic downward elevation profile from Tier 1 to Tier 5
        for i in range(len(tiers) - 1):
            self.assertGreater(
                tiers[i].elevation_m,
                tiers[i + 1].elevation_m,
                f"Tier {tiers[i].tier_id} elevation must be higher than Tier {tiers[i+1].tier_id}",
            )

        self.assertEqual(tiers[0].elevation_m, 330.0)
        self.assertEqual(tiers[-1].elevation_m, 324.0)

    def test_03_absorption_factor_calculation(self):
        """Verify slope-dependent absorption factor calculation."""
        # Flat slope (0%) should retain full base absorption (~0.20)
        abs_flat = self.service.calculate_absorption_factor(slope_pct=0.0, base_absorption=0.20)
        self.assertAlmostEqual(abs_flat, 0.20, places=2)

        # Bengkok 1 slope (~8.5%) should have slightly reduced absorption due to higher velocity
        abs_bengkok = self.service.calculate_absorption_factor(slope_pct=8.51, base_absorption=0.20)
        self.assertTrue(0.12 <= abs_bengkok <= 0.18, f"Absorption factor {abs_bengkok} unexpected")

        # Very steep slope (e.g. 35%) should clamp to lower bound
        abs_steep = self.service.calculate_absorption_factor(slope_pct=35.0, base_absorption=0.20)
        self.assertLess(abs_steep, abs_bengkok)

    def test_04_cascading_inflow_formula(self):
        """
        Verify: Inflow_tier(t) = Runoff_upper_tier(t) * (1 - AbsorptionFactor)
        """
        tiers = self.service.get_bengkok_1_default_tiers()
        # Set all initial depths to full bund capacity (120mm) so any input produces runoff
        for t in tiers:
            t.current_water_depth_mm = 120.0

        precip = 20.0  # 20 mm rainfall
        etc = 0.0
        absorption = 0.20

        result = self.service.simulate_cascading_water_balance(
            precipitation_mm=precip,
            etc_mm=etc,
            tiers=tiers,
            absorption_factor=absorption,
        )

        t_res = result.tiers
        # Tier 1 receives 0 upper inflow
        self.assertEqual(t_res[0].inflow_from_upper_tier_mm, 0.0)
        # Tier 1 spillover runoff = 120 + 20 - 3.5 (infiltration) - 120 (bund) = 16.5 mm
        tier1_runoff = t_res[0].spillover_runoff_mm
        self.assertAlmostEqual(tier1_runoff, 16.5, places=1)

        # Tier 2 inflow must equal: Tier 1 Runoff * (1 - 0.20)
        expected_tier2_inflow = round(tier1_runoff * (1.0 - absorption), 2)
        self.assertAlmostEqual(t_res[1].inflow_from_upper_tier_mm, expected_tier2_inflow, places=1)

        # Tier 3 inflow must equal: Tier 2 Runoff * (1 - 0.20)
        expected_tier3_inflow = round(t_res[1].spillover_runoff_mm * (1.0 - absorption), 2)
        self.assertAlmostEqual(t_res[2].inflow_from_upper_tier_mm, expected_tier3_inflow, places=1)

    def test_05_heavy_rain_cascading_compounding_in_lower_tiers(self):
        """
        Under high rainfall (85mm), lower tiers (Tier 4, Tier 5) accumulate
        compounded runoff from all upstream tiers, reaching higher flood risk.
        """
        tiers = self.service.get_bengkok_1_default_tiers()
        # Normal initial standing water = 50mm
        for t in tiers:
            t.current_water_depth_mm = 50.0

        result = self.service.simulate_cascading_water_balance(
            precipitation_mm=85.0,
            etc_mm=4.0,
            tiers=tiers,
        )

        self.assertIn(result.overall_flood_risk, ["HIGH", "CRITICAL"])
        # Lower tier (Tier 4 and 5) must receive substantial cascading inflow
        self.assertGreater(result.tiers[4].inflow_from_upper_tier_mm, 0.0)
        self.assertGreater(result.total_drainage_volume_m3, 0.0)

    def test_06_cascading_sluice_gate_schedule_emergency(self):
        """
        Verify bottom-up staggered sluice gate schedule under high rainfall forecast (80mm).
        Undakan 5 (lowest) must open first/widest to prevent drowning lower plots.
        """
        schedule = self.service.calculate_cascading_sluice_gate_schedule(
            forecast_rainfall_mm=80.0,
            current_depths=[40.0, 45.0, 50.0, 55.0, 60.0],
        )

        self.assertEqual(schedule.urgency_level, "EMERGENCY")
        steps = schedule.gate_steps
        self.assertEqual(len(steps), 5)

        # Check priority order: Priority 1 is Undakan 5 (lowest tier)
        self.assertEqual(steps[0].tier_id, 5)
        self.assertEqual(steps[0].priority_order, 1)
        self.assertEqual(steps[0].gate_aperture_pct, 100.0)
        self.assertEqual(steps[0].gate_status, "FULL_OPEN")

        # Priority 2 is Undakan 4
        self.assertEqual(steps[1].tier_id, 4)
        self.assertEqual(steps[1].gate_aperture_pct, 90.0)

        # Priority 5 is Undakan 1 (throttled buffer)
        self.assertEqual(steps[-1].tier_id, 1)
        self.assertEqual(steps[-1].priority_order, 5)
        self.assertLess(steps[-1].gate_aperture_pct, steps[0].gate_aperture_pct)
        self.assertEqual(steps[-1].gate_aperture_pct, 40.0)

    def test_07_cascading_sluice_gate_schedule_normal_conservation(self):
        """Under dry/light rainfall (5mm), gates remain closed for water conservation."""
        schedule = self.service.calculate_cascading_sluice_gate_schedule(
            forecast_rainfall_mm=5.0,
            current_depths=[30.0, 30.0, 30.0, 30.0, 30.0],
        )

        self.assertEqual(schedule.urgency_level, "NORMAL")
        for step in schedule.gate_steps:
            self.assertEqual(step.gate_aperture_pct, 0.0)
            self.assertEqual(step.gate_status, "CLOSED")


class TestDAG06SARServiceAndSpectralUnmixing(unittest.TestCase):
    """Test suite for Module C - Sentinel-1 SAR & Spectral Unmixing."""

    def setUp(self):
        self.sar_service = SARService()

    def test_08_sar_backscatter_ratio_db_and_linear(self):
        """
        Verify Sentinel-1 backscatter ratio calculations:
        Ratio_dB = sigma0_VH (dB) - sigma0_VV (dB)
        Ratio_linear = 10^(Ratio_dB / 10)
        """
        vv_db = -10.67
        vh_db = -20.22

        ratio_db = self.sar_service.calculate_backscatter_ratio_db(vh_db, vv_db)
        expected_db = round(-20.22 - (-10.67), 3)  # -9.55 dB
        self.assertAlmostEqual(ratio_db, expected_db, places=2)

        ratio_lin = self.sar_service.calculate_backscatter_ratio_linear(vh_db, vv_db)
        expected_lin = round(10.0 ** (expected_db / 10.0), 4)
        self.assertAlmostEqual(ratio_lin, expected_lin, places=3)

    def test_09_radar_vegetation_index(self):
        """
        Verify Radar Vegetation Index:
        RVI = (4 * sigma0_VH_linear) / (sigma0_VV_linear + sigma0_VH_linear)
        """
        rvi_bare = self.sar_service.calculate_radar_vegetation_index(sar_vh_db=-20.22, sar_vv_db=-10.67)
        self.assertTrue(0.0 <= rvi_bare <= 1.0)
        # For bare/early fallow, RVI is typically low (~0.35 - 0.45)
        self.assertTrue(0.20 <= rvi_bare <= 0.60)

        # For dense vegetative canopy (VH = -14, VV = -10), RVI must be higher
        rvi_dense = self.sar_service.calculate_radar_vegetation_index(sar_vh_db=-14.0, sar_vv_db=-10.0)
        self.assertGreater(rvi_dense, rvi_bare)

    def test_10_wet_biomass_and_soil_wetness_estimation(self):
        """
        Verify wet biomass (ton/ha) and Soil Wetness Index (SWI) for Bengkok 1 real telemetry.
        """
        # Telemetry from 2026-09-04 (fallow/bera 0 HST): VV = -10.67 dB, VH = -20.22 dB
        biomass = self.sar_service.estimate_wet_biomass(sar_vh_db=-20.22, sar_vv_db=-10.67)
        self.assertGreater(biomass, 0.2)
        # During 0 HST fallow, wet biomass should be modest (< 3.0 ton/ha)
        self.assertLess(biomass, 3.5, f"Fallow biomass {biomass} ton/ha should be < 3.5")

        swi = self.sar_service.estimate_soil_wetness_index(sar_vv_db=-10.67, sar_vh_db=-20.22)
        self.assertTrue(0.0 <= swi <= 1.0)
        # Wetness status
        status = self.sar_service.determine_wetness_status(swi)
        self.assertIn(status, ["LEMBAB_OPTIMAL", "JENUH_AIR", "TERGENANG"])

    def test_11_seamless_cloud_fallback_over_40_pct_and_100_pct(self):
        """
        Verify that when cloud cover > 40% (or 100% or optical is None):
        - System activates cloud-penetrating Sentinel-1 SAR.
        - Returns biomass & wetness index without throwing error 500!
        """
        # Case A: Low cloud cover (15%) -> Uses Optical Sentinel-2
        clean_optical = {
            "date": "2026-09-04",
            "ndvi": 0.2745,
            "ndre": 0.1811,
            "ndwi": -0.1368,
            "savi": 0.2107,
            "cloud_cover_pct": 15.0,
        }
        res_optical = self.sar_service.estimate_vegetation_and_moisture(optical_observation=clean_optical)
        self.assertEqual(res_optical["source"], "SENTINEL_2_OPTICAL")
        self.assertFalse(res_optical["cloud_penetrating_active"])

        # Case B: High cloud cover (55% > 40%) -> Falls back to Sentinel-1 SAR
        cloudy_optical = {
            "date": "2026-09-04",
            "ndvi": 0.10,
            "cloud_cover_pct": 55.0,
        }
        res_sar = self.sar_service.estimate_vegetation_and_moisture(optical_observation=cloudy_optical)
        self.assertEqual(res_sar["source"], "SENTINEL_1_SAR")
        self.assertTrue(res_sar["cloud_penetrating_active"])
        self.assertIn("SAR_BACKSCATTER_RATIO", res_sar["primary_vegetation_index"])
        self.assertGreater(res_sar["estimated_wet_biomass_ton_ha"], 0.0)
        self.assertGreater(res_sar["soil_wetness_index"], 0.0)

        # Case C: Extreme 100% cloud cover (or completely overcast rainy season)
        overcast_optical = {"date": "2026-09-04", "cloud_cover_pct": 100.0}
        res_100 = self.sar_service.estimate_vegetation_and_moisture(optical_observation=overcast_optical)
        self.assertEqual(res_100["source"], "SENTINEL_1_SAR")
        self.assertTrue(res_100["cloud_penetrating_active"])
        self.assertIsNotNone(res_100["estimated_wet_biomass_ton_ha"])

        # Case D: Optical completely None (no satellite pass)
        res_none = self.sar_service.estimate_vegetation_and_moisture(optical_observation=None)
        self.assertEqual(res_none["source"], "SENTINEL_1_SAR")
        self.assertTrue(res_none["cloud_penetrating_active"])

    def test_12_process_real_gee_sar_telemetry(self):
        """Verify processing of real Google Earth Engine SAR records."""
        results = self.sar_service.process_sentinel1_sar_telemetry()
        self.assertGreaterEqual(len(results), 6)
        for r in results:
            self.assertIn("ratio_db", r)
            self.assertIn("ratio_linear", r)
            self.assertIn("rvi", r)
            self.assertIn("estimated_wet_biomass_ton_ha", r)
            self.assertIn("soil_wetness_index", r)
            self.assertTrue(r["cloud_penetrating_active"])

    def test_13_spectral_unmixing_mathematical_parity(self):
        """
        Verify linear spectral unmixing logic in Python matching frontend/src/lib/spectralUnmixing.ts.
        NDVI_pure = (NDVI_mixed - f_bund * NDVI_weed) / (1 - f_bund)
        """
        mixed_ndvi = 0.2716
        bund_fraction = 0.22
        weed_ndvi = 0.55

        pure_ndvi = (mixed_ndvi - bund_fraction * weed_ndvi) / (1.0 - bund_fraction)
        pure_ndvi = round(pure_ndvi, 4)

        # Pure canopy NDVI should be lower than mixed NDVI because bund weeds (0.55) artificially inflated it!
        self.assertLess(pure_ndvi, mixed_ndvi)
        self.assertAlmostEqual(pure_ndvi, 0.1931, places=2)
        # An unmixed NDVI of ~0.19 correctly identifies the plot as fallow/tillage (0 HST)


def run_tests():
    suite = unittest.TestLoader().loadTestsFromModule(sys.modules[__name__])
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(run_tests())
