"""
Verification test suite for DBG-07 and DBG-08:
- DBG-07: Authentication, RBAC (SUPER_ADMIN, ESTATE_MANAGER, AGRONOMIST, OPERATOR), Token Handling, Admin Routes
- DBG-08: PDF Generation (ReportLab), CSV Export (Telemetry & Operational Costs), Date Range Filters
"""

import io
import json
import os
import sys
import unittest
import urllib.parse
from datetime import date, datetime, timedelta

# Import demo_server components
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
from demo_server import (
    DemoAPIHandler,
    generate_pdf_document,
    generate_timeseries_csv,
    BENGKOK_COORDINATES,
    PLOTS,
    ESTATES,
    CURRENT_USER,
)


class MockWFile(io.BytesIO):
    pass


class MockRFile(io.BytesIO):
    pass


class MockServer:
    pass


class TestDBG07AuthAndRBAC(unittest.TestCase):
    """Verify login form credentials, token handling, and RBAC hierarchy."""

    def _invoke_handler(self, method, path, body_bytes=b"", query_params=None):
        full_path = path
        if query_params:
            full_path += "?" + urllib.parse.urlencode(query_params)

        handler = DemoAPIHandler.__new__(DemoAPIHandler)
        handler.command = method
        handler.path = full_path
        handler.request_version = "HTTP/1.1"
        handler.client_address = ("127.0.0.1", 12345)
        handler.server = MockServer()
        handler.headers = {
            "Content-Length": str(len(body_bytes)),
            "Content-Type": "application/json",
        }
        handler.rfile = MockRFile(body_bytes)
        handler.wfile = MockWFile()

        responses = []
        headers = {}

        def mock_send_response(code, message=None):
            responses.append(code)

        def mock_send_header(k, v):
            headers[k] = v

        def mock_end_headers():
            pass

        handler.send_response = mock_send_response
        handler.send_header = mock_send_header
        handler.end_headers = mock_end_headers

        if method == "POST":
            handler.do_POST()
        elif method == "GET":
            handler.do_GET()
        elif method == "OPTIONS":
            handler.do_OPTIONS()

        raw_output = handler.wfile.getvalue()
        return responses[0] if responses else 200, headers, raw_output

    def test_superadmin_login(self):
        body = json.dumps({"email": "admin@tani.local", "password": "admin123"}).encode("utf-8")
        status, headers, output = self._invoke_handler("POST", "/api/v1/auth/login", body)
        self.assertEqual(status, 200)
        data = json.loads(output.decode("utf-8"))
        self.assertIn("access_token", data)
        self.assertIn("user", data)
        self.assertEqual(data["user"]["role"], "superadmin")

    def test_estate_manager_login(self):
        body = json.dumps({"email": "manager@tani.ag", "password": "managerpass"}).encode("utf-8")
        status, headers, output = self._invoke_handler("POST", "/api/v1/auth/login", body)
        self.assertEqual(status, 200)
        data = json.loads(output.decode("utf-8"))
        self.assertEqual(data["user"]["role"], "estate_manager")

        # Verify /auth/me reflects estate_manager
        status_me, _, out_me = self._invoke_handler("GET", "/api/v1/auth/me")
        me_data = json.loads(out_me.decode("utf-8"))
        self.assertEqual(me_data["role"], "estate_manager")

    def test_agronomist_login(self):
        body = json.dumps({"email": "agronomist@tani.ag", "password": "agronomistpass"}).encode("utf-8")
        status, headers, output = self._invoke_handler("POST", "/api/v1/auth/login", body)
        self.assertEqual(status, 200)
        data = json.loads(output.decode("utf-8"))
        self.assertEqual(data["user"]["role"], "agronomist")

    def test_operator_login(self):
        body = json.dumps({"email": "operator@tani.ag", "password": "operatorpass"}).encode("utf-8")
        status, headers, output = self._invoke_handler("POST", "/api/v1/auth/login", body)
        self.assertEqual(status, 200)
        data = json.loads(output.decode("utf-8"))
        self.assertEqual(data["user"]["role"], "operator")

    def test_logout(self):
        status, headers, output = self._invoke_handler("POST", "/api/v1/auth/logout")
        self.assertEqual(status, 200)
        # Verify /auth/me resets to superadmin
        _, _, out_me = self._invoke_handler("GET", "/api/v1/auth/me")
        me_data = json.loads(out_me.decode("utf-8"))
        self.assertEqual(me_data["role"], "superadmin")

    def test_spatial_import_preview(self):
        status, headers, output = self._invoke_handler("POST", "/api/v1/plots/import-preview")
        self.assertEqual(status, 200)
        data = json.loads(output.decode("utf-8"))
        self.assertEqual(data["name"], "Bengkok 1")
        self.assertEqual(data["format"], "KML")
        self.assertAlmostEqual(data["area_hectares"], 0.37, places=2)
        self.assertGreater(data["vertex_count"], 10)

    def test_spatial_batch_import_preview(self):
        status, headers, output = self._invoke_handler("POST", "/api/v1/plots/batch-import-preview")
        self.assertEqual(status, 200)
        data = json.loads(output.decode("utf-8"))
        self.assertEqual(data["total_plots"], 1)
        self.assertEqual(data["plots"][0]["name"], "Bengkok 1")


