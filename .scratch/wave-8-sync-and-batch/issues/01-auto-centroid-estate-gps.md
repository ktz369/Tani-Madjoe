# 01: Auto-Centroid Estate Geolocation and Weather Propagation

**What to build:**
When a plot is registered in a Division whose parent Estate does not yet have GPS coordinates (`location_point is null`), automatically calculate the centroid of the plot's polygon, update the Estate's `location_point` and `latitude`/`longitude` fields in the database, and immediately trigger `sync_weather_for_estate` so that weather and $ET_0$ data are established for the exact geographic location of the newly mapped plots.

**Blocked by:** None (can start immediately).

**Status:** completed

- [x] Check `estate.location_point` during plot creation (`_handle_create_plot` and future batch create).
- [x] If estate coordinates are missing or zero, extract centroid `[lng, lat]` from the incoming plot polygon.
- [x] Update `Estate.location_point` with PostGIS WKT `POINT(lng lat)` and save `latitude`/`longitude`.
- [x] Trigger immediate `sync_weather_for_estate` with the newly assigned estate coordinates.
- [x] Unit test in `backend/tests/test_auto_centroid_estate.py` verifying estate coordinates update and weather trigger upon plot registration.

