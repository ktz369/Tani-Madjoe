# 03: Import Preview API Endpoint

**What to build:**
A dedicated, lightweight FastAPI REST endpoint (`POST /api/plots/import-preview`) that accepts an uploaded file (`.kml`, `.kmz`, `.geojson`) or a raw text payload. It invokes the parser and validator from Tickets 01 and 02 and returns a clean preview JSON response containing the plot name, GeoJSON Polygon, area in hectares, bounding box, centroid, and any validation warnings.

**Blocked by:** 02: Geodesic Area Calculator and Spatial Validator

**Status:** completed

- [x] Add endpoint `POST /api/plots/import-preview` accepting `UploadFile` (multipart/form-data) or JSON body with raw content.
- [x] Connect with Core KML Parser and Spatial Validator.
- [x] Return schema: `name`, `geometry` (GeoJSON dict), `area_hectares` (float), `bounding_box` `[min_lng, min_lat, max_lng, max_lat]`, and `centroid` `[lng, lat]`.
- [x] Return HTTP 400 with user-friendly Indonesian error message if file content is malformed or contains no polygon geometry.
- [x] Require authenticated user token (`get_current_user`).
- [x] Integration test testing upload of `Bengkoxxx1.kml` returning HTTP 200 with name "Bengkok 1" and area ~0.37 Ha.
