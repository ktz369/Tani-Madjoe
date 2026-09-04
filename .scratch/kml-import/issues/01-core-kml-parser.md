# 01: Core KML Parser and WGS84 Extraction

**What to build:**
A lightweight, isolated Python module in backend using standard library `xml.etree.ElementTree` to parse KML files (such as `Bengkoxxx1.kml`). It extracts `<Placemark>`, `<name>`, and `<Polygon>` / `<LinearRing>` elements, handles both 2D (`lng,lat`) and 3D (`lng,lat,alt`) whitespace-delimited coordinates, strips altitude, normalizes coordinates to standard GeoJSON Polygon format `[[[lng, lat], ...]]`, and extracts bounding box and centroid.

**Blocked by:** None (can start immediately).

**Status:** completed

- [x] Parse KML XML string or file stream using `xml.etree.ElementTree` without external C-bindings.
- [x] Extract placemark name (e.g., "Bengkok 1") with fallback to default name if missing.
- [x] Parse `<coordinates>` handling newline and whitespace delimiters with 2D or 3D coordinate tuples.
- [x] Format output as standard GeoJSON Polygon geometry dict (`{"type": "Polygon", "coordinates": [...]}`).
- [x] Compute bounding box `[min_lng, min_lat, max_lng, max_lat]` and centroid `[lng, lat]`.
- [x] Unit tests in `tests/test_kml_parser.py` testing against `Bengkoxxx1.kml` fixture (verifying 24 vertices, name "Bengkok 1").
