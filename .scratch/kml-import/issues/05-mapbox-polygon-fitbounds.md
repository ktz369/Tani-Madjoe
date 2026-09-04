# 05: Mapbox Polygon Rendering and Auto-FitBounds

**What to build:**
Integration of imported polygon coordinates into the Mapbox GL map instance on `/admin/petak-baru`. When a polygon is imported from KML/GeoJSON, the map renders the boundary outline and vertex markers, and automatically animates the map camera (`map.fitBounds`) to smoothly center and zoom directly onto the plot's bounding box.

**Blocked by:** 04: Frontend Dropzone and Form Auto-Fill

**Status:** completed

- [x] Render imported polygon coordinates onto the Mapbox map source and layer with high-contrast boundary styling.
- [x] Render interactive vertex markers or polygon preview layer in `/admin/petak-baru`.
- [x] Calculate or consume the bounding box `[min_lng, min_lat, max_lng, max_lat]` from the parsed polygon.
- [x] Trigger `map.fitBounds()` with smooth camera transition and 40px-60px padding to frame the plot perfectly.
- [x] Handle map resize and style change seamlessly without losing the imported polygon boundary.
