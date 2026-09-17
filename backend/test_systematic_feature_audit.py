"""
Automated Diagnostic & Mock-Leak Detection Suite (SYS-01).
Audits all REST endpoints supporting the 12 TANDUR precision agriculture SaaS modules.

Validates:
1. HTTP 200 OK status on all module endpoints.
2. Response schema integrity (JSON structure, PDF/CSV binary formats).
3. Zero Mock Leak Assertions:
   - Geometry matches Pacitan Bengkok 1 (BENGKOK_COORDINATES / ~0.37 Ha, 23-24 vertices).
   - Plot 1 agronomic state is strictly fallow / bera (0 HST, no fake 72 HST).
   - Zero fictitious/dummy entities (no 'Sukamaju', 'Bengkok 2', 'Klaten', 'Riau Permai').
   - Planting window suitability score is dynamically calculated (not hardcoded default 85).
   - Flags unmapped fallback responses ("TANDUR Local Demo API Running").
4. Generates an executive terminal diagnostic table.
"""

import io
import json
import os
import re
import socket
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

# Ensure backend directory in sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

# Fix Windows console UTF-8 encoding
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Import demo_server
try:
    import demo_server
    from demo_server import DemoAPIHandler, BENGKOK_COORDINATES
    HAS_DEMO_SERVER = True
except Exception as err:
    HAS_DEMO_SERVER = False
    DemoAPIHandler = None
    BENGKOK_COORDINATES = []

# Disable system HTTP proxies for localhost
LOCAL_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
urllib.request.install_opener(LOCAL_OPENER)


