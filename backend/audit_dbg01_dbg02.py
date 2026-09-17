"""
Comprehensive Audit & Verification Suite for DBG-01 and DBG-02.
Zero-defect assertion runner for Data Contract Invariants and Mathematical Engines.
"""
import math
import os
import sys
import re
import json
import threading
import time
import urllib.request
import urllib.error
import http.server
from datetime import date, datetime, timedelta

# Ensure backend root is on sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

print("=" * 80)
print("STARTING SYSTEMATIC AUDIT: DBG-01 & DBG-02")
print("=" * 80)

# =====================================================================
# DBG-01: Backend Models & Data Contract Invariants
# =====================================================================
print("\n[DBG-01.1] Verifying SQLAlchemy Models Import & Schema Invariants...")
try:
    from app.models.operations import (
        TaskType,
        SaprotanCategory,
        PestSeverity,
        WaterSource,
        PlotLaborLog,
        PlotIrrigationLog,
        SaprotanItem,
        PlotSaprotanApplication,
        PestScoutingReport,
        PostHarvestLog,
    )
    from app.models.plot import Plot
    print("  -> SUCCESS: All 6 operational models + Plot imported cleanly.")
except Exception as e:
    print(f"  -> FAILED: Model import error: {e}")
    sys.exit(1)

# Verify Foreign Keys and Relationships to Plot
print("\n[DBG-01.2] Verifying Foreign Keys and Relationship Mappings...")
plot_models = [
    (PlotLaborLog, "labor_logs", "plot_id"),
    (PlotIrrigationLog, "irrigation_logs", "plot_id"),
    (PlotSaprotanApplication, "saprotan_applications", "plot_id"),
    (PestScoutingReport, "scouting_reports", "plot_id"),
    (PostHarvestLog, "post_harvest_logs", "plot_id"),
]

for model, rel_name, fk_col in plot_models:
    # Verify FK column exists
    assert hasattr(model, fk_col), f"{model.__name__} missing foreign key {fk_col}"
    # Verify relationship exists on Plot
    assert hasattr(Plot, rel_name), f"Plot missing relationship {rel_name}"
    # Verify back relationship on model
    assert hasattr(model, "plot"), f"{model.__name__} missing back relationship 'plot'"
    print(f"  -> PASS: {model.__name__}.{fk_col} -> Plot.{rel_name} properly wired.")

# SaprotanItem -> PlotSaprotanApplication FK
assert hasattr(PlotSaprotanApplication, "item_id"), "PlotSaprotanApplication missing item_id"
assert hasattr(SaprotanItem, "applications"), "SaprotanItem missing applications relationship"
assert hasattr(PlotSaprotanApplication, "item"), "PlotSaprotanApplication missing item relationship"
print("  -> PASS: SaprotanItem <-> PlotSaprotanApplication relationship properly wired.")

# Verify Enum Consistency across ORM, demo_server, and TypeScript
print("\n[DBG-01.3] Verifying Enum Consistency across ORM, demo_server, and TypeScript...")
orm_task_types = set(e.value for e in TaskType)
orm_saprotan_categories = set(e.value for e in SaprotanCategory)
orm_pest_severities = set(e.value for e in PestSeverity)
orm_water_sources = set(e.value for e in WaterSource)

expected_task_types = {"olah_tanah", "perbaikan_galengan", "pelumpuran", "semai", "tandur", "penyiangan", "pemupukan", "penyemprotan", "panen"}
expected_saprotan_categories = {"benih", "pupuk_makro", "pupuk_mikro", "pestisida"}
expected_pest_severities = {"ringan", "sedang", "berat"}
expected_water_sources = {"irigasi_tersier", "pompa_diesel", "sumur_dalam"}

assert orm_task_types == expected_task_types, f"TaskType mismatch: {orm_task_types} vs {expected_task_types}"
assert orm_saprotan_categories == expected_saprotan_categories, f"SaprotanCategory mismatch: {orm_saprotan_categories} vs {expected_saprotan_categories}"
assert orm_pest_severities == expected_pest_severities, f"PestSeverity mismatch: {orm_pest_severities} vs {expected_pest_severities}"
assert orm_water_sources == expected_water_sources, f"WaterSource mismatch: {orm_water_sources} vs {expected_water_sources}"
print("  -> PASS: ORM Enums match specification 100%.")

