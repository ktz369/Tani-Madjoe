"""
Unit Test Suite for DAG-03 & DAG-04.
Tests:
1. DAG-03: Real External Data Connector Layer
   - ISRIC SoilGrids client, unit conversions, Pacitan fallback (Sand 24%, Silt 38%, Clay 38%, BD 1.28, pH 6.2), caching.
   - Copernicus DEM 30m / Elevation connector: mean elevation ~142 mdpl, slope ~8.5%, aspect, 5 terrace tiers.
2. DAG-04: Dynamic Planting Window Engine
   - Saxton-Rawls (2006) pedotransfer formulas (theta_FC, theta_PWP, theta_SAT, AWC in mm).
   - FAO-56 daily water balance forward simulation (100-120 days, non-negative storage, saturation bounds).
   - Multi-crop suitability scoring: Rice puddling (>= 200mm) & heading stress; Corn seed rot (>85% FC) & silking deficit (>60%).
   - 30-day window optimal recommendation T0* with daily curves.
"""

import math
import os
import sys
import unittest
from datetime import date, datetime, timedelta

# Ensure backend directory is in sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from app.services.soilgrids_service import (
    DEFAULT_PACITAN_SOIL,
    build_soil_profile_from_raw,
    calculate_saxton_rawls,
    clear_soil_cache,
    determine_usda_class,
    get_soil_characteristics,
    parse_soilgrids_layers,
)
from app.services.elevation_service import (
    BENGKOK_1_ASPECT_DEG,
    BENGKOK_1_LAT,
    BENGKOK_1_LON,
    BENGKOK_1_MEAN_ELEVATION_MDPL,
    BENGKOK_1_NUM_TIERS,
    BENGKOK_1_SLOPE_PCT,
    calculate_terrain_metrics,
    clear_elevation_cache,
    degrees_to_cardinal,
    fetch_point_elevation,
    generate_5_terrace_tiers,
    get_bengkok_1_elevation_profile,
)
from app.services.planting_window_service import (
    find_optimal_planting_window,
    generate_rainfall_climatology,
    get_crop_kc,
    simulate_crop_water_balance,
)


class TestDAG03SoilGrids(unittest.TestCase):
    """Test suite for ISRIC SoilGrids REST API connector and soil physics."""

    def setUp(self):
        clear_soil_cache()

    def test_pacitan_fallback_profile_accuracy(self):
        """Verify empirical fallback strictly matches Pacitan Bengkok 1 benchmark."""
        soil = get_soil_characteristics(plot_id=1, lat=-8.0843, lon=111.0636)
        
        self.assertIsNotNone(soil)
        self.assertEqual(soil["plot_id"], 1)
        
        tex = soil["texture"]
        self.assertEqual(tex["sand_pct"], 24.0, "Sand must be 24%")
        self.assertEqual(tex["silt_pct"], 38.0, "Silt must be 38%")
        self.assertEqual(tex["clay_pct"], 38.0, "Clay must be 38%")
        self.assertIn("Clay Loam", tex["soil_class"])

        props = soil["properties"]
        self.assertEqual(props["bulk_density_g_cm3"], 1.28, "Bulk density must be 1.28 g/cm³")
        self.assertEqual(props["ph_h2o"], 6.2, "pH must be 6.2")
        self.assertAlmostEqual(props["cec_cmol_kg"], 22.5, places=1)

    def test_soilgrids_unit_conversion_from_raw(self):
        """Test conversion of SoilGrids raw units (g/kg, cg/cm³, pH*10, mmol/kg) to percentages and agronomic metrics."""
        raw_extracted = {
            "sand": 240.0,   # 240 g/kg -> 24.0%
            "silt": 380.0,   # 380 g/kg -> 38.0%
            "clay": 380.0,   # 380 g/kg -> 38.0%
            "bdod": 128.0,   # 128 cg/cm³ -> 1.28 g/cm³
            "phh2o": 62.0,   # 62 -> 6.2
            "cec": 225.0,    # 225 mmol/kg -> 22.5 cmol/kg
        }
        
        profile = build_soil_profile_from_raw(-8.0843, 111.0636, raw_extracted)
        self.assertEqual(profile["texture"]["sand_pct"], 24.0)
        self.assertEqual(profile["texture"]["silt_pct"], 38.0)
        self.assertEqual(profile["texture"]["clay_pct"], 38.0)
        self.assertEqual(profile["properties"]["bulk_density_g_cm3"], 1.28)
        self.assertEqual(profile["properties"]["ph_h2o"], 6.2)
        self.assertEqual(profile["properties"]["cec_cmol_kg"], 22.5)

    def test_soilgrids_layer_depth_weighted_average(self):
        """Test weighted average calculation across 0-5cm, 5-15cm, 15-30cm depths."""
        mock_layers = [
            {
                "name": "clay",
                "depths": [
                    {"range": {"top_depth": 0, "bottom_depth": 5}, "values": {"mean": 360}},  # wt 5
                    {"range": {"top_depth": 5, "bottom_depth": 15}, "values": {"mean": 380}}, # wt 10
                    {"range": {"top_depth": 15, "bottom_depth": 30}, "values": {"mean": 400}},# wt 15
                ]
            }
        ]
        # Weighted mean: (360*5 + 380*10 + 400*15) / 30 = (1800 + 3800 + 6000) / 30 = 11600 / 30 = 386.67
        extracted = parse_soilgrids_layers(mock_layers)
        self.assertIn("clay", extracted)
        self.assertAlmostEqual(extracted["clay"], 386.666, places=2)

    def test_soil_in_memory_caching(self):
        """Verify caching prevents redundant network queries."""
        clear_soil_cache()
        # First call populates cache
        res1 = get_soil_characteristics(plot_id=1, lat=-8.0843, lon=111.0636)
        # Second call should retrieve from cache
        res2 = get_soil_characteristics(plot_id=1, lat=-8.0843, lon=111.0636)
        self.assertEqual(res1["texture"], res2["texture"])
        self.assertEqual(res1["properties"], res2["properties"])

    def test_usda_texture_classification(self):
        """Verify USDA classification boundary rules."""
        self.assertEqual(determine_usda_class(24.0, 38.0, 38.0), "Clay Loam (Lempung Berliat)")
        self.assertEqual(determine_usda_class(60.0, 20.0, 20.0), "Sandy Loam (Lempung Berpasir)")
        self.assertEqual(determine_usda_class(10.0, 30.0, 60.0), "Clay (Liat)")


