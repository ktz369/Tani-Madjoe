# 02: Geodesic Area Calculator and Spatial Validator

**What to build:**
A focused mathematical and topological validation module that verifies polygon integrity (ensuring a closed ring, at least 3 distinct vertices, valid WGS84 longitude/latitude bounds) and computes precise geodesic area in Hectares ($Ha$) and square meters ($m^2$). Verified to produce ~0.3688 Ha for the `Bengkok 1` polygon matching PostGIS expectations.

**Blocked by:** 01: Core KML Parser and WGS84 Extraction

**Status:** completed

- [x] Validate polygon topological integrity: ring is closed ($coords[0] == coords[-1]$ or auto-closed), minimum 3 unique points.
- [x] Validate WGS84 range: longitude between -180 and 180, latitude between -90 and 90.
- [x] Implement spherical geodesic area calculation formula yielding area in square meters and hectares.
- [x] Validate against `Bengkok 1` coordinates (24 points) producing ~0.3688 Hectares (3,687.7 m²).
- [x] Return validation result object with status, error messages (if invalid), area in hectares, and vertex count.
- [x] Unit tests in `tests/test_kml_parser.py` testing valid polygons, unclosed rings, open polygons, and malformed coordinate ranges.
