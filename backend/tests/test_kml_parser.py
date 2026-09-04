"""Unit tests for Core KML Parser, GeoJSON Parser, and Geodesic Area Validator (Wave 7)."""

import io
import json
import os
import unittest
import zipfile

from app.utils.kml_parser import (
    SpatialParseError,
    calculate_spherical_polygon_area,
    compute_bounding_box,
    compute_centroid,
    parse_geojson_content,
    parse_kml_content,
    parse_kmz_content,
    parse_spatial_file,
    validate_and_normalize_polygon,
)


class TestKMLParser(unittest.TestCase):
    """Test suite for KML parsing and extraction."""

    def setUp(self):
        # Locate Bengkoxxx1.kml at project root or test fixture path
        self.kml_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "Bengkoxxx1.kml"))
        if not os.path.exists(self.kml_path):
            # Fallback relative to backend cwd
            self.kml_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "Bengkoxxx1.kml"))

    def test_parse_real_bengkok1_kml_file(self):
        """Verify parsing of real Bengkoxxx1.kml fixture."""
        with open(self.kml_path, "r", encoding="utf-8") as f:
            content = f.read()

        result = parse_kml_content(content)

        # 1. Placemark name
        self.assertEqual(result["name"], "Bengkok 1")
        self.assertEqual(result["format"], "KML")
        self.assertTrue(result["is_valid"])

        # 2. Geometry & vertices
        geometry = result["geometry"]
        self.assertEqual(geometry["type"], "Polygon")
        self.assertEqual(len(geometry["coordinates"]), 1)  # 1 exterior ring

        ring = geometry["coordinates"][0]
        self.assertEqual(len(ring), 24)  # 24 vertices
        self.assertEqual(result["vertex_count"], 24)

        # First and last coordinate must be identical
        self.assertEqual(ring[0], ring[-1])

        # 3. Area validation
        self.assertAlmostEqual(result["area_hectares"], 0.3688, places=4)
        self.assertAlmostEqual(result["area_m2"], 3687.7, delta=1.0)

        # 4. Centroid and Bounding Box
        bbox = result["bounding_box"]
        self.assertEqual(len(bbox), 4)
        self.assertTrue(bbox[0] < bbox[2])  # min_lng < max_lng
        self.assertTrue(bbox[1] < bbox[3])  # min_lat < max_lat
        self.assertAlmostEqual(bbox[0], 111.063234, places=4)
        self.assertAlmostEqual(bbox[1], -8.084565, places=4)

        centroid = result["centroid"]
        self.assertAlmostEqual(centroid[0], 111.0636, delta=0.001)
        self.assertAlmostEqual(centroid[1], -8.0843, delta=0.001)

    def test_parse_2d_coordinates_kml(self):
        """Verify KML parser handles 2D (lng,lat) without altitude."""
        kml_2d = """<?xml version="1.0" encoding="UTF-8"?>
        <kml xmlns="http://www.opengis.net/kml/2.2">
          <Placemark>
            <name>Petak Uji 2D</name>
            <Polygon>
              <outerBoundaryIs>
                <LinearRing>
                  <coordinates>
                    107.600,-6.900 107.610,-6.900 107.610,-6.910 107.600,-6.910 107.600,-6.900
                  </coordinates>
                </LinearRing>
              </outerBoundaryIs>
            </Polygon>
          </Placemark>
        </kml>"""
        res = parse_kml_content(kml_2d)
        self.assertEqual(res["name"], "Petak Uji 2D")
        self.assertEqual(len(res["geometry"]["coordinates"][0]), 5)
        self.assertGreater(res["area_hectares"], 100.0)

    def test_fallback_placemark_name_when_missing(self):
        """Verify default name fallback if <name> is missing."""
        kml_no_name = """<?xml version="1.0" encoding="UTF-8"?>
        <kml xmlns="http://www.opengis.net/kml/2.2">
          <Placemark>
            <Polygon>
              <outerBoundaryIs>
                <LinearRing>
                  <coordinates>
                    107.0,-6.0 107.1,-6.0 107.1,-6.1 107.0,-6.1 107.0,-6.0
                  </coordinates>
                </LinearRing>
              </outerBoundaryIs>
            </Polygon>
          </Placemark>
        </kml>"""
        res = parse_kml_content(kml_no_name, default_name="Lahan Sawit")
        self.assertEqual(res["name"], "Lahan Sawit")

    def test_kml_without_polygon_raises_error(self):
        """Verify error is raised if KML contains no polygon geometry."""
        kml_point_only = """<?xml version="1.0" encoding="UTF-8"?>
        <kml xmlns="http://www.opengis.net/kml/2.2">
          <Placemark>
            <name>Titik Pantau</name>
            <Point>
              <coordinates>107.0,-6.0,0</coordinates>
            </Point>
          </Placemark>
        </kml>"""
        with self.assertRaises(SpatialParseError):
            parse_kml_content(kml_point_only)

    def test_empty_or_malformed_xml_raises_error(self):
        """Verify malformed XML raises SpatialParseError."""
        with self.assertRaises(SpatialParseError):
            parse_kml_content("")

        with self.assertRaises(SpatialParseError):
            parse_kml_content("<kml><Placemark><unclosed></kml>")


