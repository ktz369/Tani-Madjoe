# 04: 30-Day Historical Satellite Telemetry Backfill Pipeline

**What to build:**
A robust historical satellite backfill engine (`satellite_backfill_service.py`) that generates or fetches 30-day historical time-series observation data (at 5-day cadence, giving 6 distinct historical points) for newly registered plots. Fills `spectral_indices` with realistic/GEE observations (NDVI, NDRE, NDWI, SAVI, BSI, SAR) so that plots immediately display rich historical growth trends on their detail dashboard upon creation.

**Blocked by:** None (can start immediately).

**Status:** completed

- [x] Create `backfill_satellite_indices_for_plot(db, plot_id, days_back=30, cadence_days=5)` in `app/services/satellite_backfill_service.py`.
- [x] Calculate or query historical spectral indices for 6 time points prior to the registration date.
- [x] Apply crop phenology curve shaping (sigmoid vegetative growth curve matching crop type and HST at each historical date).
- [x] Persist records to `SpectralIndex` handling duplicates gracefully (`ON CONFLICT DO NOTHING`).
- [x] Connect backfill trigger into plot registration flow.
- [x] Unit tests in `backend/tests/test_satellite_backfill.py` verifying 6 historical observations and proper chronological order.
