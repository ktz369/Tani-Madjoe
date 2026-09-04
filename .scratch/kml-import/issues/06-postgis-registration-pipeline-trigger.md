# 06: PostGIS Registration and Analysis Pipeline Trigger

**What to build:**
Complete the registration flow when the user submits the form with the imported KML polygon. Save the plot into PostGIS via `POST /api/plots`, automatically trigger initial baseline weather sync (Open-Meteo & $ET_0$) and baseline satellite observation for the plot's coordinates, and redirect the user to `/petak/{id}` with complete visual verification.

**Blocked by:** 05: Mapbox Polygon Rendering and Auto-FitBounds

**Status:** completed

- [x] Submit form with imported polygon data and chosen Division, variety, crop type, and planting date to `POST /api/plots`.
- [x] Ensure PostGIS stores the exact polygon geometry and calculates verified area in hectares.
- [x] Automatically trigger initial weather fetch and $ET_0$ calculation for the plot's location.
- [x] Automatically trigger initial GDD accumulation and baseline spectral index observation (synthetic or GEE).
- [x] Redirect user to `/petak/{id}` with success toast notification.
- [x] End-to-end verification test using `Bengkoxxx1.kml` confirming plot is registered, visible on dashboard, and has active telemetry.
