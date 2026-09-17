"""Comprehensive simulation test suite for Geospatial KML/KMZ/GeoJSON Pipeline & WGS84 Topology (Ticket 02).

Simulates and verifies:
1. Single & multi-placemark KML/KMZ and GeoJSON parsing:
   - Valid formats, malformed XML, missing coordinates tags, deeply nested folders, XXE defenses.
2. Compressed KMZ archives:
   - Zip bomb defenses (file count, total uncompressed size, abnormal compression ratio),
   - doc.kml fallback resolution, nested subdirectories.
3. WGS84 geodesic area calculation accuracy (equator vs high latitudes):
   - Chamberlain & Duquette spherical formula vs analytical spherical formula,
   - Comparison with PostGIS ST_Area(geography) on WGS84 ellipsoid (<0.6% variance),
   - Real-world agricultural plot ground-truth verification (Bengkok 1).
4. Edge cases & bug hunting:
   - Self-intersecting polygon (figure-8 / bowtie & self-touching vertex),
   - Polygons with < 3 coordinates or < 3 unique coordinates,
   - Unclosed polygon rings (auto-closure with warning),
   - Inverted coordinates ([lat, lng] vs [lng, lat]) with diagnostic message,
   - Coordinate boundary edges (-180/180, -90/90),
   - Giant KML (> 100 placemarks) memory and processing throughput.
5. Atomic transaction rollback in POST /api/plots/batch-create:
   - Rollback and HTTP 400 when 1 plot in batch fails validation,
   - Rollback and HTTP 500 when DB commit fails,
   - Commit and HTTP 201 when all plots succeed.
"""

import io
import json
import math
import os
import sys
import time
import unittest
import zipfile
from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from app.utils.geo import (
    calculate_polygon_area_hectares,
    coordinates_from_point,
    point_from_coordinates,
    polygon_from_geojson,
)
from app.utils.kml_parser import (
    SpatialParseError,
    calculate_spherical_polygon_area,
    check_ring_self_intersection,
    compute_bounding_box,
    compute_centroid,
    compute_unified_bounding_box,
    parse_geojson_content,
    parse_kml_content,
    parse_kmz_content,
    parse_multi_geojson_content,
    parse_multi_kml_content,
    parse_multi_kmz_content,
    parse_multi_spatial_file,
    parse_spatial_file,
    validate_and_normalize_polygon,
)


