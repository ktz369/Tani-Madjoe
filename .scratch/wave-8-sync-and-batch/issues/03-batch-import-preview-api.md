# 03: Batch Spatial Import Preview & Validation API

**What to build:**
A dedicated REST endpoint `POST /api/plots/batch-import-preview` that accepts a multi-placemark file (upload or JSON content), calls the multi-spatial parser from Ticket 02, and returns an extensive preview payload including the list of detected plots, each with validated GeoJSON polygon geometry, area, individual bounding box, and total summary statistics.

**Blocked by:** 02: Multi-Placemark KML & GeoJSON Collection Parser

**Status:** ready-for-agent

- [ ] Define schemas `PlotBatchImportPreviewResponse` and `PlotBatchItemPreview` in `app/schemas/plot.py`.
- [ ] Add endpoint `POST /api/plots/batch-import-preview` accepting file upload or JSON payload.
- [ ] Return list of plot items, `total_plots`, `total_area_hectares`, and `unified_bounding_box`.
- [ ] Return user-friendly Indonesian error messages for corrupt files or files with zero valid polygons.
- [ ] Integration tests in `backend/tests/test_batch_preview_api.py`.
