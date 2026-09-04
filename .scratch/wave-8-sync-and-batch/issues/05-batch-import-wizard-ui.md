# 05: Frontend Batch Import Wizard & Multi-Polygon Mapbox Viewer

**What to build:**
A comprehensive "Impor Massal (Batch KML/KMZ)" interface in the frontend plot registration area. Allows dropping a multi-placemark file, displays an interactive table of all detected plots with checkboxes, area badges, and editable names, provides batch assignment for variety and planting date, and renders all polygons simultaneously on Mapbox GL with auto-fitBounds framing the unified bounding box.

**Blocked by:** 03: Batch Spatial Import Preview & Validation API

**Status:** ready-for-agent

- [ ] Add "Impor Massal" tab or modal in `/admin/petak-baru` with multi-file dropzone.
- [ ] Connect with `POST /api/plots/batch-import-preview` endpoint.
- [ ] Display summary card (total plots detected, cumulative hectares).
- [ ] Display interactive review table with checkboxes (include/exclude), editable plot names, and crop varieties.
- [ ] Render all imported polygons simultaneously on the Mapbox instance with distinct boundary colors.
- [ ] Execute `map.fitBounds(unified_bounding_box)` with smooth padding to encompass all plots at once.
- [ ] Provide "Set Semua Varietas" and "Set Semua Tanggal Tanam" quick batch controls.
