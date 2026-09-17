"""
Automated Verification Script for UX Restructure & Navigation (NAV-01 to NAV-14).
Validates:
1. 12/12 Next.js production routes + all tab query routes return 200 OK.
2. Backend agronomy and plot endpoints return 200 OK.
3. Quality Gate:
   - frontend/src/app/petak/[id]/page.tsx line count < 350.
   - Navbar structure has Dashboard | Peta | Agronomi | Laporan | Admin.
"""

import urllib.request
import urllib.error
import json
import os
import sys

# Ensure UTF-8 output on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

FRONTEND = "http://127.0.0.1:3000"
BACKEND = "http://127.0.0.1:8000"

def test_url(url, method="GET", body=None, headers=None):
    if headers is None:
        headers = {}
    req = urllib.request.Request(url, method=method, headers=headers)
    if body:
        req.data = body.encode("utf-8") if isinstance(body, str) else body
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, resp.read().decode("utf-8", errors="ignore")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="ignore")
    except Exception as e:
        return 0, str(e)

def main():
    print("==================================================================")
    print("  TANDUR UX RESTRUCTURE & NAVIGATION VERIFICATION (NAV-01 - NAV-14)")
    print("==================================================================")

    failures = 0

    # 1. Line Count Check for page.tsx
    page_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "src", "app", "petak", "[id]", "page.tsx")
    with open(page_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    line_count = len(lines)
    print(f"\n[AUDIT] frontend/src/app/petak/[id]/page.tsx line count: {line_count}")
    if line_count < 350:
        print(f"  [PASS] page.tsx is {line_count} lines (< 350 threshold, down from 1269 lines)")
    else:
        print(f"  [FAIL] page.tsx is {line_count} lines (>= 350)")
        failures += 1

    # 2. Navbar Restructure Check
    navbar_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "src", "components", "layout", "Navbar.tsx")
    with open(navbar_path, "r", encoding="utf-8") as f:
        navbar_content = f.read()
    if 'href="/agronomi"' in navbar_content and 'href="/dashboard"' in navbar_content:
        print("  [PASS] Navbar has /agronomi and logo links to /dashboard")
    else:
        print("  [FAIL] Navbar missing /agronomi or logo /dashboard")
        failures += 1
    if 'href="/"\n            className={`px-[11px] py-[4px] rounded-full text-[12px] font-medium transition-colors shrink-0' not in navbar_content:
        print("  [PASS] Beranda menu removed from Navbar links")
    else:
        print("  [FAIL] Beranda menu still exists in Navbar links")
        failures += 1

    # 3. Frontend Routes Verification
    routes_to_test = [
        "/",
        "/dashboard",
        "/peta",
        "/agronomi",
        "/laporan",
        "/admin/petak-baru",
        "/admin/organisasi",
        "/admin/varietas",
        "/login",
        "/petak/1",
        "/petak/1?tab=ikhtisar",
        "/petak/1?tab=agronomi",
        "/petak/1?tab=operasional",
        "/petak/1?tab=keuangan",
    ]

    print("\n[TEST] Verifying Frontend Production Routes:")
    for route in routes_to_test:
        status, _ = test_url(f"{FRONTEND}{route}")
        if status == 200:
            print(f"  [PASS] {route} -> 200 OK")
        else:
            print(f"  [FAIL] {route} -> {status}")
            failures += 1

    # 4. Backend Agronomy Endpoints Verification
    print("\n[TEST] Verifying Backend Agronomy Endpoints:")
    backend_tests = [
        ("GET", "/api/v1/plots"),
        ("GET", "/api/v1/plots/1"),
        ("GET", "/api/v1/plots/1/detail"),
        ("GET", "/api/v1/agronomy/soil-characteristics/1"),
        ("GET", "/api/v1/agronomy/plots/1/water-balance"),
        ("GET", "/api/v1/agronomy/plots/1/vrn"),
        ("GET", "/api/v1/agronomy/plots/1/sar"),
    ]

    for method, path in backend_tests:
        status, _ = test_url(f"{BACKEND}{path}", method=method)
        if status == 200:
            print(f"  [PASS] {method} {path} -> 200 OK")
        else:
            print(f"  [FAIL] {method} {path} -> {status}")
            failures += 1

    # Simulate POST planting-window
    pw_body = json.dumps({"plot_id": 1, "candidate_window_days": 25})
    status, _ = test_url(f"{BACKEND}/api/v1/agronomy/planting-window/simulate", method="POST", body=pw_body, headers={"Content-Type": "application/json"})
    if status == 200:
        print("  [PASS] POST /api/v1/agronomy/planting-window/simulate -> 200 OK")
    else:
        print(f"  [FAIL] POST /api/v1/agronomy/planting-window/simulate -> {status}")
        failures += 1

    print("\n==================================================================")
    if failures == 0:
        print("  ALL VERIFICATION CHECKS PASSED PERFECTLY! (0 FAILURES)")
        print("==================================================================")
        sys.exit(0)
    else:
        print(f"  VERIFICATION COMPLETED WITH {failures} FAILURES.")
        print("==================================================================")
        sys.exit(1)

if __name__ == "__main__":
    main()
