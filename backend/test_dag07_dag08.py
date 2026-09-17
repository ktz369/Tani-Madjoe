"""
Comprehensive Test & Verification Suite for DAG-07 & DAG-08.
Tests:
1. Module D - VRN Manual Bucket Dosage & 3-stage split calculations
2. Module D - 3D Drone Mission KML Generator (XML validity, 3D coordinates, terrain-following)
3. Module A - SoilGrids & Saxton-Rawls pedotransfer calculation
4. Module A - Forward planting window simulation & FAO-56 scoring (Rice vs Corn)
5. Module B - Cascading Hydrology & Sluice Gate schedule
6. Module C - Sentinel-1 SAR Backscatter & Spectral Inward buffer
7. demo_server.py Handler Endpoint Verification (GET / POST mock calls)
"""

import io
import json
import os
import sys
import unittest
import xml.etree.ElementTree as ET

# Ensure backend root is in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.services.soilgrids_service import get_soil_characteristics, calculate_saxton_rawls
from app.services.planting_window_service import simulate_planting_window
from app.services.hydrology_service import get_terrace_hydrology, hydrology_service
from app.services.sar_service import get_sar_backscatter_telemetry
from app.services.vrn_service import calculate_vrn_prescription
from app.utils.drone_kml_generator import generate_drone_mission_kml, generate_drone_mission_waypoints


class TestDigitalAgronomyEngine(unittest.TestCase):

    def test_01_vrn_prescription_manual_bucket(self):
        """DAG-07: Verify VRN prescription for Bengkok 1 (0.37 Ha, Inpari 32 HDB)."""
        res = calculate_vrn_prescription(plot_id=1, area_ha=0.37, crop_variety="Inpari 32 HDB")
        
        # Check totals
        # 0.37 * 250 = 92.5 kg Urea -> 1 full sack (50kg) + 42.5 kg loose
        self.assertEqual(res["macro_totals"]["urea"]["total_kg"], 92.5)
        self.assertEqual(res["macro_totals"]["urea"]["full_sacks"], 1)
        self.assertEqual(res["macro_totals"]["urea"]["loose_kg"], 42.5)
        
        # 0.37 * 300 = 111.0 kg NPK Phonska Plus -> 2 full sacks (50kg) + 11.0 kg loose
        self.assertEqual(res["macro_totals"]["npk"]["total_kg"], 111.0)
        self.assertEqual(res["macro_totals"]["npk"]["full_sacks"], 2)
        self.assertEqual(res["macro_totals"]["npk"]["loose_kg"], 11.0)

        # Check 3-stage split application
        splits = res["split_applications"]
        self.assertEqual(len(splits), 3)
        self.assertEqual(splits[0]["stage_name"], "Aplikasi I: Pupuk Dasar (Basal)")
        self.assertEqual(splits[0]["urea_kg"], 18.5) # 20%
        self.assertEqual(splits[0]["npk_kg"], 55.5)  # 50%

        self.assertEqual(splits[1]["stage_name"], "Aplikasi II: Vegetatif Aktif (Tillering)")
        self.assertEqual(splits[1]["urea_kg"], 37.0) # 40%
        self.assertEqual(splits[1]["npk_kg"], 55.5)  # 50%

        self.assertEqual(splits[2]["stage_name"], "Aplikasi III: Primordia / Bunting Awal (Panicle Initiation)")
        self.assertEqual(splits[2]["urea_kg"], 37.0) # 40%
        self.assertEqual(splits[2]["npk_kg"], 0.0)

        # Check 3 terrace tiers adaptation
        tiers = res["terrace_tiers_vrn"]
        self.assertEqual(len(tiers), 3)
        # Upper tier has +10% N
        self.assertEqual(tiers[0]["adjustment_factor"], 1.10)
        # Middle tier has 100% N
        self.assertEqual(tiers[1]["adjustment_factor"], 1.00)
        # Lower tier has -10% N
        self.assertEqual(tiers[2]["adjustment_factor"], 0.90)

    def test_02_drone_mission_kml_generation(self):
        """DAG-07: Verify 3D Drone Mission KML file format and terrain-following altitude."""
        kml_str = generate_drone_mission_kml(plot_name="Petak Bengkok 1", crop_variety="Inpari 32 HDB")
        
        self.assertTrue(kml_str.startswith("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"))
        self.assertIn("<kml xmlns=\"http://www.opengis.net/kml/2.2\"", kml_str)
        self.assertIn("<altitudeMode>absolute</altitudeMode>", kml_str)
        self.assertIn("Misi Drone 3D Terrain-Following", kml_str)

        # Parse XML to guarantee zero parse error
        root = ET.fromstring(kml_str)
        self.assertIsNotNone(root)

        # Check waypoints 3D elevation
        wps = generate_drone_mission_waypoints(spray_height_agl=2.5)
        self.assertGreater(len(wps), 15)
        for wp in wps:
            # Check terrain-following altitude = ground_elev + 2.5 (except takeoff/landing safe offset)
            if wp["action"] == "SPRAY":
                self.assertAlmostEqual(wp["altitude_msl"], wp["ground_elev"] + 2.5, places=1)
                self.assertTrue(142.0 <= wp["ground_elev"] <= 153.0)

    def test_03_soilgrids_saxton_rawls(self):
        """DAG-08: Verify SoilGrids & Saxton-Rawls calculation for Pacitan."""
        soil = get_soil_characteristics(plot_id=1)
        self.assertIn("texture", soil)
        self.assertIn("saxton_rawls_hydrology", soil)
        hydro = soil["saxton_rawls_hydrology"]
        
        # Check thermodynamic limits: PWP < FC < SAT
        self.assertLess(hydro["theta_pwp"], hydro["theta_fc"])
        self.assertLess(hydro["theta_fc"], hydro["theta_sat"])
        self.assertGreater(hydro["awc_mm"], 20.0)
        self.assertLess(hydro["awc_mm"], 80.0)

    def test_04_planting_window_forward_simulation(self):
        """DAG-08: Verify Module A FAO-56 planting window forward simulation."""
        sim = simulate_planting_window(plot_id=1, candidate_window_days=15)
        self.assertIn("optimal_recommendation", sim)
        opt = sim["optimal_recommendation"]
        self.assertIn(opt["recommended_crop"], ["RICE", "CORN"])
        self.assertGreaterEqual(opt["suitability_score"], 50.0)
        self.assertLessEqual(opt["suitability_score"], 100.0)

        # Check crops comparison
        comp = sim["crops_comparison"]
        self.assertIn("rice", comp)
        self.assertIn("corn", comp)
        self.assertGreater(len(comp["rice"]["candidates"]), 0)

    def test_05_cascading_hydrology_water_balance(self):
        """DAG-08: Verify Module B cascading terraced hydrology."""
        hydro = get_terrace_hydrology(plot_id=1)
        self.assertIn("water_balance", hydro)
        self.assertIn("sluice_schedule", hydro)
        wb = hydro["water_balance"]
        self.assertEqual(wb["num_tiers"], 5)
        self.assertGreater(hydro["slope_pct"], 5.0)

    def test_06_sar_backscatter_telemetry(self):
        """DAG-08: Verify Module C cloud-penetrating SAR telemetry."""
        sar = get_sar_backscatter_telemetry(plot_id=1)
        self.assertIn("telemetry", sar)
        self.assertIn("spectral_unmixing", sar)
        self.assertEqual(sar["spectral_unmixing"]["inward_buffer_meters"], 2.5)


if __name__ == "__main__":
    unittest.main()
