import io
import sys
import os
import json
import re

# Ensure backend directory in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import demo_server

class MockSocket:
    def __init__(self, data=b""):
        self.rfile = io.BytesIO(data)
        self.wfile = io.BytesIO()
    def makefile(self, mode, *args, **kwargs):
        if "b" in mode:
            if "r" in mode:
                return self.rfile
            elif "w" in mode:
                return self.wfile
        raise ValueError("Only binary mode supported")
    def sendall(self, data):
        self.wfile.write(data)
    def close(self):
        pass

def run_http_request(method, path, body=b"", headers=None):
    if headers is None:
        headers = {}
    headers_str = "".join(f"{k}: {v}\r\n" for k, v in headers.items())
    raw_req = f"{method} {path} HTTP/1.1\r\nHost: localhost:8000\r\n{headers_str}\r\n".encode("utf-8") + body
    
    sock = MockSocket(raw_req)
    # Instantiate handler
    handler = demo_server.DemoAPIHandler(sock, ("127.0.0.1", 12345), None)
    
    # Parse the response
    sock.wfile.seek(0)
    raw_resp = sock.wfile.read()
    
    header_part, _, body_part = raw_resp.partition(b"\r\n\r\n")
    header_lines = header_part.decode("utf-8", errors="replace").split("\r\n")
    status_line = header_lines[0]
    status_code = int(status_line.split()[1]) if len(status_line.split()) > 1 else 0
    
    resp_headers = {}
    for line in header_lines[1:]:
        if ": " in line:
            k, v = line.split(": ", 1)
            resp_headers[k.lower()] = v
            
    return status_code, resp_headers, body_part

def audit():
    results = {}
    print("=== START AUDIT ===")
    
    # 1. GET /api/reports/history
    code, hdrs, body = run_http_request("GET", "/api/reports/history?estate_id=1&limit=10")
    print(f"GET /api/reports/history: status={code}, length={len(body)}")
    assert code == 200, f"Expected 200, got {code}"
    history_json = json.loads(body.decode("utf-8"))
    assert isinstance(history_json, list) and len(history_json) > 0, "History should be non-empty list"
    results["history"] = {"status": code, "count": len(history_json), "first": history_json[0]}

    # 2. GET /api/plots/1/season-comparison
    code, hdrs, body = run_http_request("GET", "/api/plots/1/season-comparison")
    print(f"GET /api/plots/1/season-comparison: status={code}, length={len(body)}")
    assert code == 200, f"Expected 200, got {code}"
    comparison_json = json.loads(body.decode("utf-8"))
    assert comparison_json.get("plot_id") == 1
    assert "current_season" in comparison_json
    assert "historical_seasons" in comparison_json
    assert "comparison_insights" in comparison_json
    results["season_comparison"] = {
        "status": code,
        "plot_id": comparison_json["plot_id"],
        "plot_name": comparison_json["plot_name"],
        "current_season_crop": comparison_json["current_season"]["crop_type"],
        "historical_count": len(comparison_json["historical_seasons"]),
        "insights_count": len(comparison_json["comparison_insights"])
    }

    # 3. POST /api/reports/health
    code, hdrs, body = run_http_request("POST", "/api/reports/health?estate_id=1&start_date=2026-08-01&end_date=2026-08-31")
    print(f"POST /api/reports/health: status={code}, content_type={hdrs.get('content-type')}, length={len(body)}")
    assert code == 200, f"Expected 200, got {code}"
    assert hdrs.get("content-type") == "application/pdf"
    assert body.startswith(b"%PDF-"), f"Not a valid PDF stream: {body[:10]}"
    assert b"%%EOF" in body, "Missing PDF EOF marker"
    results["health_pdf"] = {
        "status": code,
        "content_type": hdrs.get("content-type"),
        "content_disposition": hdrs.get("content-disposition"),
        "size_bytes": len(body),
        "valid_magic_bytes": body.startswith(b"%PDF-")
    }

    # 4. POST /api/reports/harvest-prediction
    code, hdrs, body = run_http_request("POST", "/api/reports/harvest-prediction?estate_id=1")
    print(f"POST /api/reports/harvest-prediction: status={code}, content_type={hdrs.get('content-type')}, length={len(body)}")
    assert code == 200, f"Expected 200, got {code}"
    assert hdrs.get("content-type") == "application/pdf"
    assert body.startswith(b"%PDF-"), f"Not a valid PDF stream: {body[:10]}"
    assert b"%%EOF" in body, "Missing PDF EOF marker"
    results["harvest_pdf"] = {
        "status": code,
        "content_type": hdrs.get("content-type"),
        "content_disposition": hdrs.get("content-disposition"),
        "size_bytes": len(body),
        "valid_magic_bytes": body.startswith(b"%PDF-")
    }

    # 5. POST /api/reports/water-usage
    code, hdrs, body = run_http_request("POST", "/api/reports/water-usage?estate_id=1&start_date=2026-08-01&end_date=2026-08-31")
    print(f"POST /api/reports/water-usage: status={code}, content_type={hdrs.get('content-type')}, length={len(body)}")
    assert code == 200, f"Expected 200, got {code}"
    assert hdrs.get("content-type") == "application/pdf"
    assert body.startswith(b"%PDF-"), f"Not a valid PDF stream: {body[:10]}"
    assert b"%%EOF" in body, "Missing PDF EOF marker"
    results["water_pdf"] = {
        "status": code,
        "content_type": hdrs.get("content-type"),
        "content_disposition": hdrs.get("content-disposition"),
        "size_bytes": len(body),
        "valid_magic_bytes": body.startswith(b"%PDF-")
    }

    # 6. GET /api/reports/export-csv
    code, hdrs, body = run_http_request("GET", "/api/reports/export-csv?estate_id=1&start_date=2026-08-01&end_date=2026-08-31")
    print(f"GET /api/reports/export-csv: status={code}, content_type={hdrs.get('content-type')}, length={len(body)}")
    assert code == 200, f"Expected 200, got {code}"
    assert "text/csv" in hdrs.get("content-type", "")
    assert body.startswith(b"\xef\xbb\xbf"), f"Expected UTF-8 BOM, got {body[:4]}"
    csv_text = body.decode("utf-8-sig")
    lines = csv_text.strip().split("\r\n") if "\r\n" in csv_text else csv_text.strip().split("\n")
    header_row = lines[0]
    print(f"CSV Header: {header_row}")
    print(f"CSV Line count: {len(lines)}")
    bengkok_1_rows = [l for l in lines[1:] if "Bengkok 1" in l]
    print(f"Bengkok 1 row count: {len(bengkok_1_rows)}")
    assert len(bengkok_1_rows) > 0, "Bengkok 1 rows not found in CSV!"
    results["export_csv"] = {
        "status": code,
        "content_type": hdrs.get("content-type"),
        "content_disposition": hdrs.get("content-disposition"),
        "has_utf8_bom": body.startswith(b"\xef\xbb\xbf"),
        "total_rows": len(lines),
        "bengkok_1_rows": len(bengkok_1_rows),
        "columns": header_row.split(",")
    }

    # 7. GET /api/reports/download/1
    code, hdrs, body = run_http_request("GET", "/api/reports/download/1")
    print(f"GET /api/reports/download/1: status={code}, length={len(body)}")
    assert code == 200, f"Expected 200, got {code}"
    assert hdrs.get("content-type") == "application/pdf"
    assert body.startswith(b"%PDF-")
    results["archive_download"] = {
        "status": code,
        "size_bytes": len(body),
        "content_disposition": hdrs.get("content-disposition")
    }

    print("=== ALL AUDIT CHECKS PASSED ===")
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    audit()