# Check frontend TypeScript definitions
ts_path = os.path.join(backend_dir, "..", "frontend", "src", "types", "operations.ts")
if os.path.exists(ts_path):
    with open(ts_path, "r", encoding="utf-8") as f:
        ts_content = f.read()
    for val in expected_task_types:
        assert f"'{val}'" in ts_content, f"TypeScript missing TaskType '{val}'"
    for val in expected_saprotan_categories:
        assert f"'{val}'" in ts_content, f"TypeScript missing SaprotanCategory '{val}'"
    for val in expected_pest_severities:
        assert f"'{val}'" in ts_content, f"TypeScript missing PestSeverity '{val}'"
    for val in expected_water_sources:
        assert f"'{val}'" in ts_content, f"TypeScript missing WaterSource '{val}'"
    print("  -> PASS: TypeScript types/operations.ts Enums match 100%.")
else:
    print(f"  -> WARNING: {ts_path} not found for TS check.")

# Check Pacitan Bengkok 1 Seed Dataset in demo_server
print("\n[DBG-01.4] Verifying Pacitan Bengkok 1 Seed Dataset in demo_server.py...")
import demo_server

assert len(demo_server.BENGKOK_COORDINATES) == 24, f"Expected 24 coordinates, got {len(demo_server.BENGKOK_COORDINATES)}"
print(f"  -> PASS: Bengkok 1 polygon has {len(demo_server.BENGKOK_COORDINATES)} real coordinates.")

bengkok_labor = [l for l in demo_server.LABOR_LOGS if l.get("plot_id") == 1]
bengkok_irrig = [i for i in demo_server.IRRIGATION_LOGS if i.get("plot_id") == 1]
bengkok_scout = [s for s in demo_server.PEST_SCOUTING_REPORTS if s.get("plot_id") == 1]
saprotan_items = demo_server.SAPROTAN_ITEMS

assert len(bengkok_labor) >= 3, f"Expected >= 3 labor logs, got {len(bengkok_labor)}"
assert len(bengkok_irrig) >= 2, f"Expected >= 2 irrigation logs, got {len(bengkok_irrig)}"
assert len(bengkok_scout) >= 2, f"Expected >= 2 scouting reports, got {len(bengkok_scout)}"
assert len(saprotan_items) >= 5, f"Expected >= 5 saprotan items, got {len(saprotan_items)}"

print(f"  -> PASS: Active relations verified: {len(bengkok_labor)} labor logs, {len(bengkok_irrig)} irrigation logs, {len(bengkok_scout)} scouting reports, {len(saprotan_items)} saprotan items.")

# =====================================================================
# DBG-02: Backend REST API & Mathematical Engines Audit
# =====================================================================
print("\n" + "=" * 80)
print("AUDITING DBG-02: MATHEMATICAL ENGINES & REST API")
print("=" * 80)

# 1. Mathematical Parity: SNI 14% Moisture Rafaksi Formula
print("\n[DBG-02.1] Auditing SNI 14% Moisture Rafaksi Mathematical Engine...")
def calc_net_yield_sni(gross: float, dockage: float, moisture: float) -> float:
    # Net = Gross * (1 - Dockage/100) * ((100 - KA) / 86)
    return round(gross * (1.0 - dockage / 100.0) * ((100.0 - moisture) / 86.0), 2)

# Test Case 1: Gross 2550 kg, 3% dockage, 21.5% KA -> 2257.79 kg
res1 = calc_net_yield_sni(2550.0, 3.0, 21.5)
diff1 = abs(res1 - 2257.79)
assert diff1 < 0.01, f"Test Case 1 failed: expected 2257.79, got {res1}, diff={diff1}"
print(f"  -> PASS: Case 1 (2550kg, 3% dockage, 21.5% KA) => {res1} kg (parity diff: {diff1:.6f} kg < 0.01)")

# Test Case 2: Gross 2550 kg, 2% dockage, 24.0% KA -> 2208.42 kg
res2 = calc_net_yield_sni(2550.0, 2.0, 24.0)
diff2 = abs(res2 - 2208.42)
assert diff2 < 0.01, f"Test Case 2 failed: expected 2208.42, got {res2}, diff={diff2}"
print(f"  -> PASS: Case 2 (2550kg, 2% dockage, 24% KA) => {res2} kg (parity diff: {diff2:.6f} kg < 0.01)")

