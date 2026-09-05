"""Unit tests for Multi-Placemark KML, KMZ, and GeoJSON Collection Parser (Wave 8 Ticket 02)."""

import io
import json
import os
import unittest
import zipfile

from app.utils.kml_parser import (
    SpatialParseError,
    compute_unified_bounding_box,
    parse_multi_geojson_content,
    parse_multi_kml_content,
    parse_multi_kmz_content,
    parse_multi_spatial_file,
)


class TestMultiKMLParser(unittest.TestCase):
    """Test suite for multi-placemark KML parsing and collection extraction."""

    def setUp(self):
        # Locate Bengkoxxx1.kml at project root or test fixture path
        self.bengkok_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "Bengkoxxx1.kml"))
        if not os.path.exists(self.bengkok_path):
            self.bengkok_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "Bengkoxxx1.kml"))

        # Sample multi-placemark KML with 3 distinct placemarks
        self.multi_kml_3_plots = """<?xml version="1.0" encoding="UTF-8"?>
        <kml xmlns="http://www.opengis.net/kml/2.2">
        <Document>
          <name>Kebun Raya Terpadu</name>
          <Placemark>
            <name>Petak Padi Utara</name>
            <Polygon>
              <outerBoundaryIs>
                <LinearRing>
                  <coordinates>
                    110.400,-7.100 110.410,-7.100 110.410,-7.110 110.400,-7.110 110.400,-7.100
                  </coordinates>
                </LinearRing>
              </outerBoundaryIs>
            </Polygon>
          </Placemark>
          <Placemark>
            <name>Petak Jagung Tengah</name>
            <Polygon>
              <outerBoundaryIs>
                <LinearRing>
                  <coordinates>
                    110.420,-7.120 110.430,-7.120 110.430,-7.130 110.420,-7.130 110.420,-7.120
                  </coordinates>
                </LinearRing>
              </outerBoundaryIs>
            </Polygon>
          </Placemark>
          <Placemark>
            <name>Petak Kedelai Selatan</name>
            <Polygon>
              <outerBoundaryIs>
                <LinearRing>
                  <coordinates>
                    110.440,-7.140 110.450,-7.140 110.450,-7.150 110.440,-7.150 110.440,-7.140
                  </coordinates>
                </LinearRing>
              </outerBoundaryIs>
            </Polygon>
          </Placemark>
        </Document>
        </kml>"""

    def test_multi_placemark_kml_3_plots(self):
        """Verify parsing multi-placemark KML with 3 distinct placemarks."""
        res = parse_multi_kml_content(self.multi_kml_3_plots)

        self.assertEqual(res["format"], "KML")
        self.assertEqual(res["total_plots"], 3)
        self.assertEqual(len(res["plots"]), 3)

        # Placemark names
        names = [p["name"] for p in res["plots"]]
        self.assertEqual(names, ["Petak Padi Utara", "Petak Jagung Tengah", "Petak Kedelai Selatan"])

        # Check plot properties
        for plot in res["plots"]:
            self.assertTrue(plot["is_valid"])
            self.assertEqual(plot["geometry"]["type"], "Polygon")
            self.assertGreater(plot["area_hectares"], 0.0)
            self.assertGreater(plot["area_m2"], 0.0)
            self.assertEqual(plot["vertex_count"], 5)
            self.assertEqual(len(plot["bounding_box"]), 4)
            self.assertEqual(len(plot["centroid"]), 2)

        # Check total area is sum of individual plot areas
        expected_total_ha = round(sum(p["area_hectares"] for p in res["plots"]), 4)
        expected_total_m2 = round(sum(p["area_m2"] for p in res["plots"]), 2)
        self.assertAlmostEqual(res["total_area_hectares"], expected_total_ha, places=4)
        self.assertAlmostEqual(res["total_area_m2"], expected_total_m2, places=2)

        # Check unified bounding box covers all 3 polygons
        bbox = res["unified_bounding_box"]
        self.assertEqual(len(bbox), 4)
        self.assertAlmostEqual(bbox[0], 110.400, places=3)  # min_lng
        self.assertAlmostEqual(bbox[1], -7.150, places=3)  # min_lat
        self.assertAlmostEqual(bbox[2], 110.450, places=3)  # max_lng
        self.assertAlmostEqual(bbox[3], -7.100, places=3)  # max_lat

        for plot in res["plots"]:
            p_bbox = plot["bounding_box"]
            self.assertGreaterEqual(p_bbox[0], bbox[0])
            self.assertGreaterEqual(p_bbox[1], bbox[1])
            self.assertLessEqual(p_bbox[2], bbox[2])
            self.assertLessEqual(p_bbox[3], bbox[3])

    def test_multi_feature_geojson_collection(self):
        """Verify parsing GeoJSON FeatureCollection with multiple polygon features."""
        geojson_data = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"name": "Blok Cabai A"},
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                            [[112.00, -7.50], [112.01, -7.50], [112.01, -7.51], [112.00, -7.51], [112.00, -7.50]]
                        ],
                    },
                },
                {
                    "type": "Feature",
                    "properties": {"title": "Blok Bawang B"},
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                            [[112.02, -7.52], [112.04, -7.52], [112.04, -7.54], [112.02, -7.54], [112.02, -7.52]]
                        ],
                    },
                },
            ],
        }

        res = parse_multi_geojson_content(geojson_data)

        self.assertEqual(res["format"], "GeoJSON")
        self.assertEqual(res["total_plots"], 2)
        self.assertEqual(len(res["plots"]), 2)
        self.assertEqual(res["plots"][0]["name"], "Blok Cabai A")
        self.assertEqual(res["plots"][1]["name"], "Blok Bawang B")

        # Verify area calculations
        expected_ha = round(sum(p["area_hectares"] for p in res["plots"]), 4)
        expected_m2 = round(sum(p["area_m2"] for p in res["plots"]), 2)
        self.assertAlmostEqual(res["total_area_hectares"], expected_ha, places=4)
        self.assertAlmostEqual(res["total_area_m2"], expected_m2, places=2)

        # Verify unified bbox
        bbox = res["unified_bounding_box"]
        self.assertAlmostEqual(bbox[0], 112.00, places=2)
        self.assertAlmostEqual(bbox[1], -7.54, places=2)
        self.assertAlmostEqual(bbox[2], 112.04, places=2)
        self.assertAlmostEqual(bbox[3], -7.50, places=2)

    def test_sequential_naming_fallback_when_name_missing(self):
        """Verify sequential naming (Petak 1, Petak 2, ...) when names are absent."""
        kml_unnamed = """<?xml version="1.0" encoding="UTF-8"?>
        <kml xmlns="http://www.opengis.net/kml/2.2">
        <Document>
          <Placemark>
            <Polygon>
              <outerBoundaryIs>
                <LinearRing>
                  <coordinates>107.0,-6.0 107.01,-6.0 107.01,-6.01 107.0,-6.01 107.0,-6.0</coordinates>
                </LinearRing>
              </outerBoundaryIs>
            </Polygon>
          </Placemark>
          <Placemark>
            <name>Petak Khusus Bernama</name>
            <Polygon>
              <outerBoundaryIs>
                <LinearRing>
                  <coordinates>107.02,-6.0 107.03,-6.0 107.03,-6.01 107.02,-6.01 107.02,-6.0</coordinates>
                </LinearRing>
              </outerBoundaryIs>
            </Polygon>
          </Placemark>
          <Placemark>
            <Polygon>
              <outerBoundaryIs>
                <LinearRing>
                  <coordinates>107.04,-6.0 107.05,-6.0 107.05,-6.01 107.04,-6.01 107.04,-6.0</coordinates>
                </LinearRing>
              </outerBoundaryIs>
            </Polygon>
          </Placemark>
        </Document>
        </kml>"""

        res = parse_multi_kml_content(kml_unnamed, default_name="Lahan")
        self.assertEqual(res["total_plots"], 3)
        self.assertEqual(res["plots"][0]["name"], "Lahan 1")
        self.assertEqual(res["plots"][1]["name"], "Petak Khusus Bernama")
        self.assertEqual(res["plots"][2]["name"], "Lahan 3")

    def test_single_placemark_kml_returns_one_plot(self):
        """Verify single-placemark KML still works with multi parser and returns total_plots: 1."""
        if os.path.exists(self.bengkok_path):
            with open(self.bengkok_path, "r", encoding="utf-8") as f:
                content = f.read()
            res = parse_multi_spatial_file(content, filename="Bengkoxxx1.kml")
            self.assertEqual(res["format"], "KML")
            self.assertEqual(res["total_plots"], 1)
            self.assertEqual(len(res["plots"]), 1)
            self.assertEqual(res["plots"][0]["name"], "Bengkok 1")
            self.assertAlmostEqual(res["total_area_hectares"], 0.3688, places=4)
            self.assertEqual(res["unified_bounding_box"], res["plots"][0]["bounding_box"])

    def test_multi_kmz_archive_with_nested_folders(self):
        """Verify parsing KMZ archive containing multiple KML files or nested folders."""
        kml_sub1 = """<?xml version="1.0" encoding="UTF-8"?>
        <kml xmlns="http://www.opengis.net/kml/2.2">
          <Placemark>
            <name>Petak Sub 1</name>
            <Polygon>
              <outerBoundaryIs>
                <LinearRing>
                  <coordinates>109.0,-7.0 109.01,-7.0 109.01,-7.01 109.0,-7.01 109.0,-7.0</coordinates>
                </LinearRing>
              </outerBoundaryIs>
            </Polygon>
          </Placemark>
        </kml>"""

        kml_sub2 = """<?xml version="1.0" encoding="UTF-8"?>
        <kml xmlns="http://www.opengis.net/kml/2.2">
          <Placemark>
            <name>Petak Sub 2</name>
            <Polygon>
              <outerBoundaryIs>
                <LinearRing>
                  <coordinates>109.02,-7.0 109.03,-7.0 109.03,-7.01 109.02,-7.01 109.02,-7.0</coordinates>
                </LinearRing>
              </outerBoundaryIs>
            </Polygon>
          </Placemark>
        </kml>"""

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("doc.kml", kml_sub1)
            zf.writestr("nested/folder/layer2.kml", kml_sub2)

        kmz_bytes = buf.getvalue()
        res = parse_multi_spatial_file(kmz_bytes, filename="composite.kmz")

        self.assertEqual(res["format"], "KMZ")
        self.assertEqual(res["total_plots"], 2)
        names = [p["name"] for p in res["plots"]]
        self.assertIn("Petak Sub 1", names)
        self.assertIn("Petak Sub 2", names)
        self.assertGreater(res["total_area_hectares"], 0.0)

    def test_geojson_multipolygon_support(self):
        """Verify MultiPolygon geometries in GeoJSON are properly parsed into individual plots."""
        multi_poly_geojson = {
            "type": "Feature",
            "properties": {"name": "Blok Terpisah"},
            "geometry": {
                "type": "MultiPolygon",
                "coordinates": [
                    [[[108.0, -6.5], [108.01, -6.5], [108.01, -6.51], [108.0, -6.51], [108.0, -6.5]]],
                    [[[108.02, -6.5], [108.03, -6.5], [108.03, -6.51], [108.02, -6.51], [108.02, -6.5]]],
                ],
            },
        }

        res = parse_multi_geojson_content(multi_poly_geojson)
        self.assertEqual(res["total_plots"], 2)
        self.assertEqual(res["plots"][0]["name"], "Blok Terpisah 1")
        self.assertEqual(res["plots"][1]["name"], "Blok Terpisah 2")

    def test_kml_points_lines_ignored_and_polygons_extracted(self):
        """Verify points and line placemarks are ignored while polygon placemarks are extracted."""
        mixed_kml = """<?xml version="1.0" encoding="UTF-8"?>
        <kml xmlns="http://www.opengis.net/kml/2.2">
        <Document>
          <Placemark>
            <name>Titik Pos Jaga</name>
            <Point><coordinates>110.0,-7.0,0</coordinates></Point>
          </Placemark>
          <Placemark>
            <name>Petak Valid</name>
            <Polygon>
              <outerBoundaryIs>
                <LinearRing>
                  <coordinates>110.0,-7.0 110.01,-7.0 110.01,-7.01 110.0,-7.01 110.0,-7.0</coordinates>
                </LinearRing>
              </outerBoundaryIs>
            </Polygon>
          </Placemark>
          <Placemark>
            <name>Jalur Irigasi</name>
            <LineString><coordinates>110.0,-7.0 110.01,-7.01</coordinates></LineString>
          </Placemark>
        </Document>
        </kml>"""

        res = parse_multi_kml_content(mixed_kml)
        self.assertEqual(res["total_plots"], 1)
        self.assertEqual(res["plots"][0]["name"], "Petak Valid")

    def test_error_on_empty_or_whitespace_file(self):
        """Verify empty file raises SpatialParseError."""
        with self.assertRaises(SpatialParseError):
            parse_multi_kml_content("")

        with self.assertRaises(SpatialParseError):
            parse_multi_spatial_file(b"   ")

        with self.assertRaises(SpatialParseError):
            parse_multi_geojson_content("")

    def test_error_when_only_points_or_lines_without_polygons(self):
        """Verify file with only points or lines raises SpatialParseError."""
        kml_no_poly = """<?xml version="1.0" encoding="UTF-8"?>
        <kml xmlns="http://www.opengis.net/kml/2.2">
          <Placemark>
            <name>Pohon Randu</name>
            <Point><coordinates>110.123,-7.456,0</coordinates></Point>
          </Placemark>
          <Placemark>
            <name>Jalan Setapak</name>
            <LineString><coordinates>110.1,-7.4 110.2,-7.5</coordinates></LineString>
          </Placemark>
        </kml>"""

        with self.assertRaises(SpatialParseError) as ctx:
            parse_multi_spatial_file(kml_no_poly, filename="points.kml")
        self.assertIn("Berkas tidak memuat poligon petak lahan yang valid", str(ctx.exception))

        geojson_points_only = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"name": "Sensor 1"},
                    "geometry": {"type": "Point", "coordinates": [110.1, -7.2]},
                }
            ],
        }
        with self.assertRaises(SpatialParseError) as ctx2:
            parse_multi_geojson_content(geojson_points_only)
        self.assertIn("Berkas tidak memuat poligon petak lahan yang valid", str(ctx2.exception))


if __name__ == "__main__":
    unittest.main()
