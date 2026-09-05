# 02: Multi-Placemark KML & GeoJSON Collection Parser

**What to build:**
Extend the pure Python spatial parser module (`kml_parser.py`) to extract all `<Placemark>` elements containing polygon boundaries from a single KML/KMZ or GeoJSON FeatureCollection. Returns an array of parsed plots with individual names, coordinates, geodesic areas, bounding boxes, and centroids, plus an overarching unified bounding box and total acreage aggregation.

**Blocked by:** None (can start immediately).

**Status:** completed

- [x] Implement `parse_multi_spatial_file(content, filename)` supporting multi-placemark KML, KMZ with nested folders, and GeoJSON FeatureCollections.
- [x] Extract each placemark's distinct name, fallback to sequential naming ("Petak 1", "Petak 2") if missing.
- [x] Validate each polygon ring independently and calculate individual geodesic areas in hectares and $m^2$.
- [x] Aggregate overall statistics: total plots count, cumulative area in hectares, and unified bounding box enclosing all plots.
- [x] Unit tests in `backend/tests/test_multi_kml_parser.py` testing multi-placemark KML fixtures and error cases.