class TestSpatialValidatorAndGeodesicArea(unittest.TestCase):
    """Test suite for polygon spatial validation and geodesic area calculations (Ticket 02)."""

    def test_auto_close_unclosed_ring(self):
        """Verify an unclosed polygon ring is automatically closed with warning."""
        open_ring = [
            [[107.0, -6.0], [107.01, -6.0], [107.01, -6.01], [107.0, -6.01]]
        ]
        res = validate_and_normalize_polygon(open_ring)
        self.assertTrue(res["is_valid"])
        coords = res["geometry"]["coordinates"][0]
        self.assertEqual(coords[0], coords[-1])
        self.assertEqual(len(coords), 5)
        self.assertTrue(len(res["warnings"]) > 0)

    def test_fewer_than_3_unique_points_fails(self):
        """Verify polygon with less than 3 unique vertices is rejected."""
        invalid_ring = [
            [[107.0, -6.0], [107.01, -6.0], [107.0, -6.0]]
        ]
        res = validate_and_normalize_polygon(invalid_ring)
        self.assertFalse(res["is_valid"])
        self.assertTrue(any("minimal 3 titik koordinat unik" in err for err in res["errors"]))

    def test_out_of_bounds_wgs84_coordinates_fail(self):
        """Verify invalid WGS84 range fails validation."""
        out_of_range = [
            [[195.0, -6.0], [195.1, -6.0], [195.1, -6.1], [195.0, -6.0]]
        ]
        res = validate_and_normalize_polygon(out_of_range)
        self.assertFalse(res["is_valid"])
        self.assertTrue(any("di luar batas WGS84" in err for err in res["errors"]))

    def test_geodesic_area_bengkok1_precision(self):
        """Verify Bengkok 1 coordinates produce 0.3688 Ha (3,687.7 m²)."""
        bengkok1_coords = [
            [111.0632474582804, -8.084179911091981], [111.0632339684623, -8.084224180414317],
            [111.0632401855262, -8.084268499522087], [111.0632725808569, -8.084332470988944],
            [111.0633704820893, -8.084350009632676], [111.063415929682, -8.084338358958956],
            [111.0634698637928, -8.084386061026333], [111.0635063325865, -8.084438263360836],
            [111.0635559282277, -8.084478159557214], [111.0635869829254, -8.08450812176573],
            [111.0636082363482, -8.084560344440284], [111.0636878429106, -8.084565467710309],
            [111.0637462982362, -8.084553049535586], [111.0638206127014, -8.084483298898871],
            [111.0638405677075, -8.084434308746422], [111.0638884461838, -8.084351243965257],
            [111.0640267543814, -8.084230642931377], [111.0640465157794, -8.084143148747065],
            [111.0640694893006, -8.084040850088959], [111.0640333467563, -8.083969725940973],
            [111.0637346955485, -8.084033547650094], [111.0634637628904, -8.084051802423692],
            [111.0633132929326, -8.084082613417486], [111.0632474582804, -8.084179911091981]
        ]
        m2 = calculate_spherical_polygon_area(bengkok1_coords)
        ha = round(m2 / 10000.0, 4)
        self.assertAlmostEqual(ha, 0.3688, places=4)
        self.assertAlmostEqual(m2, 3687.7, delta=1.0)


class TestKMZAndGeoJSONParsing(unittest.TestCase):
    """Test suite for KMZ and GeoJSON import formats."""

    def test_parse_kmz_in_memory(self):
        """Verify extracting and parsing KML from in-memory KMZ zip archive."""
        kml_content = """<?xml version="1.0" encoding="UTF-8"?>
        <kml xmlns="http://www.opengis.net/kml/2.2">
          <Placemark>
            <name>Petak KMZ Arsip</name>
            <Polygon>
              <outerBoundaryIs>
                <LinearRing>
                  <coordinates>
                    110.0,-7.0,0 110.01,-7.0,0 110.01,-7.01,0 110.0,-7.01,0 110.0,-7.0,0
                  </coordinates>
                </LinearRing>
              </outerBoundaryIs>
            </Polygon>
          </Placemark>
        </kml>"""

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("doc.kml", kml_content)

        kmz_bytes = buf.getvalue()
        res = parse_kmz_content(kmz_bytes)
        self.assertEqual(res["name"], "Petak KMZ Arsip")
        self.assertEqual(res["format"], "KMZ")
        self.assertTrue(res["is_valid"])

    def test_parse_geojson_feature(self):
        """Verify parsing GeoJSON Feature object."""
        geojson_data = {
            "type": "Feature",
            "properties": {"name": "Kebun Jagung Blok A"},
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [[111.0, -7.5], [111.02, -7.5], [111.02, -7.52], [111.0, -7.52], [111.0, -7.5]]
                ],
            },
        }
        res = parse_geojson_content(geojson_data)
        self.assertEqual(res["name"], "Kebun Jagung Blok A")
        self.assertEqual(res["format"], "GeoJSON")
        self.assertTrue(res["is_valid"])
        self.assertGreater(res["area_hectares"], 10.0)

    def test_parse_spatial_file_auto_detection(self):
        """Verify parse_spatial_file auto-detects KML, KMZ, and GeoJSON."""
        # GeoJSON detection
        geojson_str = json.dumps({
            "type": "Polygon",
            "coordinates": [[[108.0, -6.8], [108.01, -6.8], [108.01, -6.81], [108.0, -6.8]]]
        })
        res1 = parse_spatial_file(geojson_str, filename="plot.geojson")
        self.assertEqual(res1["format"], "GeoJSON")

        # KML detection
        kml_str = """<kml><Placemark><name>Deteksi KML</name><Polygon><coordinates>108.0,-6.8 108.01,-6.8 108.01,-6.81 108.0,-6.8</coordinates></Polygon></Placemark></kml>"""
        res2 = parse_spatial_file(kml_str, filename="petak.kml")
        self.assertEqual(res2["format"], "KML")
        self.assertEqual(res2["name"], "Deteksi KML")


if __name__ == "__main__":
    unittest.main()