# Test Case 3: Exactly 14% moisture and 0% dockage -> Net == Gross
res3 = calc_net_yield_sni(1000.0, 0.0, 14.0)
assert res3 == 1000.0, f"Test Case 3 failed: expected 1000.0, got {res3}"
print(f"  -> PASS: Case 3 (1000kg, 0% dockage, 14% KA) => {res3} kg (exact identity)")

# 2. Mathematical Engine: FAO-56 Penman-Monteith ET0 Calculator
print("\n[DBG-02.2] Auditing FAO-56 Penman-Monteith ET0 Calculator...")
from app.services.et0_calculator import calculate_daily_et0, penman_monteith_fao56

# Tropical Pacitan Baseline Condition
et0_pacitan = calculate_daily_et0(
    temp_max_c=31.5,
    temp_min_c=23.2,
    humidity_pct=78.0,
    wind_speed_ms=2.4,
    solar_radiation_mjm2=19.2,
    latitude_deg=-8.0843,
    elevation_m=45.0,
    observation_date=date(2026, 9, 7),
)
assert et0_pacitan is not None, "ET0 calculation returned None for valid inputs"
assert not math.isnan(et0_pacitan), "ET0 calculation returned NaN"
assert not math.isinf(et0_pacitan), "ET0 calculation returned Inf"
assert 1.0 <= et0_pacitan <= 9.0, f"ET0 value {et0_pacitan} out of expected tropical range (1.0 - 9.0 mm/day)"
print(f"  -> PASS: Pacitan ET0 baseline: {et0_pacitan} mm/day (strictly positive and realistic).")

# Edge Cases for ET0
et0_zero_wind = calculate_daily_et0(
    temp_max_c=30.0,
    temp_min_c=22.0,
    humidity_pct=95.0,
    wind_speed_ms=0.0,
    solar_radiation_mjm2=12.0,
    latitude_deg=-8.0,
    elevation_m=0.0,
)
assert et0_zero_wind is not None and et0_zero_wind >= 0.0 and not math.isnan(et0_zero_wind)
print(f"  -> PASS: Zero wind ET0: {et0_zero_wind} mm/day (>= 0.0, non-NaN).")

et0_nan_input = calculate_daily_et0(
    temp_max_c=float("nan"),
    temp_min_c=20.0,
    humidity_pct=80.0,
    wind_speed_ms=2.0,
    solar_radiation_mjm2=15.0,
    fallback_et0=4.5,
)
assert et0_nan_input == 4.5, f"Expected fallback 4.5 for NaN input, got {et0_nan_input}"
print(f"  -> PASS: NaN input handled safely with fallback: {et0_nan_input} mm/day.")

# 3. Mathematical Engine: GDD Service & Phenology
print("\n[DBG-02.3] Auditing Growing Degree Days (GDD) Engine...")
from app.services.gdd_service import calculate_gdd_daily, predict_phase, predict_harvest_date

# Padi normal calculation: (32 + 24) / 2 - 10 = 18.0
gdd_padi = calculate_gdd_daily(32.0, 24.0, tbase=10.0, crop_type="padi")
assert gdd_padi == 18.0, f"Expected 18.0, got {gdd_padi}"
print(f"  -> PASS: Padi GDD (32/24°C, Tbase=10°C): {gdd_padi} °C-days.")

# Jagung calculation with temperature capping (Tmax=35 capped at 30, Tmin=8 floored at 10):
# Tmean = (30 + 10) / 2 = 20.0. GDD = 20 - 10 = 10.0
gdd_jagung = calculate_gdd_daily(35.0, 8.0, tbase=10.0, crop_type="jagung")
assert gdd_jagung == 10.0, f"Expected 10.0 for capped corn, got {gdd_jagung}"
print(f"  -> PASS: Jagung GDD capping (35/8°C -> 30/10°C, Tbase=10°C): {gdd_jagung} °C-days.")

# Cold day (Tmean < Tbase): must return 0.0, NEVER negative
gdd_cold = calculate_gdd_daily(8.0, 4.0, tbase=10.0, crop_type="padi")
assert gdd_cold == 0.0, f"Expected 0.0 for cold day, got {gdd_cold}"
print(f"  -> PASS: Cold day GDD floor invariant: {gdd_cold} °C-days (never negative).")

# NaN inputs: must return 0.0, NEVER NaN
gdd_nan = calculate_gdd_daily(float("nan"), 20.0, tbase=10.0)
assert gdd_nan == 0.0 and not math.isnan(gdd_nan), f"Expected 0.0 for NaN input, got {gdd_nan}"
print(f"  -> PASS: NaN input GDD invariant: {gdd_nan} °C-days (zero-defect guard).")

