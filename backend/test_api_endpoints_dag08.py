"""
Test demo_server.py DemoAPIHandler for all DAG-08 REST endpoints.
"""
import io
import json
import os
import sys
import unittest

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from demo_server import DemoAPIHandler


class MockSocket:
    def __init__(self, data=b""):
        self.data = data
        self.output = io.BytesIO()

    def makefile(self, mode, *args, **kwargs):
        if "r" in mode:
            return io.BytesIO(self.data)
        elif "w" in mode or "b" in mode:
            return self.output


class MockRequest(DemoAPIHandler):
    def __init__(self, method: str, path: str, body: bytes = b""):
        self.rfile = io.BytesIO(body)
        self.wfile = io.BytesIO()
        self.command = method
        self.path = path
        self.headers = {"Content-Length": str(len(body)), "Content-Type": "application/json"}
        self.requestline = f"{method} {path} HTTP/1.1"
        self.server_version = "BaseHTTP/0.6"
        self.sys_version = "Python/3.11"
        self.error_code = None
        self.error_message = None
        self.responses_status = None
        self.response_headers = {}

    def send_response(self, code, message=None):
        self.responses_status = code

    def send_header(self, keyword, value):
        self.response_headers[keyword.lower()] = value

    def end_headers(self):
        pass


class TestDemoServerAgronomyEndpoints(unittest.TestCase):

    def test_get_soil_characteristics(self):
        req = MockRequest("GET", "/api/v1/agronomy/soil-characteristics/1")
        req.do_GET()
        self.assertEqual(req.responses_status, 200)
        self.assertEqual(req.response_headers.get("content-type"), "application/json")
        data = json.loads(req.wfile.getvalue().decode("utf-8"))
        self.assertIn("saxton_rawls_hydrology", data)
        self.assertIn("texture", data)

    def test_post_planting_window_simulate(self):
        payload = json.dumps({"plot_id": 1, "candidate_window_days": 10}).encode("utf-8")
        req = MockRequest("POST", "/api/v1/agronomy/planting-window/simulate", body=payload)
        req.do_POST()
        self.assertEqual(req.responses_status, 200)
        data = json.loads(req.wfile.getvalue().decode("utf-8"))
        self.assertIn("optimal_recommendation", data)
        self.assertIn("crops_comparison", data)

    def test_get_water_balance(self):
        req = MockRequest("GET", "/api/v1/agronomy/plots/1/water-balance")
        req.do_GET()
        self.assertEqual(req.responses_status, 200)
        data = json.loads(req.wfile.getvalue().decode("utf-8"))
        self.assertIn("water_balance", data)
        self.assertIn("sluice_schedule", data)

    def test_get_drone_mission_kml(self):
        req = MockRequest("GET", "/api/v1/agronomy/plots/1/drone-mission.kml")
        req.do_GET()
        self.assertEqual(req.responses_status, 200)
        ct = req.response_headers.get("content-type")
        self.assertTrue("application/vnd.google-earth.kml+xml" in ct)
        disp = req.response_headers.get("content-disposition", "")
        self.assertTrue("attachment" in disp and ".kml" in disp)
        kml_content = req.wfile.getvalue().decode("utf-8")
        self.assertIn("<kml xmlns=", kml_content)
        self.assertIn("<coordinates>", kml_content)

    def test_get_vrn(self):
        req = MockRequest("GET", "/api/v1/agronomy/plots/1/vrn")
        req.do_GET()
        self.assertEqual(req.responses_status, 200)
        data = json.loads(req.wfile.getvalue().decode("utf-8"))
        self.assertIn("macro_totals", data)
        self.assertIn("split_applications", data)
        self.assertIn("terrace_tiers_vrn", data)
        self.assertEqual(data["macro_totals"]["urea"]["total_kg"], 92.5)


if __name__ == "__main__":
    suite = unittest.TestLoader().loadTestsFromTestCase(TestDemoServerAgronomyEndpoints)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