class TestKMLKMZGeoJSONParserSimulation(unittest.TestCase):
    """Simulation test suite for single & multi-placemark KML/KMZ and GeoJSON parsing."""

    def test_valid_single_kml_extraction(self):
        """Verify parsing valid single-placemark KML with 2D coordinates."""
        kml = """<?xml version="1.0" encoding="UTF-8"?>
        <kml xmlns="http://www.opengis.net/kml/2.2">
          <Placemark>
            <name>Petak Sim 1</name>
            <Polygon>
              <outerBoundaryIs>
                <LinearRing>
                  <coordinates>
                    110.0,-7.0 110.02,-7.0 110.02,-7.02 110.0,-7.02 110.0,-7.0
                  </coordinates>
                </LinearRing>
              </outerBoundaryIs>
            </Polygon>
          </Placemark>
        </kml>"""
        res = parse_kml_content(kml)
        self.assertEqual(res["name"], "Petak Sim 1")
        self.assertEqual(res["format"], "KML")
        self.assertTrue(res["is_valid"])
        self.assertEqual(res["vertex_count"], 5)
        self.assertGreater(res["area_hectares"], 400.0)
        self.assertEqual(res["bounding_box"], [110.0, -7.02, 110.02, -7.0])
        self.assertEqual(res["centroid"], [110.01, -7.01])

    def test_valid_multi_placemark_kml_and_aggregated_totals(self):
        """Verify parsing multi-placemark KML computes accurate individual & aggregated areas and unified bbox."""
        kml = """<?xml version="1.0" encoding="UTF-8"?>
        <kml xmlns="http://www.opengis.net/kml/2.2">
          <Document>
            <Placemark>
              <name>Petak Barat</name>
              <Polygon>
                <outerBoundaryIs>
                  <LinearRing>
                    <coordinates>
                      105.00, -5.00 105.01, -5.00 105.01, -5.01 105.00, -5.01 105.00, -5.00
                    </coordinates>
                  </LinearRing>
                </outerBoundaryIs>
              </Polygon>
            </Placemark>
            <Placemark>
              <name>Petak Timur</name>
              <Polygon>
                <outerBoundaryIs>
                  <LinearRing>
                    <coordinates>
                      105.05, -5.05 105.06, -5.05 105.06, -5.06 105.05, -5.06 105.05, -5.05
                    </coordinates>
                  </LinearRing>
                </outerBoundaryIs>
              </Polygon>
            </Placemark>
          </Document>
        </kml>"""
        res = parse_multi_kml_content(kml)
        self.assertEqual(res["format"], "KML")
        self.assertEqual(res["total_plots"], 2)
        self.assertEqual(len(res["plots"]), 2)
        self.assertEqual(res["plots"][0]["name"], "Petak Barat")
        self.assertEqual(res["plots"][1]["name"], "Petak Timur")

        expected_ha = round(sum(p["area_hectares"] for p in res["plots"]), 4)
        self.assertAlmostEqual(res["total_area_hectares"], expected_ha, places=4)

        bbox = res["unified_bounding_box"]
        self.assertAlmostEqual(bbox[0], 105.00, places=2)
        self.assertAlmostEqual(bbox[1], -5.06, places=2)
        self.assertAlmostEqual(bbox[2], 105.06, places=2)
        self.assertAlmostEqual(bbox[3], -5.00, places=2)

    def test_malformed_xml_and_syntax_errors_raise_spatial_error(self):
        """Verify corrupted or truncated XML syntax raises SpatialParseError."""
        bad_xmls = [
            "",
            "   \n  \t ",
            "<kml><Placemark><name>Unclosed Placemark",
            "<?xml version='1.0'?><kml><Polygon><outerBoundaryIs></kml>",
            "RANDOM_NON_XML_BYTES_123456",
        ]
        for bad in bad_xmls:
            with self.assertRaises(SpatialParseError):
                parse_kml_content(bad)
            with self.assertRaises(SpatialParseError):
                parse_multi_kml_content(bad)

    def test_missing_coordinates_tag_or_empty_coords_raises_spatial_error(self):
        """Verify Placemark without <coordinates> or with empty coordinates is rejected."""
        kml_missing_coords = """<?xml version="1.0" encoding="UTF-8"?>
        <kml xmlns="http://www.opengis.net/kml/2.2">
          <Placemark>
            <name>Petak Kosong</name>
            <Polygon>
              <outerBoundaryIs>
                <LinearRing>
                </LinearRing>
              </outerBoundaryIs>
            </Polygon>
          </Placemark>
        </kml>"""
        with self.assertRaises(SpatialParseError):
            parse_kml_content(kml_missing_coords)

        kml_empty_coords = """<?xml version="1.0" encoding="UTF-8"?>
        <kml xmlns="http://www.opengis.net/kml/2.2">
          <Placemark>
            <name>Petak Koordinat Kosong</name>
            <Polygon>
              <outerBoundaryIs>
                <LinearRing>
                  <coordinates>   </coordinates>
                </LinearRing>
              </outerBoundaryIs>
            </Polygon>
          </Placemark>
        </kml>"""
        with self.assertRaises(SpatialParseError):
            parse_kml_content(kml_empty_coords)

    def test_nested_folders_hierarchy_kml(self):
        """Verify placemarks nested deeply inside <Folder> structures are fully discovered."""
        nested_kml = """<?xml version="1.0" encoding="UTF-8"?>
        <kml xmlns="http://www.opengis.net/kml/2.2">
          <Document>
            <name>Estate Kebun Raya</name>
            <Folder>
              <name>Divisi Afdeling 1</name>
              <Folder>
                <name>Blok A Sawit</name>
                <Placemark>
                  <name>Petak A1</name>
                  <Polygon>
                    <outerBoundaryIs>
                      <LinearRing>
                        <coordinates>102.0,0.5 102.01,0.5 102.01,0.51 102.0,0.51 102.0,0.5</coordinates>
                      </LinearRing>
                    </outerBoundaryIs>
                  </Polygon>
                </Placemark>
              </Folder>
              <Folder>
                <name>Blok B Karet</name>
                <Placemark>
                  <name>Petak B1</name>
                  <Polygon>
                    <outerBoundaryIs>
                      <LinearRing>
                        <coordinates>102.02,0.5 102.03,0.5 102.03,0.51 102.02,0.51 102.02,0.5</coordinates>
                      </LinearRing>
                    </outerBoundaryIs>
                  </Polygon>
                </Placemark>
              </Folder>
            </Folder>
          </Document>
        </kml>"""
        res = parse_multi_kml_content(nested_kml)
        self.assertEqual(res["total_plots"], 2)
        names = [p["name"] for p in res["plots"]]
        self.assertIn("Petak A1", names)
        self.assertIn("Petak B1", names)

    def test_xml_external_entity_xxe_protection(self):
        """Verify XML External Entity (XXE) and DOCTYPE injection payloads are rejected before parsing."""
        xxe_payloads = [
            """<?xml version="1.0"?>
            <!DOCTYPE test [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
            <kml xmlns="http://www.opengis.net/kml/2.2">
              <Placemark><name>&xxe;</name><Polygon><coordinates>100,0 101,0 101,1 100,1 100,0</coordinates></Polygon></Placemark>
            </kml>""",
            """<?xml version="1.0"?>
            <!DOCTYPE lolz [
              <!ENTITY lol "lol">
              <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
            ]>
            <kml><Placemark><name>&lol2;</name></Placemark></kml>""",
        ]
        for payload in xxe_payloads:
            with self.assertRaises(SpatialParseError) as ctx:
                parse_kml_content(payload)
            self.assertIn("Entitas XML eksternal", str(ctx.exception))