class TestDAG03ElevationService(unittest.TestCase):
    """Test suite for Copernicus DEM 30m / Elevation Connector and Terracing."""

    def setUp(self):
        clear_elevation_cache()

    def test_bengkok_1_mean_elevation(self):
        """Verify mean elevation for Bengkok 1 is ~142 mdpl."""
        elev = fetch_point_elevation(BENGKOK_1_LAT, BENGKOK_1_LON)
        self.assertAlmostEqual(elev, 142.0, delta=4.0, msg="Mean elevation must be ~142 mdpl")

    def test_bengkok_1_terrain_metrics_slope_and_aspect(self):
        """Verify slope ~8.5% and aspect calculation."""
        metrics = calculate_terrain_metrics(center_lat=BENGKOK_1_LAT, center_lon=BENGKOK_1_LON)
        
        self.assertAlmostEqual(metrics["mean_elevation_mdpl"], 142.0, delta=4.0)
        self.assertAlmostEqual(metrics["slope_pct"], 8.51, delta=0.5, msg="Slope must be ~8.5%")
        self.assertIn("Tenggara", metrics["aspect_cardinal"], "Aspect should face SE / Tenggara")
        self.assertEqual(metrics["terrace_tiers_count"], 5)

    def test_5_terrace_tiers_cascading_geometry(self):
        """Verify 5 terrace tiers step heights, descending order, and cascading drainage flow."""
        tiers = generate_5_terrace_tiers(
            mean_elevation_m=142.0,
            slope_pct=8.51,
            total_area_m2=3700.0,
            horizontal_span_m=70.5,
            num_tiers=5,
        )
        self.assertEqual(len(tiers), 5)
        
        # Verify strict descending elevation from Tier 1 to Tier 5
        for i in range(len(tiers) - 1):
            self.assertGreater(
                tiers[i].elevation_m,
                tiers[i + 1].elevation_m,
                f"Tier {tiers[i].tier_id} must have higher elevation than Tier {tiers[i+1].tier_id}"
            )

        # Verify average of top and bottom matches mean elevation
        avg_elev = (tiers[0].elevation_m + tiers[-1].elevation_m) / 2.0
        self.assertAlmostEqual(avg_elev, 142.0, places=1)

        # Verify step drop per tier
        self.assertAlmostEqual(tiers[0].step_height_m, 1.5, delta=0.1)

        # Verify cascading linkages
        self.assertEqual(tiers[0].inflow_source, "Saluran Irigasi Tersier (Primer)")
        self.assertEqual(tiers[0].drainage_target, "Undakan 2")
        self.assertEqual(tiers[-1].drainage_target, "Saluran Pembuang / Sungai")