class TestDBG08ReportGeneration(unittest.TestCase):
    """Verify ReportLab PDF generation and CSV export endpoints."""

    def _invoke_handler(self, method, path, body_bytes=b"", query_params=None):
        full_path = path
        if query_params:
            full_path += "?" + urllib.parse.urlencode(query_params)

        handler = DemoAPIHandler.__new__(DemoAPIHandler)
        handler.command = method
        handler.path = full_path
        handler.request_version = "HTTP/1.1"
        handler.client_address = ("127.0.0.1", 12345)
        handler.server = MockServer()
        handler.headers = {
            "Content-Length": str(len(body_bytes)),
            "Content-Type": "application/json",
        }
        handler.rfile = MockRFile(body_bytes)
        handler.wfile = MockWFile()

        responses = []
        headers = {}

        def mock_send_response(code, message=None):
            responses.append(code)

        def mock_send_header(k, v):
            headers[k] = v

        def mock_end_headers():
            pass

        handler.send_response = mock_send_response
        handler.send_header = mock_send_header
        handler.end_headers = mock_end_headers

        if method == "POST":
            handler.do_POST()
        elif method == "GET":
            handler.do_GET()

        raw_output = handler.wfile.getvalue()
        return responses[0] if responses else 200, headers, raw_output

    def test_pdf_reportlab_generator(self):
        title = "LAPORAN STATUS LAHAN & INDEKS VEGETASI SATELIT"
        subtitle = "Kebun Bengkok | Evaluasi Operasional"
        rows = [
            ["Petak Lahan", "Status Tanam", "Luas (Ha)", "HST", "Fase", "NDVI Satelit"],
            ["Bengkok 1 (KML)", "Belum Ditanami", "0.37 Ha", "0 HST", "Bera / Olah Tanah", "0.2716"],
        ]
        recom = "Petak Bengkok 1 berstatus bera. Segera lakukan pengolahan tanah."
        pdf_bytes = generate_pdf_document(title, subtitle, rows, recommendation=recom)
        self.assertTrue(len(pdf_bytes) > 500, "PDF bytes should be non-empty")
        self.assertTrue(pdf_bytes.startswith(b"%PDF-"), "File must start with valid PDF magic bytes")

    def test_pdf_endpoint_get_and_post(self):
        # Test GET /api/v1/reports/pdf
        status_get, headers_get, pdf_get = self._invoke_handler(
            "GET", "/api/v1/reports/pdf", query_params={"estate_id": "1", "start_date": "2026-08-01", "end_date": "2026-09-01"}
        )
        self.assertEqual(status_get, 200)
        self.assertEqual(headers_get.get("Content-Type"), "application/pdf")
        self.assertIn("Content-Disposition", headers_get)
        self.assertIn("Access-Control-Expose-Headers", headers_get)
        self.assertTrue(pdf_get.startswith(b"%PDF-"))

        # Test POST /api/v1/reports/pdf
        status_post, headers_post, pdf_post = self._invoke_handler(
            "POST", "/api/v1/reports/pdf", query_params={"estate_id": "1"}
        )
        self.assertEqual(status_post, 200)
        self.assertEqual(headers_post.get("Content-Type"), "application/pdf")
        self.assertTrue(pdf_post.startswith(b"%PDF-"))

    def test_csv_endpoint_get_and_post(self):
        # Test GET /api/v1/reports/csv
        status_get, headers_get, csv_get = self._invoke_handler(
            "GET", "/api/v1/reports/csv", query_params={"estate_id": "1", "start_date": "2026-08-15", "end_date": "2026-09-05"}
        )
        self.assertEqual(status_get, 200)
        self.assertIn("text/csv", headers_get.get("Content-Type", ""))
        self.assertIn("Content-Disposition", headers_get)
        self.assertIn("Access-Control-Expose-Headers", headers_get)

        # Verify UTF-8 BOM
        self.assertTrue(csv_get.startswith(b"\xef\xbb\xbf"), "CSV must start with UTF-8 BOM for Excel compatibility")
        csv_text = csv_get.decode("utf-8-sig")
        lines = csv_text.strip().split("\r\n") if "\r\n" in csv_text else csv_text.strip().split("\n")
        header_cols = lines[0].split(",")
        self.assertIn("Tanggal", header_cols)
        self.assertIn("NDVI", header_cols)
        self.assertIn("SAR_VV_dB", header_cols)
        self.assertIn("Biaya_Tenaga_Kerja_Rp", header_cols)
        self.assertIn("Total_Biaya_Operasional_Rp", header_cols)
        self.assertGreater(len(lines), 5, "CSV should contain filtered date rows")

        # Test POST /api/v1/reports/csv
        status_post, headers_post, csv_post = self._invoke_handler(
            "POST", "/api/v1/reports/csv", query_params={"estate_id": "1"}
        )
        self.assertEqual(status_post, 200)
        self.assertTrue(csv_post.startswith(b"\xef\xbb\xbf"))

    def test_fastapi_reports_api_import(self):
        """Verify FastAPI reports router has /pdf and /csv endpoints."""
        from app.api.reports import router
        route_paths = [route.path for route in router.routes]
        self.assertIn("/reports/pdf", route_paths)
        self.assertIn("/reports/csv", route_paths)


if __name__ == "__main__":
    unittest.main()