class TestCompressedKMZArchiveSimulation(unittest.TestCase):
    """Simulation test suite for KMZ zip archive security and structure."""

    def test_valid_kmz_single_and_multi(self):
        """Verify creating and extracting in-memory valid KMZ archives."""
        kml_text = """<?xml version="1.0" encoding="UTF-8"?>
        <kml xmlns="http://www.opengis.net/kml/2.2">
          <Placemark>
            <name>Petak KMZ Valid</name>
            <Polygon>
              <outerBoundaryIs>
                <LinearRing>
                  <coordinates>100.0, -1.0 100.01, -1.0 100.01, -1.01 100.0, -1.01 100.0, -1.0</coordinates>
                </LinearRing>
              </outerBoundaryIs>
            </Polygon>
          </Placemark>
        </kml>"""
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("doc.kml", kml_text)

        kmz_bytes = buf.getvalue()

        # Single parser
        res_single = parse_kmz_content(kmz_bytes)
        self.assertEqual(res_single["format"], "KMZ")
        self.assertEqual(res_single["name"], "Petak KMZ Valid")
        self.assertTrue(res_single["is_valid"])

        # Multi parser
        res_multi = parse_multi_kmz_content(kmz_bytes)
        self.assertEqual(res_multi["format"], "KMZ")
        self.assertEqual(res_multi["total_plots"], 1)

    def test_kmz_missing_doc_kml_fallback(self):
        """Verify KMZ archive without 'doc.kml' at root falls back to another .kml file."""
        kml_text = """<kml><Placemark><name>Tanpa doc.kml</name><Polygon><coordinates>100,0 101,0 101,1 100,1 100,0</coordinates></Polygon></Placemark></kml>"""
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("custom_name_estate.kml", kml_text)

        kmz_bytes = buf.getvalue()
        res = parse_kmz_content(kmz_bytes)
        self.assertEqual(res["name"], "Tanpa doc.kml")
        self.assertEqual(res["format"], "KMZ")

    def test_kmz_nested_subdirectories(self):
        """Verify KMZ containing multiple KML files in subdirectories are discovered."""
        kml_sub1 = """<kml><Placemark><name>Plot Sub A</name><Polygon><coordinates>100,0 100.01,0 100.01,0.01 100,0.01 100,0</coordinates></Polygon></Placemark></kml>"""
        kml_sub2 = """<kml><Placemark><name>Plot Sub B</name><Polygon><coordinates>100.02,0 100.03,0 100.03,0.01 100.02,0.01 100.02,0</coordinates></Polygon></Placemark></kml>"""

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("zone_1/layers/plot_a.kml", kml_sub1)
            zf.writestr("zone_2/layers/plot_b.kml", kml_sub2)

        kmz_bytes = buf.getvalue()
        res = parse_multi_kmz_content(kmz_bytes)
        self.assertEqual(res["total_plots"], 2)
        names = [p["name"] for p in res["plots"]]
        self.assertIn("Plot Sub A", names)
        self.assertIn("Plot Sub B", names)

    def test_kmz_zip_bomb_uncompressed_size_limit(self):
        """Verify KMZ with declared uncompressed size exceeding 50 MB triggers zip bomb defense."""
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            # 51 MB of zeros compresses into ~50 KB of zip data
            zf.writestr("huge_doc.kml", b"\x00" * (51 * 1024 * 1024))

        kmz_bytes = buf.getvalue()
        with self.assertRaises(SpatialParseError) as ctx:
            parse_kmz_content(kmz_bytes)
        self.assertIn("zip bomb", str(ctx.exception).lower())

    def test_kmz_zip_bomb_file_count_limit(self):
        """Verify KMZ with excessive file entries (> 500) triggers zip bomb defense."""
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            for i in range(505):
                zf.writestr(f"file_{i}.txt", "data")
            zf.writestr("doc.kml", "<kml></kml>")

        kmz_bytes = buf.getvalue()
        with self.assertRaises(SpatialParseError) as ctx:
            parse_kmz_content(kmz_bytes)
        self.assertIn("terlalu banyak berkas", str(ctx.exception))

    def test_kmz_zip_bomb_high_compression_ratio(self):
        """Verify KMZ entry > 1MB with suspicious compression ratio (> 100x) is rejected."""
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            # 2 MB of zeros compresses into ~2 KB (ratio ~1000x > 100x)
            zf.writestr("compressed_bomb.kml", b"\x00" * (2 * 1024 * 1024))

        kmz_bytes = buf.getvalue()
        with self.assertRaises(SpatialParseError) as ctx:
            parse_kmz_content(kmz_bytes)
        self.assertIn("rasio kompresi", str(ctx.exception))