class TestDAG04SaxtonRawlsAndFAO56(unittest.TestCase):
    """Test suite for Saxton-Rawls pedotransfer and FAO-56 water balance engine."""

    def test_saxton_rawls_physics_bounds(self):
        """Verify Saxton-Rawls equations produce valid hydraulic boundaries."""
        # Test for Pacitan clay-loam: Sand 24%, Clay 38%, OM 2.0%, BD 1.28
        hydro = calculate_saxton_rawls(
            sand_pct=24.0,
            clay_pct=38.0,
            om_pct=2.0,
            root_depth_mm=300.0,
            bulk_density_g_cm3=1.28,
        )

        theta_sat = hydro["theta_sat"]
        theta_fc = hydro["theta_fc"]
        theta_pwp = hydro["theta_pwp"]
        awc_vol = hydro["awc_volumetric"]
        awc_mm = hydro["awc_mm"]

        # Thermodynamic hydraulic consistency: SAT > FC > PWP > 0
        self.assertGreater(theta_sat, theta_fc, "theta_SAT must exceed theta_FC")
        self.assertGreater(theta_fc, theta_pwp, "theta_FC must exceed theta_PWP")
        self.assertGreater(theta_pwp, 0.05, "theta_PWP must be positive (> 5%)")
        self.assertLess(theta_sat, 0.65, "Porosity cannot exceed 65%")

        # AWC consistency
        self.assertAlmostEqual(awc_vol, theta_fc - theta_pwp, places=3)
        self.assertAlmostEqual(awc_mm, awc_vol * 300.0, delta=0.5)
        self.assertGreater(awc_mm, 25.0, "Topsoil AWC for clay loam must be substantial")

    def test_fao56_daily_water_balance_bounds(self):
        """Verify that 100-120 days simulation never yields negative moisture or unphysical overflow."""
        start_t0 = date(2026, 10, 1)
        soil_profile = get_soil_characteristics(plot_id=1)
        weather_series = generate_rainfall_climatology(start_t0 - timedelta(days=15), days=140)

        # Run for Rice (115 days)
        rice_sim = simulate_crop_water_balance(
            crop_type="RICE",
            t0_date=start_t0,
            soil_profile=soil_profile,
            weather_series=weather_series,
            duration_days=115,
        )
        self.assertIn("daily_timeline", rice_sim)
        timeline = rice_sim["daily_timeline"]
        self.assertGreaterEqual(len(timeline), 115)

        sat_mm = soil_profile["saxton_rawls_hydrology"]["theta_sat"] * 300.0
        for day in timeline:
            s_mm = day["soil_moisture_mm"]
            # Zero-hallucination math: Storage >= 0 and within physical soil limits
            self.assertGreaterEqual(s_mm, 0.0, f"Negative soil moisture at HST {day['hst']}")
            self.assertLessEqual(s_mm, sat_mm + 0.1, f"Soil moisture exceeded saturation at HST {day['hst']}")

    def test_crop_coefficient_kc_dynamics(self):
        """Verify dynamic Kc variation per phenological phase."""
        # Rice
        self.assertEqual(get_crop_kc("RICE", -10), 1.05, "Rice land prep Kc")
        self.assertEqual(get_crop_kc("RICE", 15), 1.10, "Rice early vegetative Kc")
        self.assertEqual(get_crop_kc("RICE", 65), 1.25, "Rice heading peak Kc")
        self.assertEqual(get_crop_kc("RICE", 110), 0.75, "Rice ripening Kc")

        # Corn
        self.assertEqual(get_crop_kc("CORN", 5), 0.40, "Corn emergence Kc")
        self.assertEqual(get_crop_kc("CORN", 30), 0.80, "Corn vegetative Kc")
        self.assertEqual(get_crop_kc("CORN", 55), 1.20, "Corn silking peak Kc")
        self.assertEqual(get_crop_kc("CORN", 95), 0.60, "Corn maturity Kc")