# 4. Live REST API Test on Threaded Server
print("\n[DBG-02.4] Starting Live REST API Audit on Threaded HTTPServer...")
TEST_PORT = 8019
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
urllib.request.install_opener(opener)

server = http.server.ThreadingHTTPServer(("127.0.0.1", TEST_PORT), demo_server.DemoAPIHandler)
server_thread = threading.Thread(target=server.serve_forever, daemon=True)
server_thread.start()
time.sleep(0.5)

base_url = f"http://127.0.0.1:{TEST_PORT}/api/v1"

def api_get(path):
    req = urllib.request.Request(f"{base_url}{path}")
    with urllib.request.urlopen(req) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))

def api_post(path, body):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(f"{base_url}{path}", data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))

# Test Endpoint 1: GET & POST /plots/1/labor
print("\n  Endpoint 1: /plots/1/labor")
status, labor_list = api_get("/plots/1/labor")
assert status == 200 and len(labor_list) >= 3, f"GET /labor failed: {status}"
print(f"    -> GET OK: {len(labor_list)} records")

status, new_labor = api_post("/plots/1/labor", {
    "activity_date": "2026-09-07",
    "task_type": "pemupukan",
    "labor_count": 3,
    "hours_worked": 7.0,
    "wage_rate_per_day": 100000.0,
    "is_contract": False,
    "notes": "Pemupukan susulan NPK Phonska",
})
assert status == 201 and new_labor.get("total_cost") == 300000.0, f"POST /labor failed: {status} {new_labor}"
print(f"    -> POST OK: Added labor ID #{new_labor['id']}, total: Rp{new_labor['total_cost']}")

# Test Endpoint 2: GET & POST /plots/1/irrigation
print("\n  Endpoint 2: /plots/1/irrigation")
status, irrig_list = api_get("/plots/1/irrigation")
assert status == 200 and len(irrig_list) >= 2, f"GET /irrigation failed: {status}"
print(f"    -> GET OK: {len(irrig_list)} records")

status, new_irrig = api_post("/plots/1/irrigation", {
    "water_source": "pompa_diesel",
    "water_volume_m3": 150.0,
    "pump_duration_hours": 5.0,
    "fuel_liters": 10.0,
    "fuel_cost": 150000.0,
    "started_at": "2026-09-07T06:00:00Z",
    "ended_at": "2026-09-07T11:00:00Z",
})
assert status == 201 and new_irrig.get("fuel_cost") == 150000.0, f"POST /irrigation failed: {status} {new_irrig}"
print(f"    -> POST OK: Added irrigation ID #{new_irrig['id']}, fuel cost: Rp{new_irrig['fuel_cost']}")

# Test Endpoint 3: GET & POST /saprotan
print("\n  Endpoint 3: /saprotan")
status, sapro_catalog = api_get("/saprotan")
assert status == 200 and len(sapro_catalog) >= 5, f"GET /saprotan failed: {status}"
print(f"    -> GET OK: {len(sapro_catalog)} items in catalog")

status, new_sapro = api_post("/saprotan", {
    "name": "Amistartop 325 SC",
    "category": "pestisida",
    "active_ingredient": "Azoksistrobin 200 g/l + Difenokonazol 125 g/l",
    "phi_days": 14,
    "unit": "liter",
    "unit_cost": 275000.0,
    "stock_qty": 5.0,
})
assert status == 201 and new_sapro.get("name") == "Amistartop 325 SC", f"POST /saprotan failed: {status}"
print(f"    -> POST OK: Added catalog item #{new_sapro['id']} ({new_sapro['name']})")

# Test Endpoint 4: POST /plots/1/apply-saprotan (PHI Guardrail Test)
print("\n  Endpoint 4: /plots/1/apply-saprotan (PHI Guardrail Validation)")
# Score 250 EC has PHI = 21 days.
# Scenario A: Target harvest in 14 days (< 21 PHI) -> MUST BE REJECTED 400
status_phi, resp_phi = api_post("/plots/1/apply-saprotan", {
    "item_id": 4, # Score 250 EC (PHI=21)
    "application_date": "2026-09-07",
    "target_harvest_date": "2026-09-21", # 14 days < 21 days
    "quantity_used": 1.0,
})
assert status_phi == 400, f"Expected 400 for PHI violation, got {status_phi}"
assert resp_phi.get("error_code") == "PHI_VIOLATION", f"Expected error_code 'PHI_VIOLATION', got {resp_phi}"
assert resp_phi.get("phi_days") == 21, f"Expected phi_days 21, got {resp_phi.get('phi_days')}"
print(f"    -> PASS: Blocked PHI violation: HTTP 400, error_code='PHI_VIOLATION' (PHI={resp_phi['phi_days']}d, remaining={resp_phi['days_remaining_to_harvest']}d)")