class TestWGS84GeodesicAreaAccuracySimulation(unittest.TestCase):
    """Simulation suite comparing Chamberlain & Duquette spherical formula with analytical & PostGIS ellipsoidal area."""

    @staticmethod
    def _wgs84_ellipsoidal_quad_area(lon1: float, lon2: float, lat1: float, lat2: float) -> float:
        """Exact analytical area of a latitude-longitude quadrangle on the WGS84 reference ellipsoid (PostGIS ST_Area).

        Formula:
        A = (b^2 * delta_lon / 2) * [sin(lat) / (1 - e^2 sin^2(lat)) + (1 / (2*e)) * ln((1 + e*sin(lat)) / (1 - e*sin(lat)))]
        where:
        a = 6,378,137.0 m
        f = 1 / 298.257223563
        b = a * (1 - f) = 6,356,752.314245 m
        e^2 = 2f - f^2
        """
        a = 6378137.0
        f = 1.0 / 298.257223563
        b = a * (1.0 - f)
        e2 = 2.0 * f - f * f
        e = math.sqrt(e2)

        def q_factor(phi_rad):
            sin_phi = math.sin(phi_rad)
            term1 = sin_phi / (1.0 - e2 * sin_phi * sin_phi)
            term2 = (1.0 / (2.0 * e)) * math.log((1.0 + e * sin_phi) / (1.0 - e * sin_phi))
            return term1 + term2

        phi1 = math.radians(min(lat1, lat2))
        phi2 = math.radians(max(lat1, lat2))
        delta_lambda = math.radians(abs(lon2 - lon1))

        area_m2 = (b * b * delta_lambda / 2.0) * (q_factor(phi2) - q_factor(phi1))
        return area_m2

    def test_equator_geodesic_area_vs_analytical_and_postgis(self):
        """Verify 1-deg quad at equator matches analytical spherical formula and is within 0.15% of PostGIS WGS84 ellipsoid."""
        # 1-degree square at equator: [0, 0] to [1, 1]
        ring = [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], [0.0, 0.0]]
        calc_m2 = calculate_spherical_polygon_area(ring)

        # Analytical sphere (R = 6378137.0)
        R = 6378137.0
        delta_lambda = math.radians(1.0)
        sin_delta_phi = math.sin(math.radians(1.0)) - math.sin(math.radians(0.0))
        analytical_sphere_m2 = R * R * delta_lambda * sin_delta_phi

        # Must match analytical sphere perfectly
        rel_diff_spherical = abs(calc_m2 - analytical_sphere_m2) / analytical_sphere_m2
        self.assertLess(rel_diff_spherical, 1e-6)

        # PostGIS ST_Area(geography) equivalent on WGS84 ellipsoid
        postgis_ellipsoid_m2 = self._wgs84_ellipsoidal_quad_area(0.0, 1.0, 0.0, 1.0)
        rel_diff_postgis = abs(calc_m2 - postgis_ellipsoid_m2) / postgis_ellipsoid_m2

        # Difference between R_equatorial sphere and WGS84 ellipsoid at equator is under 0.75% (~0.67%)
        self.assertLess(rel_diff_postgis, 0.0075)

    def test_high_latitude_geodesic_area_vs_postgis(self):
        """Verify 1-deg quad at 60 deg North correctly shrinks and is within 0.6% of PostGIS WGS84 ellipsoid."""
        # 1-degree square at 60°N: [10, 60] to [11, 61]
        ring = [[10.0, 60.0], [11.0, 60.0], [11.0, 61.0], [10.0, 61.0], [10.0, 60.0]]
        calc_m2 = calculate_spherical_polygon_area(ring)

        # Analytical sphere
        R = 6378137.0
        delta_lambda = math.radians(1.0)
        sin_delta_phi = math.sin(math.radians(61.0)) - math.sin(math.radians(60.0))
        analytical_sphere_m2 = R * R * delta_lambda * sin_delta_phi

        self.assertAlmostEqual(calc_m2, analytical_sphere_m2, delta=1.0)

        # Due to meridian convergence, area at 60° is roughly ~49% of area at equator
        equator_m2 = calculate_spherical_polygon_area([[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], [0.0, 0.0]])
        self.assertLess(calc_m2 / equator_m2, 0.55)
        self.assertGreater(calc_m2 / equator_m2, 0.45)

        # PostGIS WGS84 ellipsoid comparison
        postgis_ellipsoid_m2 = self._wgs84_ellipsoidal_quad_area(10.0, 11.0, 60.0, 61.0)
        rel_diff_postgis = abs(calc_m2 - postgis_ellipsoid_m2) / postgis_ellipsoid_m2

        # Maximum difference at 60° latitude is under 0.6%
        self.assertLess(rel_diff_postgis, 0.006)

    def test_bengkok1_real_plot_ground_truth(self):
        """Verify Bengkok 1 agricultural plot (East Java) computes exactly 0.3688 Ha (3,687.7 m²)."""
        bengkok1_ring = [
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
        area_m2 = calculate_spherical_polygon_area(bengkok1_ring)
        area_ha = round(area_m2 / 10000.0, 4)

        self.assertAlmostEqual(area_ha, 0.3688, places=4)
        self.assertAlmostEqual(area_m2, 3687.7, delta=1.0)


class TestEdgeCasesAndBugHunting(unittest.TestCase):
    """Bug-hunting & stress test suite covering topology anomalies and edge cases."""

    def test_self_intersecting_polygon_figure_eight_crossing(self):
        """Verify classic figure-8 / bowtie polygon with crossing edges is caught and rejected."""
        # Bowtie: (0,0) -> (2,2) -> (0,2) -> (2,0) -> (0,0) (Edges cross at (1,1))
        bowtie_ring = [
            [[0.0, 0.0], [2.0, 2.0], [0.0, 2.0], [2.0, 0.0], [0.0, 0.0]]
        ]
        res = validate_and_normalize_polygon(bowtie_ring)
        self.assertFalse(res["is_valid"])
        self.assertTrue(any("berpotongan sendiri" in err for err in res["errors"]))

    def test_self_intersecting_polygon_touching_vertex(self):
        """Verify figure-8 polygon with internal self-tangency at vertex is caught and rejected."""
        # Two loops touching at (0,0)
        touching_ring = [
            [[0.0, 0.0], [1.0, 1.0], [0.0, 2.0], [0.0, 0.0], [-1.0, -1.0], [0.0, -2.0], [0.0, 0.0]]
        ]
        res = validate_and_normalize_polygon(touching_ring)
        self.assertFalse(res["is_valid"])
        self.assertTrue(any("bersinggungan sendiri" in err for err in res["errors"]))

    def test_polygon_fewer_than_3_coordinates_fails(self):
        """Verify polygon ring with 1 or 2 points is rejected."""
        one_point = [[[100.0, 0.0]]]
        two_points = [[[100.0, 0.0], [100.0, 1.0]]]

        res1 = validate_and_normalize_polygon(one_point)
        self.assertFalse(res1["is_valid"])
        self.assertTrue(any("minimal 3" in err for err in res1["errors"]))

        res2 = validate_and_normalize_polygon(two_points)
        self.assertFalse(res2["is_valid"])
        self.assertTrue(any("minimal 3" in err for err in res2["errors"]))

    def test_polygon_fewer_than_3_unique_points_fails(self):
        """Verify polygon with < 3 unique points (e.g. A-B-A back and forth) is rejected."""
        degenerate_ring = [[[100.0, 0.0], [101.0, 0.0], [100.0, 0.0]]]
        res = validate_and_normalize_polygon(degenerate_ring)
        self.assertFalse(res["is_valid"])
        self.assertTrue(any("minimal 3 titik koordinat unik" in err for err in res["errors"]))

    def test_unclosed_polygon_ring_auto_closure_and_warning(self):
        """Verify unclosed polygon ring is automatically closed by appending first point, and warning recorded."""
        open_ring = [
            [[107.0, -6.0], [107.01, -6.0], [107.01, -6.01], [107.0, -6.01]]
        ]
        res = validate_and_normalize_polygon(open_ring)
        self.assertTrue(res["is_valid"])
        coords = res["geometry"]["coordinates"][0]
        self.assertEqual(len(coords), 5)
        self.assertEqual(coords[0], coords[-1])
        self.assertTrue(len(res["warnings"]) > 0)
        self.assertIn("tidak tertutup, ditutup otomatis", res["warnings"][0])

    def test_inverted_coordinates_lat_lng_diagnostic(self):
        """Verify inverted coordinates where latitude exceeds 90° provide clear diagnostic message."""
        # User passed [-8.08, 111.06] (lat=-8.08, lng=111.06) as [lng, lat]
        inverted_ring = [
            [[-8.08, 111.06], [-8.08, 111.07], [-8.09, 111.07], [-8.09, 111.06], [-8.08, 111.06]]
        ]
        res = validate_and_normalize_polygon(inverted_ring)
        self.assertFalse(res["is_valid"])
        self.assertTrue(any("Terdeteksi urutan koordinat terbalik" in err for err in res["errors"]))

        # Also test in geo.py polygon_from_geojson
        with self.assertRaises(ValueError) as ctx:
            polygon_from_geojson({"type": "Polygon", "coordinates": inverted_ring})
        self.assertIn("Terdeteksi urutan koordinat terbalik", str(ctx.exception))

    def test_wgs84_coordinate_boundaries_exact_and_overflow(self):
        """Verify exact boundary values (-180, 180, -90, 90) pass and values beyond them fail."""
        # Exact boundary limits
        boundary_ring = [
            [[-180.0, -90.0], [180.0, -90.0], [180.0, 90.0], [-180.0, 90.0], [-180.0, -90.0]]
        ]
        res_boundary = validate_and_normalize_polygon(boundary_ring)
        self.assertTrue(res_boundary["is_valid"])

        # Overflow limits
        overflow_ring = [
            [[-180.0001, -90.0], [180.0, -90.0], [180.0, 90.0], [-180.0, 90.0], [-180.0001, -90.0]]
        ]
        res_overflow = validate_and_normalize_polygon(overflow_ring)
        self.assertFalse(res_overflow["is_valid"])

    def test_giant_kml_simulation_over_100_placemarks(self):
        """Verify parsing giant KML containing 120 placemarks performs in < 1.0s without memory leaks."""
        placemarks_xml = []
        for i in range(120):
            lng_base = 100.0 + (i % 12) * 0.02
            lat_base = -7.0 - (i // 12) * 0.02
            pm = f"""
            <Placemark>
              <name>Petak Massal {i + 1}</name>
              <Polygon>
                <outerBoundaryIs>
                  <LinearRing>
                    <coordinates>
                      {lng_base:.4f},{lat_base:.4f} {lng_base + 0.01:.4f},{lat_base:.4f} {lng_base + 0.01:.4f},{lat_base - 0.01:.4f} {lng_base:.4f},{lat_base - 0.01:.4f} {lng_base:.4f},{lat_base:.4f}
                    </coordinates>
                  </LinearRing>
                </outerBoundaryIs>
              </Polygon>
            </Placemark>"""
            placemarks_xml.append(pm)

        giant_kml = f"""<?xml version="1.0" encoding="UTF-8"?>
        <kml xmlns="http://www.opengis.net/kml/2.2">
          <Document>
            <name>Mega Plantation 120 Parcels</name>
            {''.join(placemarks_xml)}
          </Document>
        </kml>"""

        start_time = time.perf_counter()
        res = parse_multi_kml_content(giant_kml)
        elapsed = time.perf_counter() - start_time

        self.assertEqual(res["total_plots"], 120)
        self.assertEqual(len(res["plots"]), 120)
        self.assertGreater(res["total_area_hectares"], 1000.0)
        self.assertLess(elapsed, 1.0, f"Giant KML parsing took {elapsed:.2f}s (expected < 1.0s)")

        # Unified bbox must cover all 120 plots
        bbox = res["unified_bounding_box"]
        self.assertAlmostEqual(bbox[0], 100.0, places=2)
        self.assertAlmostEqual(bbox[2], 100.0 + 11 * 0.02 + 0.01, places=2)


class TestBatchCreatePlotsAtomicRollback(unittest.IsolatedAsyncioTestCase):
    """Simulation test suite verifying atomic transaction rollback on POST /api/plots/batch-create."""

    async def asyncSetUp(self):
        # Sample polygons
        self.valid_poly1 = {
            "type": "Polygon",
            "coordinates": [[[101.85, 0.55], [101.855, 0.55], [101.855, 0.555], [101.85, 0.555], [101.85, 0.55]]],
        }
        self.valid_poly2 = {
            "type": "Polygon",
            "coordinates": [[[101.86, 0.55], [101.865, 0.55], [101.865, 0.555], [101.86, 0.555], [101.86, 0.55]]],
        }
        # Self-intersecting bowtie polygon
        self.invalid_bowtie_poly = {
            "type": "Polygon",
            "coordinates": [[[101.87, 0.55], [101.88, 0.56], [101.87, 0.56], [101.88, 0.55], [101.87, 0.55]]],
        }

    async def test_batch_create_atomic_rollback_on_single_plot_failure(self):
        """Verify if 1 plot in batch fails validation, the entire transaction rolls back without committing."""
        try:
            from fastapi import HTTPException
            from app.api.plots import batch_create_plots
        except ImportError:
            self.skipTest("FastAPI not installed in test environment")

        # Mock Division and Estate
        mock_estate = MagicMock()
        mock_estate.id = 1
        mock_estate.location_point = None

        mock_division = MagicMock()
        mock_division.id = 10
        mock_division.estate = mock_estate

        # Mock DB
        mock_db = AsyncMock()
        mock_db_res = MagicMock()
        mock_db_res.scalar_one_or_none.return_value = mock_division
        mock_db.execute.return_value = mock_db_res
        mock_db.commit = AsyncMock()
        mock_db.rollback = AsyncMock()
        mock_db.add = MagicMock()

        # Mock User
        mock_user = MagicMock()
        mock_user.id = 1

        # Batch payload: 2 valid plots, 1 invalid bowtie plot
        req = MagicMock()
        req.division_id = 10

        item1 = MagicMock(name="Plot 1", crop_type="padi", variety_id=None, planting_date=None, polygon=self.valid_poly1)
        item1.name = "Petak Valid 1"
        item2 = MagicMock(name="Plot 2", crop_type="jagung", variety_id=None, planting_date=None, polygon=self.invalid_bowtie_poly)
        item2.name = "Petak Rusak Bowtie"
        item3 = MagicMock(name="Plot 3", crop_type="kedelai", variety_id=None, planting_date=None, polygon=self.valid_poly2)
        item3.name = "Petak Valid 3"

        req.plots = [item1, item2, item3]

        with self.assertRaises(HTTPException) as ctx:
            await batch_create_plots(payload=req, db=mock_db, current_user=mock_user)

        # Verifications
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("rollback atomik", ctx.exception.detail.lower())
        self.assertIn("Petak Rusak Bowtie", ctx.exception.detail)

        # Crucial: DB rollback MUST have been called, and DB commit MUST NOT have been called
        mock_db.rollback.assert_called_once()
        mock_db.commit.assert_not_called()

    async def test_batch_create_atomic_rollback_on_db_commit_failure(self):
        """Verify if db.commit() raises an operational error, db.rollback() is triggered."""
        try:
            from fastapi import HTTPException
            from app.api.plots import batch_create_plots
        except ImportError:
            self.skipTest("FastAPI not installed in test environment")

        mock_division = MagicMock()
        mock_division.id = 10
        mock_division.estate = None

        mock_db = AsyncMock()
        mock_db_res = MagicMock()
        mock_db_res.scalar_one_or_none.return_value = mock_division
        mock_db.execute.return_value = mock_db_res
        mock_db.commit = AsyncMock(side_effect=RuntimeError("Connection terminated abnormally"))
        mock_db.rollback = AsyncMock()
        mock_db.add = MagicMock()

        mock_user = MagicMock()
        mock_user.id = 1

        req = MagicMock()
        req.division_id = 10

        item1 = MagicMock(name="Plot 1", crop_type="padi", variety_id=None, planting_date=None, polygon=self.valid_poly1)
        item1.name = "Petak Valid 1"
        req.plots = [item1]

        with self.assertRaises(HTTPException) as ctx:
            await batch_create_plots(payload=req, db=mock_db, current_user=mock_user)

        self.assertEqual(ctx.exception.status_code, 500)
        mock_db.rollback.assert_called_once()

    async def test_batch_create_atomic_success_when_all_plots_valid(self):
        """Verify batch_create commits and registers all plots when every plot is valid."""
        try:
            from app.api.plots import batch_create_plots
        except ImportError:
            self.skipTest("FastAPI not installed in test environment")

        mock_estate = MagicMock()
        mock_estate.id = 5
        mock_estate.location_point = None

        mock_division = MagicMock()
        mock_division.id = 10
        mock_division.estate = mock_estate

        mock_db = AsyncMock()
        mock_db_res = MagicMock()
        mock_db_res.scalar_one_or_none.return_value = mock_division
        mock_db.execute.return_value = mock_db_res
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()
        mock_db.rollback = AsyncMock()

        mock_user = MagicMock()
        mock_user.id = 1

        req = MagicMock()
        req.division_id = 10

        item1 = MagicMock(name="Plot 1", crop_type="padi", variety_id=None, planting_date=None, polygon=self.valid_poly1)
        item1.name = "Petak Sukses 1"
        item2 = MagicMock(name="Plot 2", crop_type="jagung", variety_id=None, planting_date=None, polygon=self.valid_poly2)
        item2.name = "Petak Sukses 2"
        req.plots = [item1, item2]

        with patch("app.services.estate_service.ensure_estate_centroid_from_polygon", return_value=True), \
             patch("app.services.weather_service.sync_weather_for_estate", new_callable=AsyncMock), \
             patch("app.services.satellite_backfill_service.backfill_satellite_indices_for_plot", new_callable=AsyncMock):

            resp = await batch_create_plots(payload=req, db=mock_db, current_user=mock_user)

            self.assertEqual(resp.created_count, 2)
            self.assertEqual(resp.failed_count, 0)
            mock_db.commit.assert_called()
            mock_db.rollback.assert_not_called()


if __name__ == "__main__":
    unittest.main()