class TestDAG04AgronomicScoringRules(unittest.TestCase):
    """Test suite for Rice & Corn suitability scoring functions."""

    def setUp(self):
        self.soil_profile = get_soil_characteristics(plot_id=1)
        self.test_t0 = date(2026, 10, 15)

    def test_rule_padi_puddling_water_accumulation(self):
        """Rule Padi: Requires water accumulation >= 200 mm during puddling (days -15 to 0)."""
        # Case A: Severe drought during puddling (< 50 mm)
        dry_weather = []
        for i in range(140):
            cur = self.test_t0 - timedelta(days=15) + timedelta(days=i)
            # 0 mm rain in days -15 to 0
            p = 0.0 if i <= 15 else 15.0
            dry_weather.append({"date": cur.isoformat(), "precipitation_mm": p, "et0_mm": 4.0})

        sim_dry = simulate_crop_water_balance("RICE", self.test_t0, self.soil_profile, dry_weather, 115)
        self.assertLess(sim_dry["puddling_water_sum_mm"], 200.0)
        
        # Must have penalty for puddling deficit
        penalties = [p["rule"] for p in sim_dry["penalties"]]
        self.assertIn("RULE_PADI_PELUMPURAN", penalties)
        self.assertLess(sim_dry["suitability_score"], 80.0)

        # Case B: Abundant rainfall during puddling (> 200 mm)
        wet_weather = []
        for i in range(140):
            cur = self.test_t0 - timedelta(days=15) + timedelta(days=i)
            # 20 mm rain per day in days -15 to 0 -> 300 mm total
            p = 20.0 if i <= 15 else 12.0
            wet_weather.append({"date": cur.isoformat(), "precipitation_mm": p, "et0_mm": 3.8})

        sim_wet = simulate_crop_water_balance("RICE", self.test_t0, self.soil_profile, wet_weather, 115)
        self.assertGreaterEqual(sim_wet["puddling_water_sum_mm"], 200.0)
        penalties_wet = [p["rule"] for p in sim_wet["penalties"]]
        self.assertNotIn("RULE_PADI_PELUMPURAN", penalties_wet)

    def test_rule_jagung_seed_rot_penalty(self):
        """Rule Jagung: Penalty W=40 if soil moisture > 85% FC during germination (days 0-7)."""
        # Create heavy waterlogging right after planting
        waterlogged_weather = []
        for i in range(120):
            cur = self.test_t0 - timedelta(days=5) + timedelta(days=i)
            # Extreme torrential rain right at day 0 to 7
            p = 45.0 if 5 <= i <= 12 else 5.0
            waterlogged_weather.append({"date": cur.isoformat(), "precipitation_mm": p, "et0_mm": 3.5})

        corn_sim = simulate_crop_water_balance("CORN", self.test_t0, self.soil_profile, waterlogged_weather, 100)
        penalties = [p["rule"] for p in corn_sim["penalties"]]
        self.assertTrue(
            any("BUSUK_BENIH" in r for r in penalties),
            f"Expected seed rot penalty in penalties: {penalties}"
        )
        self.assertLessEqual(corn_sim["suitability_score"], 60.0)

    def test_rule_jagung_silking_deficit_penalty(self):
        """Rule Jagung: Penalty W=50 if water deficit > 60% during silking (days 45-60)."""
        # Create dry spell during days 45 to 60 (i = 50 to 65)
        drought_weather = []
        for i in range(120):
            cur = self.test_t0 - timedelta(days=5) + timedelta(days=i)
            # Zero rain during silking with high ET0
            if 50 <= i <= 65:
                p = 0.0
                et0 = 6.0
            else:
                p = 8.0
                et0 = 4.0
            drought_weather.append({"date": cur.isoformat(), "precipitation_mm": p, "et0_mm": et0})

        corn_sim = simulate_crop_water_balance("CORN", self.test_t0, self.soil_profile, drought_weather, 100)
        penalties = [p["rule"] for p in corn_sim["penalties"]]
        self.assertTrue(
            any("TONGKOL_OMPONG" in r for r in penalties),
            f"Expected barren ear penalty in penalties: {penalties}"
        )

    def test_optimal_30_day_planting_window_recommendation(self):
        """Verify 30-day window search identifies best date T0* with daily curves."""
        window_result = find_optimal_planting_window(
            plot_id=1,
            start_date_str="2026-10-01",
            candidate_window_days=30,
        )
        self.assertIsNotNone(window_result)
        opt = window_result["optimal_recommendation"]
        
        # Verify recommended crop and T0* date
        self.assertIn(opt["recommended_crop"], ["RICE", "CORN"])
        self.assertIsNotNone(opt["optimal_t0_date"])
        self.assertGreaterEqual(opt["suitability_score"], 0.0)
        self.assertLessEqual(opt["suitability_score"], 100.0)
        self.assertIn("summary_rationale", opt)

        # Verify daily curves exist in comparison
        crops = window_result["crops_comparison"]
        self.assertIn("daily_curves", crops["rice"])
        self.assertIn("daily_curves", crops["corn"])
        self.assertGreater(len(crops["rice"]["daily_curves"]), 100)


if __name__ == "__main__":
    unittest.main(verbosity=2)