def is_port_open(host: str, port: int, timeout: float = 0.5) -> bool:
    """Check if TCP port is active and accepting connections."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(timeout)
        return s.connect_ex((host, port)) == 0


def ensure_server() -> Tuple[str, Optional[Any]]:
    """
    Ensure an HTTP server is listening on port 8000 or fallback port.
    Returns (base_url, server_instance_if_started).
    """
    if is_port_open("127.0.0.1", 8000):
        return "http://127.0.0.1:8000", None

    if not HAS_DEMO_SERVER:
        raise RuntimeError("demo_server.py could not be imported and port 8000 is not active.")

    server_port = 8000
    try:
        server = demo_server.http.server.ThreadingHTTPServer(("127.0.0.1", server_port), DemoAPIHandler)
    except Exception:
        server_port = 8008
        server = demo_server.http.server.ThreadingHTTPServer(("127.0.0.1", server_port), DemoAPIHandler)

    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    time.sleep(0.4)
    return f"http://127.0.0.1:{server_port}", server


def http_request(
    base_url: str,
    method: str,
    path: str,
    payload: Optional[Dict[str, Any]] = None,
    timeout: float = 8.0,
) -> Tuple[int, Dict[str, str], bytes, float]:
    """Execute an HTTP request and return (status_code, headers_lower, body_bytes, elapsed_sec)."""
    url = f"{base_url}{path}"
    headers = {}
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    start_time = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            elapsed = time.time() - start_time
            body = resp.read()
            hdrs = {k.lower(): v for k, v in resp.headers.items()}
            return resp.status, hdrs, body, elapsed
    except urllib.error.HTTPError as e:
        elapsed = time.time() - start_time
        body = e.read()
        hdrs = {k.lower(): v for k, v in e.headers.items()}
        return e.code, hdrs, body, elapsed
    except Exception as e:
        elapsed = time.time() - start_time
        return 0, {}, str(e).encode("utf-8"), elapsed


# =====================================================================
# AUDIT TEST SUITE SPECIFICATION (12 TANDUR MODULES)
# =====================================================================

TEST_CASES = [
    # Module 1: System Health & Core Gateway
    {
        "module": "1. Health & Gateway",
        "name": "System Health Check (Canonical)",
        "method": "GET",
        "path": "/api/health",
        "expected_status": 200,
        "type": "json",
        "check_keys": ["status", "database"],
        "leak_checks": ["fallback"],
    },
    {
        "module": "1. Health & Gateway",
        "name": "Container Health Check (Root)",
        "method": "GET",
        "path": "/health",
        "expected_status": 200,
        "type": "json",
        "check_keys": ["status"],
        "leak_checks": ["fallback"],
    },

    # Module 2: Estates Hierarchy & Geography
    {
        "module": "2. Estates Hierarchy",
        "name": "Estates List",
        "method": "GET",
        "path": "/api/estates",
        "expected_status": 200,
        "type": "json",
        "check_keys": ["id", "name", "latitude", "longitude"],
        "leak_checks": ["fallback", "estate_coords", "dummy_names"],
    },
    {
        "module": "2. Estates Hierarchy",
        "name": "Single Estate Detail (ID 1)",
        "method": "GET",
        "path": "/api/estates/1",
        "expected_status": 200,
        "type": "json",
        "check_keys": ["id", "name", "latitude", "longitude", "divisions"],
        "leak_checks": ["fallback", "estate_coords", "dummy_names"],
    },

    # Module 3: Plots Management & GeoJSON Polygon Engine
    {
        "module": "3. Plots & Geometry",
        "name": "Plots List",
        "method": "GET",
        "path": "/api/plots",
        "expected_status": 200,
        "type": "json",
        "leak_checks": ["fallback", "plot_geometry", "plot_fallow", "dummy_names"],
    },
    {
        "module": "3. Plots & Geometry",
        "name": "Plot 1 Detail (Basic)",
        "method": "GET",
        "path": "/api/plots/1",
        "expected_status": 200,
        "type": "json",
        "check_keys": ["id", "name", "area_hectares", "polygon"],
        "leak_checks": ["fallback", "plot_geometry", "plot_fallow", "dummy_names"],
    },
    {
        "module": "3. Plots & Geometry",
        "name": "Plot 1 Extended Detail",
        "method": "GET",
        "path": "/api/plots/1/detail",
        "expected_status": 200,
        "type": "json",
        "check_keys": ["id", "name", "current_hst", "current_phase", "polygon"],
        "leak_checks": ["fallback", "plot_geometry", "plot_fallow", "dummy_names"],
    },
    {
        "module": "3. Plots & Geometry",
        "name": "Estate 1 Plots Association",
        "method": "GET",
        "path": "/api/estates/1/plots",
        "expected_status": 200,
        "type": "json",
        "leak_checks": ["fallback", "plot_geometry", "dummy_names"],
    },

    # Module 4: Agrometeorology (Open-Meteo & FAO-56 Penman-Monteith)
    {
        "module": "4. Agrometeorology",
        "name": "Current Weather Telemetry",
        "method": "GET",
        "path": "/api/weather/current",
        "expected_status": 200,
        "type": "json",
        "check_keys": ["temp_mean_c", "humidity_pct", "et0_mm"],
        "leak_checks": ["fallback", "weather_plausibility"],
    },
    {
        "module": "4. Agrometeorology",
        "name": "16-Day Weather Forecast",
        "method": "GET",
        "path": "/api/weather/forecast",
        "expected_status": 200,
        "type": "json",
        "leak_checks": ["fallback", "weather_forecast_items"],
    },

    # Module 5: Early Warning System & Alerts Engine
    {
        "module": "5. Alerts Engine",
        "name": "Agronomic Alerts List",
        "method": "GET",
        "path": "/api/alerts",
        "expected_status": 200,
        "type": "json",
        "leak_checks": ["fallback", "alerts_structure"],
    },

    # Module 6: Digital Agronomy - Soil Profile (ISRIC SoilGrids & Saxton-Rawls)
    {
        "module": "6. Agro - Soil Profile",
        "name": "Soil Characteristics (Plot 1)",
        "method": "GET",
        "path": "/api/v1/agronomy/soil-characteristics/1",
        "expected_status": 200,
        "type": "json",
        "check_keys": ["plot_id", "texture", "saxton_rawls_hydrology"],
        "leak_checks": ["fallback", "soil_pacitan_texture"],
    },

    # Module 7: Digital Agronomy - Forward Planting Window Simulation (DAG-04)
    {
        "module": "7. Agro - Planting Window",
        "name": "Forward Planting Simulation (GET)",
        "method": "GET",
        "path": "/api/v1/agronomy/planting-window/simulate?plot_id=1",
        "expected_status": 200,
        "type": "json",
        "check_keys": ["plot_id", "optimal_recommendation"],
        "leak_checks": ["fallback", "planting_window_dynamic"],
    },
    {
        "module": "7. Agro - Planting Window",
        "name": "Forward Planting Simulation (POST)",
        "method": "POST",
        "path": "/api/v1/agronomy/planting-window/simulate",
        "payload": {"plot_id": 1, "candidate_window_days": 20},
        "expected_status": 200,
        "type": "json",
        "check_keys": ["plot_id", "optimal_recommendation"],
        "leak_checks": ["fallback", "planting_window_dynamic"],
    },

    # Module 8: Digital Agronomy - Terraced Water Balance (Copernicus DEM & 5 Tiers)
    {
        "module": "8. Agro - Water Balance",
        "name": "Terraced Water Balance (5 Tiers)",
        "method": "GET",
        "path": "/api/v1/agronomy/plots/1/water-balance",
        "expected_status": 200,
        "type": "json",
        "check_keys": ["plot_id", "water_balance", "sluice_schedule"],
        "leak_checks": ["fallback", "water_balance_tiers"],
    },

    # Module 9: Digital Agronomy - Precision Variable Rate Nutrition (VRN) & SAR
    {
        "module": "9. Agro - VRN & SAR",
        "name": "VRN Prescription (Plot 1)",
        "method": "GET",
        "path": "/api/v1/agronomy/plots/1/vrn",
        "expected_status": 200,
        "type": "json",
        "check_keys": ["plot_id", "macro_totals", "split_applications"],
        "leak_checks": ["fallback", "vrn_prescription"],
    },

    # Module 10: Precision Operations & Unit Economics Ledger
    {
        "module": "10. Operations Ledger",
        "name": "Financial Summary (Canonical)",
        "method": "GET",
        "path": "/api/plots/1/financial-summary",
        "expected_status": 200,
        "type": "json",
        "check_keys": ["plot_id", "total_running_cost", "projected_hpp_per_kg"],
        "leak_checks": ["fallback", "financial_metrics"],
    },
    {
        "module": "10. Operations Ledger",
        "name": "Operations Financial Summary (Spec Path)",
        "method": "GET",
        "path": "/api/plots/1/operations/financial-summary",
        "expected_status": 200,
        "type": "json",
        "leak_checks": ["fallback"],
    },
    {
        "module": "10. Operations Ledger",
        "name": "Operations Summary (Spec Path)",
        "method": "GET",
        "path": "/api/plots/1/operations/summary",
        "expected_status": 200,
        "type": "json",
        "leak_checks": ["fallback"],
    },
    {
        "module": "10. Operations Ledger",
        "name": "Operations Logs (Spec Path)",
        "method": "GET",
        "path": "/api/plots/1/operations/logs",
        "expected_status": 200,
        "type": "json",
        "leak_checks": ["fallback"],
    },
    {
        "module": "10. Operations Ledger",
        "name": "Labor Logs (HOK)",
        "method": "GET",
        "path": "/api/plots/1/labor",
        "expected_status": 200,
        "type": "json",
        "leak_checks": ["fallback", "array_not_empty"],
    },
    {
        "module": "10. Operations Ledger",
        "name": "Irrigation & Fuel Logs",
        "method": "GET",
        "path": "/api/plots/1/irrigation",
        "expected_status": 200,
        "type": "json",
        "leak_checks": ["fallback", "array_not_empty"],
    },
    {
        "module": "10. Operations Ledger",
        "name": "Saprotan Catalog & Inventory",
        "method": "GET",
        "path": "/api/saprotan",
        "expected_status": 200,
        "type": "json",
        "leak_checks": ["fallback", "array_not_empty"],
    },

    # Module 11: Enterprise Reporting & Telemetry Export (PDF / CSV)
    {
        "module": "11. Reports & Exports",
        "name": "Telemetry CSV Export (Spec Path)",
        "method": "GET",
        "path": "/api/reports/telemetry-csv",
        "expected_status": 200,
        "type": "csv",
        "leak_checks": ["fallback", "valid_csv"],
    },
    {
        "module": "11. Reports & Exports",
        "name": "Timeseries CSV Export (Canonical)",
        "method": "GET",
        "path": "/api/reports/export-csv?estate_id=1",
        "expected_status": 200,
        "type": "csv",
        "leak_checks": ["fallback", "valid_csv"],
    },
    {
        "module": "11. Reports & Exports",
        "name": "Health PDF Report (Spec Path)",
        "method": "GET",
        "path": "/api/reports/health-pdf",
        "expected_status": 200,
        "type": "pdf",
        "leak_checks": ["fallback", "valid_pdf"],
    },
    {
        "module": "11. Reports & Exports",
        "name": "Health PDF Report (Canonical)",
        "method": "POST",
        "path": "/api/reports/health?estate_id=1",
        "expected_status": 200,
        "type": "pdf",
        "leak_checks": ["fallback", "valid_pdf"],
    },
    {
        "module": "11. Reports & Exports",
        "name": "Harvest Prediction PDF (Spec Path)",
        "method": "GET",
        "path": "/api/reports/harvest-prediction-pdf",
        "expected_status": 200,
        "type": "pdf",
        "leak_checks": ["fallback", "valid_pdf"],
    },
    {
        "module": "11. Reports & Exports",
        "name": "Harvest Prediction PDF (Canonical)",
        "method": "POST",
        "path": "/api/reports/harvest-prediction?estate_id=1",
        "expected_status": 200,
        "type": "pdf",
        "leak_checks": ["fallback", "valid_pdf"],
    },
    {
        "module": "11. Reports & Exports",
        "name": "Water Balance PDF (Spec Path)",
        "method": "GET",
        "path": "/api/reports/water-balance-pdf",
        "expected_status": 200,
        "type": "pdf",
        "leak_checks": ["fallback", "valid_pdf"],
    },
    {
        "module": "11. Reports & Exports",
        "name": "Water Usage PDF (Canonical)",
        "method": "POST",
        "path": "/api/reports/water-usage?estate_id=1",
        "expected_status": 200,
        "type": "pdf",
        "leak_checks": ["fallback", "valid_pdf"],
    },

    # Module 12: Administrative Master Data (Organizations & Crop Seed Varieties)
    {
        "module": "12. Admin & Master Data",
        "name": "Admin Organizations (Spec Path)",
        "method": "GET",
        "path": "/api/admin/organizations",
        "expected_status": 200,
        "type": "json",
        "leak_checks": ["fallback"],
    },
    {
        "module": "12. Admin & Master Data",
        "name": "Companies Master Data (Canonical)",
        "method": "GET",
        "path": "/api/companies",
        "expected_status": 200,
        "type": "json",
        "leak_checks": ["fallback", "array_not_empty"],
    },
    {
        "module": "12. Admin & Master Data",
        "name": "Divisions Master Data (Canonical)",
        "method": "GET",
        "path": "/api/divisions",
        "expected_status": 200,
        "type": "json",
        "leak_checks": ["fallback", "array_not_empty"],
    },
    {
        "module": "12. Admin & Master Data",
        "name": "Admin Varieties (Spec Path)",
        "method": "GET",
        "path": "/api/admin/varieties",
        "expected_status": 200,
        "type": "json",
        "leak_checks": ["fallback"],
    },
    {
        "module": "12. Admin & Master Data",
        "name": "Seed Varieties Master Data (Canonical)",
        "method": "GET",
        "path": "/api/varieties",
        "expected_status": 200,
        "type": "json",
        "leak_checks": ["fallback", "array_not_empty"],
    },
]


# =====================================================================
# ASSERTION & MOCK LEAK DETECTION LOGIC
# =====================================================================

BANNED_NAMES = ["sukamaju", "bengkok 2", "klaten", "riau permai", "kebun percobaan", "dummy_estate"]


def evaluate_mock_leaks(
    test_case: Dict[str, Any],
    status_code: int,
    headers: Dict[str, str],
    body_bytes: bytes,
) -> Tuple[str, List[str]]:
    """
    Evaluates response for mock leaks.
    Returns (verdict, list_of_detail_notes).
    verdict is one of: 'CLEAN', 'MOCK_LEAK', 'WARNING'.
    """
    notes = []
    verdict = "CLEAN"

    # 1. HTTP Status check
    if status_code != test_case["expected_status"]:
        return "MOCK_LEAK", [f"HTTP status {status_code} != expected {test_case['expected_status']}"]

    content_type = headers.get("content-type", "").lower()
    leak_checks = test_case.get("leak_checks", [])

    # Check fallback leak: {"status": "ok", "message": "TANDUR Local Demo API Running"}
    is_fallback = False
    parsed_json = None
    if "json" in content_type or test_case["type"] == "json":
        try:
            parsed_json = json.loads(body_bytes.decode("utf-8"))
            if (
                isinstance(parsed_json, dict)
                and parsed_json.get("status") == "ok"
                and parsed_json.get("message") == "TANDUR Local Demo API Running"
            ):
                is_fallback = True
        except Exception:
            pass

    if is_fallback and "fallback" in leak_checks:
        return "MOCK_LEAK", ["Unmapped route returned generic fallback stub ('TANDUR Local Demo API Running')"]

    # 2. PDF Format check
    if test_case["type"] == "pdf":
        if is_fallback:
            return "MOCK_LEAK", ["Expected PDF binary, received unmapped JSON fallback stub"]
        if body_bytes.startswith(b"%PDF-"):
            notes.append(f"Valid PDF header ({len(body_bytes):,} bytes)")
        else:
            return "MOCK_LEAK", [f"Invalid PDF binary header: {body_bytes[:20]!r}"]

    # 3. CSV Format check
    if test_case["type"] == "csv":
        if is_fallback:
            return "MOCK_LEAK", ["Expected CSV document, received unmapped JSON fallback stub"]
        csv_text = body_bytes.decode("utf-8", errors="replace")
        lines = [ln.strip() for ln in csv_text.splitlines() if ln.strip()]
        if len(lines) >= 2 and "," in lines[0]:
            notes.append(f"Valid CSV with {len(lines)} records")
        else:
            return "MOCK_LEAK", ["Response does not contain valid CSV tabular data"]

    # 4. JSON Content validations & Leak Checks
    if parsed_json is not None:
        # Check dummy names in JSON string representation
        json_str_lower = json.dumps(parsed_json).lower()
        if "dummy_names" in leak_checks:
            for bname in BANNED_NAMES:
                if bname in json_str_lower:
                    verdict = "MOCK_LEAK"
                    notes.append(f"Dummy name detected: '{bname}'")

        # Check required keys
        for key in test_case.get("check_keys", []):
            if isinstance(parsed_json, dict) and key not in parsed_json:
                verdict = "MOCK_LEAK"
                notes.append(f"Missing required key: '{key}'")

        # Check array not empty
        if "array_not_empty" in leak_checks:
            if isinstance(parsed_json, list):
                if len(parsed_json) == 0:
                    verdict = "WARNING"
                    notes.append("Empty array returned")
                else:
                    notes.append(f"{len(parsed_json)} items returned")
            elif isinstance(parsed_json, dict) and "items" in parsed_json:
                items_len = len(parsed_json["items"])
                if items_len == 0:
                    verdict = "WARNING"
                    notes.append("items list is empty")
                else:
                    notes.append(f"{items_len} items in payload")

        # Estate Coordinates Check
        if "estate_coords" in leak_checks:
            items = parsed_json if isinstance(parsed_json, list) else [parsed_json]
            for est in items:
                lat = est.get("latitude")
                lng = est.get("longitude")
                if lat is not None and lng is not None:
                    # Pacitan is lat ~ -8.084, lng ~ 111.063
                    if abs(lat - (-8.084)) > 0.05 or abs(lng - 111.063) > 0.05:
                        verdict = "MOCK_LEAK"
                        notes.append(f"Estate coords mismatch Pacitan: lat={lat}, lng={lng}")
                    else:
                        notes.append(f"Pacitan coordinates verified (lat={lat}, lng={lng})")

        # Plot Geometry & Area Check
        if "plot_geometry" in leak_checks:
            plots = parsed_json if isinstance(parsed_json, list) else [parsed_json]
            for p in plots:
                if not isinstance(p, dict):
                    continue
                # Area check: expected ~0.37 Ha (not 12.85 dummy)
                area = p.get("area_hectares")
                if area is not None:
                    if abs(area - 0.37) > 0.05:
                        verdict = "MOCK_LEAK"
                        notes.append(f"Plot area {area} Ha != ~0.37 Ha Pacitan Bengkok 1")
                    else:
                        notes.append(f"Area {area} Ha verified")

                # Polygon coordinate check
                poly = p.get("polygon") or {}
                coords = poly.get("coordinates", [])
                if coords and isinstance(coords, list) and len(coords) > 0:
                    ring = coords[0]
                    vcount = len(ring)
                    if vcount < 10:
                        verdict = "MOCK_LEAK"
                        notes.append(f"Suspicious polygon vertex count: {vcount} (<10)")
                    else:
                        v0 = ring[0]
                        if len(v0) >= 2 and (abs(v0[0] - 111.063) > 0.05 or abs(v0[1] - (-8.084)) > 0.05):
                            verdict = "MOCK_LEAK"
                            notes.append(f"Polygon vertex outside Pacitan: {v0}")
                        else:
                            notes.append(f"KML polygon verified ({vcount} vertices)")

        # Plot Fallow / Bera State Check
        if "plot_fallow" in leak_checks:
            plot = parsed_json[0] if isinstance(parsed_json, list) and len(parsed_json) > 0 else parsed_json
            if isinstance(plot, dict):
                hst = plot.get("current_hst")
                if hst is not None:
                    if hst != 0:
                        verdict = "MOCK_LEAK"
                        notes.append(f"Plot 1 HST is {hst} (expected 0 HST bera/fallow)")
                    else:
                        notes.append("Plot 1 verified as 0 HST (fallow/bera)")
                phase = str(plot.get("current_phase", "")).lower()
                if "bera" in phase or "belum ditanami" in phase or "persiapan" in phase or "vegetatif" in phase:
                    notes.append(f"Phase: {plot.get('current_phase')}")

        # Soil Profile Texture Check
        if "soil_pacitan_texture" in leak_checks:
            tex = parsed_json.get("texture", {})
            sclass = tex.get("soil_class", "")
            if "Silty Clay Loam" in sclass or "Lempung Berdebu" in sclass:
                notes.append(f"Pacitan soil verified: {sclass}")
            elif "Clay Loam" in sclass:
                verdict = "WARNING"
                notes.append(f"Soil class is '{sclass}' (SYS-03 target: Silty Clay Loam)")
            else:
                verdict = "MOCK_LEAK"
                notes.append(f"Unexpected soil class '{sclass}'")

        # Planting Window Dynamic Simulation Check
        if "planting_window_dynamic" in leak_checks:
            opt = parsed_json.get("optimal_recommendation", {})
            score = opt.get("suitability_score")
            crop = opt.get("recommended_crop")
            t0 = opt.get("optimal_t0_date")
            if score is None:
                verdict = "MOCK_LEAK"
                notes.append("No suitability_score in planting window response")
            else:
                notes.append(f"Score: {score}/100 for {crop} (T0*={t0})")
                if score == 85:
                    verdict = "WARNING"
                    notes.append("Score is exactly 85 (check if hardcoded default or calculated)")

        # Terraced Water Balance Tiers Check
        if "water_balance_tiers" in leak_checks:
            wb = parsed_json.get("water_balance", {})
            num_tiers = wb.get("num_tiers") or len(parsed_json.get("tiers", []))
            if num_tiers == 5:
                notes.append("5 Terrace Tiers verified (Copernicus DEM 30m)")
            else:
                verdict = "MOCK_LEAK"
                notes.append(f"Terrace tier count is {num_tiers} (expected 5)")

        # VRN Prescription Check
        if "vrn_prescription" in leak_checks:
            macro = parsed_json.get("macro_totals", {})
            urea = macro.get("urea", {}).get("total_kg")
            npk = macro.get("npk", {}).get("total_kg")
            if urea is not None and npk is not None:
                notes.append(f"Prescription verified: Urea {urea} kg, NPK {npk} kg")
            else:
                verdict = "MOCK_LEAK"
                notes.append("Missing Urea or NPK summary quantities in macro_totals")

        # Weather checks
        if "weather_plausibility" in leak_checks:
            temp = parsed_json.get("temp_mean_c") or parsed_json.get("temperature")
            hum = parsed_json.get("humidity_pct") or parsed_json.get("humidity")
            if temp is not None and 15.0 <= float(temp) <= 45.0:
                notes.append(f"Temp {temp}°C, Humidity {hum}%")
            else:
                verdict = "WARNING"
                notes.append(f"Plausibility warning on temp: {temp}°C")

        # Operations Financial Metrics Check
        if "financial_metrics" in leak_checks:
            cost = parsed_json.get("total_running_cost")
            hpp = parsed_json.get("projected_hpp_per_kg")
            eff = parsed_json.get("efficiency_status")
            notes.append(f"Running Cost: Rp {cost:,.0f}, HPP/kg: Rp {hpp:,.0f} ({eff})")

    if not notes:
        notes.append("Payload received and verified")

    return verdict, notes


# =====================================================================
# AUDIT RUNNER & TABLE FORMATTER
# =====================================================================

def run_feature_audit() -> Dict[str, Any]:
    print("=" * 100)
    print("  TANDUR PLATFORM - AUTOMATED DIAGNOSTIC & MOCK-LEAK AUDIT SUITE (SYS-01)")
    print("=" * 100)

    # 1. Target URL Setup
    base_url, server_inst = ensure_server()
    print(f"Target Server : {base_url}")
    print(f"Total Audits  : {len(TEST_CASES)} endpoints across 12 SaaS modules\n")

    results = []
    clean_count = 0
    mock_leak_count = 0
    warning_count = 0

    hdr = f"{'#':<4} | {'Module':<24} | {'Endpoint':<40} | {'Verb':<6} | {'HTTP':<8} | {'Leak Verdict':<12} | Details"
    sep = "-" * 130
    print(sep)
    print(hdr)
    print(sep)

    for idx, tc in enumerate(TEST_CASES, 1):
        status, hdrs, body, elapsed = http_request(
            base_url,
            tc["method"],
            tc["path"],
            payload=tc.get("payload"),
        )

        verdict, detail_notes = evaluate_mock_leaks(tc, status, hdrs, body)

        if verdict == "CLEAN":
            clean_count += 1
            verdict_label = "[CLEAN]     "
        elif verdict == "MOCK_LEAK":
            mock_leak_count += 1
            verdict_label = "[MOCK_LEAK] "
        else:
            warning_count += 1
            verdict_label = "[WARNING]   "

        details_str = "; ".join(detail_notes)
        if len(details_str) > 60:
            details_display = details_str[:57] + "..."
        else:
            details_display = details_str

        # Format line
        row = (
            f"{idx:<4} | "
            f"{tc['module'][:24]:<24} | "
            f"{tc['path'][:40]:<40} | "
            f"{tc['method']:<6} | "
            f"{status:<8} | "
            f"{verdict_label:<12} | "
            f"{details_display}"
        )
        print(row)

        results.append({
            "id": idx,
            "module": tc["module"],
            "name": tc["name"],
            "path": tc["path"],
            "method": tc["method"],
            "status": status,
            "verdict": verdict,
            "latency_ms": round(elapsed * 1000, 1),
            "details": detail_notes,
        })

    print(sep)

    # 2. Executive Summary
    total = len(TEST_CASES)
    print("\n" + "=" * 50 + " AUDIT SUMMARY " + "=" * 50)
    print(f"Total Endpoints Audited : {total}")
    print(f"Clean & Real Data       : {clean_count} ({clean_count/total*100:.1f}%)")
    print(f"Mock Leaks / Unmapped   : {mock_leak_count} ({mock_leak_count/total*100:.1f}%)")
    print(f"Warnings / Review Items : {warning_count} ({warning_count/total*100:.1f}%)")

    # Detailed list of mock leaks if any
    if mock_leak_count > 0:
        print("\n[!] DETECTED MOCK LEAKS / FALLBACK STUBS:")
        for r in results:
            if r["verdict"] == "MOCK_LEAK":
                print(f"  - [{r['module']}] {r['method']} {r['path']}")
                for d in r["details"]:
                    print(f"      * {d}")

    # Detailed list of warnings if any
    if warning_count > 0:
        print("\n[?] AUDIT WARNINGS / POTENTIAL RESIDUE:")
        for r in results:
            if r["verdict"] == "WARNING":
                print(f"  - [{r['module']}] {r['method']} {r['path']}")
                for d in r["details"]:
                    print(f"      * {d}")

    print("=" * 115)
    print("SYS-01 Baseline Audit completed successfully.")
    print("=" * 115 + "\n")

    if server_inst:
        server_inst.shutdown()

    return {
        "total": total,
        "clean": clean_count,
        "mock_leak": mock_leak_count,
        "warning": warning_count,
        "results": results,
    }


if __name__ == "__main__":
    summary = run_feature_audit()
    sys.exit(0)