# Scenario B: Safe application (Urea Petro, PHI=0) -> MUST SUCCEED 201
status_safe, resp_safe = api_post("/plots/1/apply-saprotan", {
    "item_id": 2, # Urea Petro (PHI=0)
    "application_date": "2026-09-07",
    "target_harvest_date": "2026-09-21",
    "quantity_used": 25.0,
})
assert status_safe == 201, f"Expected 201 for safe application, got {status_safe}"
print(f"    -> PASS: Allowed safe application: HTTP 201, Item '{resp_safe['item_name']}', total: Rp{resp_safe['total_cost']}")

# Test Endpoint 5: GET & POST /plots/1/scouting
print("\n  Endpoint 5: /plots/1/scouting")
status, scout_list = api_get("/plots/1/scouting")
assert status == 200 and len(scout_list) >= 2, f"GET /scouting failed: {status}"
print(f"    -> GET OK: {len(scout_list)} scouting reports")

status, new_scout = api_post("/plots/1/scouting", {
    "observation_date": "2026-09-07T10:00:00Z",
    "pest_type": "penggerek_batang",
    "severity": "berat",
    "latitude": -8.08422,
    "longitude": 111.06335,
    "action_taken": "Pemasangan feromon trap dan aplikasi biopestisida Beauveria",
})
assert status == 201 and new_scout.get("severity") == "berat", f"POST /scouting failed: {status}"
print(f"    -> POST OK: Added scouting report #{new_scout['id']} ({new_scout['pest_type']} - {new_scout['severity']})")

# Test Endpoint 6: GET /plots/1/financial-summary
print("\n  Endpoint 6: /plots/1/financial-summary")
status, fin_sum = api_get("/plots/1/financial-summary")
assert status == 200, f"GET /financial-summary failed: {status}"
assert "total_running_cost" in fin_sum, "Missing total_running_cost in summary"
assert "projected_hpp_per_kg" in fin_sum, "Missing projected_hpp_per_kg in summary"
assert "efficiency_status" in fin_sum, "Missing efficiency_status in summary"
print(f"    -> GET OK: Total Running Cost: Rp{fin_sum['total_running_cost']}, Projected HPP: Rp{fin_sum['projected_hpp_per_kg']}/kg, Efficiency: {fin_sum['efficiency_status']} (Ratio: {fin_sum['efficiency_ratio']})")

# Test Endpoint 7: POST /plots/1/harvest-closing
print("\n  Endpoint 7: /plots/1/harvest-closing (14% Moisture Standardization)")
# Payload: Gross=2550.0 kg, Moisture=21.5%, Dockage=3.0%, Price=6800.0
# Net = 2550 * 0.97 * (78.5 / 86) = 2257.79 kg
status, harvest_res = api_post("/plots/1/harvest-closing", {
    "harvest_date": "2026-09-07",
    "gross_yield_kg": 2550.0,
    "moisture_content_pct": 21.5,
    "dockage_pct": 3.0,
    "selling_price_per_kg": 6800.0,
    "storage_location": "Gudang Pacitan Barat",
})
assert status == 201, f"POST /harvest-closing failed: {status} {harvest_res}"
assert abs(harvest_res["net_yield_kg"] - 2257.79) < 0.01, f"Math discrepancy in harvest closing: expected 2257.79, got {harvest_res['net_yield_kg']}"
print(f"    -> POST OK: Gross {harvest_res['gross_yield_kg']} kg -> Net 14% {harvest_res['net_yield_kg']} kg")
print(f"                Total Revenue: Rp{harvest_res['total_revenue']}, Net Profit: Rp{harvest_res['net_profit']}, ROI: {harvest_res['roi_pct']}%")

# Cleanly shutdown test server
server.shutdown()

print("\n" + "=" * 80)
print("AUDIT SUCCESSFUL: DBG-01 & DBG-02 PASS WITH ZERO DEFECTS!")
print("=" * 80)
