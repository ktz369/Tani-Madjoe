# 06: Bulk Plot Registration, Transactional PostGIS Save & Telemetry Activation

**What to build:**
Complete end-to-end bulk registration endpoint `POST /api/plots/batch-create` that transactionally persists all selected plots into PostGIS, updates estate centroid if needed (from Ticket 01), triggers estate weather sync, initiates GDD tracking, triggers the 30-day historical satellite backfill pipeline (from Ticket 04) for all created plots, and provides a success summary and dashboard redirection in the frontend.

**Blocked by:** 01, 04, 05

**Status:** completed

- [x] Add endpoint `POST /api/plots/batch-create` accepting list of plot items with division, variety, crop type, planting date, and polygon geometry.
- [x] Save all valid plots in a single database transaction with calculated geodesic areas.
- [x] Apply auto-centroid to estate if estate coordinates are missing.
- [x] Trigger weather sync and GDD sync for the batch.
- [x] Queue 30-day historical satellite backfill for each registered plot.
- [x] Return batch summary response (`created_count`, `failed_count`, `plot_ids`, `total_area_hectares`).
- [x] Connect frontend submission button and display completion modal with links to view registered plots.
- [x] Integration test verifying bulk creation of multi-placemark dataset.
