import type { Style } from "mapbox-gl";

export type MapStyleType = "satellite" | "streets";

/**
 * Validates and returns the Mapbox access token.
 * Returns an empty string if the token is undefined, empty, or a placeholder/example
 * (e.g. contains "example" or starts with "pk.eyJ1IjoiZXhhbXBsZS").
 */
export function getMapboxToken(): string {
  const token = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim();

  if (!token) {
    return "";
  }

  const lower = token.toLowerCase();
  if (
    lower.includes("example") ||
    lower.includes("placeholder") ||
    token.startsWith("pk.eyJ1IjoiZXhhbXBsZS") ||
    !token.startsWith("pk.")
  ) {
    return "";
  }

  return token;
}

/**
 * Checks whether a valid non-placeholder Mapbox token is configured.
 */
export function isMapboxTokenValid(): boolean {
  return getMapboxToken().length > 0;
}

/**
 * Mapbox Style v8 specification for high-resolution satellite imagery
 * using Esri World Imagery public raster tiles.
 * Does not require Mapbox access token.
 */
export const OPEN_SATELLITE_STYLE: Style = {
  version: 8,
  name: "Esri World Imagery",
  sources: {
    "esri-world-imagery": {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution:
        "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "esri-world-imagery-tiles",
      type: "raster",
      source: "esri-world-imagery",
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};

/**
 * Mapbox Style v8 specification for street / topographic mapping
 * using OpenStreetMap raster tiles.
 * Does not require Mapbox access token.
 */
export const OPEN_STREETS_STYLE: Style = {
  version: 8,
  name: "OpenStreetMap Standard",
  sources: {
    "osm-tiles": {
      type: "raster",
      tiles: [
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution:
        "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors",
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "osm-tiles",
      type: "raster",
      source: "osm-tiles",
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};

export const OPEN_OSM_STYLE: Style = OPEN_STREETS_STYLE;

/**
 * Returns official Mapbox style URL if a valid token is provided,
 * otherwise returns an open raster style specification (Esri / OpenStreetMap).
 */
export function getMapStyle(type: MapStyleType = "satellite"): string | Style {
  if (isMapboxTokenValid()) {
    return type === "satellite"
      ? "mapbox://styles/mapbox/satellite-streets-v12"
      : "mapbox://styles/mapbox/outdoors-v12";
  }

  return type === "satellite" ? OPEN_SATELLITE_STYLE : OPEN_STREETS_STYLE;
}

/**
 * Sets `mapboxgl.accessToken = token` if valid, or an empty string `""` if invalid.
 * Also sets `config.REQUIRE_ACCESS_TOKEN = false` to allow open raster styles (Esri / OpenStreetMap)
 * to render without throwing authentication errors.
 */
export function applyMapboxToken(mapboxglInstance?: any): string {
  const token = getMapboxToken();
  if (mapboxglInstance) {
    if (mapboxglInstance.config) {
      mapboxglInstance.config.REQUIRE_ACCESS_TOKEN = isMapboxTokenValid();
    }
    mapboxglInstance.accessToken = token;

    if (!isMapboxTokenValid() && mapboxglInstance.Map) {
      // Prevent Mapbox GL JS v3 from clearing the canvas when running without a commercial key
      mapboxglInstance.Map.prototype._authenticate = function () {};
      mapboxglInstance.Map.prototype._revokeAuth = function () {};
    }
  }
  return token;
}

// ============================================================
// GeoJSON LAYER / SOURCE SYNCHRONIZATION HELPERS (SYS-05)
// These helpers ensure polygons, contours, terraces, and
// markers survive style switches triggered by styledata events.
// ============================================================

export type GeoJsonSourceSpec = {
  id: string;
  data: GeoJSON.FeatureCollection | GeoJSON.Feature | GeoJSON.Geometry;
};

export type LayerSpec = {
  id: string;
  type: string;
  source: string;
  /** Optional paint and layout properties forwarded verbatim. */
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  filter?: unknown[];
  minzoom?: number;
  maxzoom?: number;
  /** If provided, layer is inserted before this layer ID (z-ordering). */
  beforeId?: string;
};

/**
 * Safely adds or replaces a GeoJSON source on the map.
 * If the source already exists, only its data is updated via `setData`.
 */
export function syncGeoJsonSource(
  map: mapboxgl.Map,
  sourceId: string,
  data: GeoJsonSourceSpec["data"]
): void {
  if (!map || !map.isStyleLoaded()) return;
  try {
    const existing = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;
    if (existing) {
      existing.setData(data as GeoJSON.FeatureCollection);
    } else {
      map.addSource(sourceId, { type: "geojson", data });
    }
  } catch (err) {
    // Silently swallow during concurrent style transitions
    console.warn(`[mapStyles] syncGeoJsonSource(${sourceId}) skipped:`, err);
  }
}

/**
 * Safely adds a layer to the map only if it does not already exist.
 * Uses `beforeId` for z-order control when provided.
 */
export function ensureLayerExists(map: mapboxgl.Map, spec: LayerSpec): void {
  if (!map || !map.isStyleLoaded()) return;
  try {
    if (map.getLayer(spec.id)) return;
    const { beforeId, ...layerDef } = spec;
    map.addLayer(layerDef as mapboxgl.AnyLayer, beforeId);
  } catch (err) {
    console.warn(`[mapStyles] ensureLayerExists(${spec.id}) skipped:`, err);
  }
}

/**
 * Safely removes a layer by ID; no-op if the layer does not exist.
 */
export function removeLayerSafe(map: mapboxgl.Map, layerId: string): void {
  try {
    if (map && map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
  } catch (err) {
    console.warn(`[mapStyles] removeLayerSafe(${layerId}) skipped:`, err);
  }
}

/**
 * Safely removes a source by ID after first removing all layers that reference it.
 */
export function removeSourceSafe(
  map: mapboxgl.Map,
  sourceId: string,
  layerIds: string[] = []
): void {
  try {
    layerIds.forEach((lid) => removeLayerSafe(map, lid));
    if (map && map.getSource(sourceId)) {
      map.removeSource(sourceId);
    }
  } catch (err) {
    console.warn(`[mapStyles] removeSourceSafe(${sourceId}) skipped:`, err);
  }
}

/**
 * Re-synchronizes a list of GeoJSON sources and their associated layers after
 * a Mapbox GL `styledata` event (e.g. after calling `map.setStyle(...)`).
 *
 * Usage:
 * ```ts
 * map.on("styledata", () => {
 *   syncLayersAfterStyleLoad(map, sources, layers);
 * });
 * ```
 */
export function syncLayersAfterStyleLoad(
  map: mapboxgl.Map,
  sources: GeoJsonSourceSpec[],
  layers: LayerSpec[]
): void {
  if (!map || !map.isStyleLoaded()) return;
  // Re-add sources first
  for (const src of sources) {
    syncGeoJsonSource(map, src.id, src.data);
  }
  // Re-add layers in order
  for (const layer of layers) {
    ensureLayerExists(map, layer);
  }
}

/**
 * Creates a lifecycle guard object that stores the current sources/layers
 * and re-applies them automatically whenever the map style reloads.
 *
 * Usage:
 * ```ts
 * const guard = createMapLifecycleGuard(map);
 * guard.register(sources, layers);
 * // Later, to tear down:
 * guard.destroy();
 * ```
 */
export function createMapLifecycleGuard(map: mapboxgl.Map) {
  let registeredSources: GeoJsonSourceSpec[] = [];
  let registeredLayers: LayerSpec[] = [];

  function onStyleData() {
    syncLayersAfterStyleLoad(map, registeredSources, registeredLayers);
  }

  map.on("styledata", onStyleData);

  return {
    /** Register (or replace) the sources and layers to auto-restore on style reload. */
    register(sources: GeoJsonSourceSpec[], layers: LayerSpec[]) {
      registeredSources = sources;
      registeredLayers = layers;
      // Apply immediately if style is already loaded
      if (map.isStyleLoaded()) {
        syncLayersAfterStyleLoad(map, sources, layers);
      }
    },
    /** Update a single source's data without re-registering all layers. */
    updateSource(sourceId: string, data: GeoJsonSourceSpec["data"]) {
      const idx = registeredSources.findIndex((s) => s.id === sourceId);
      if (idx >= 0) registeredSources[idx].data = data;
      syncGeoJsonSource(map, sourceId, data);
    },
    /** Remove all listeners and clear registry. */
    destroy() {
      map.off("styledata", onStyleData);
      registeredSources = [];
      registeredLayers = [];
    },
  };
}

/**
 * Safely resizes the map canvas. Call this whenever the container size changes
 * (e.g. sidebar toggle, tab switch, modal open). Debounced internally via
 * requestAnimationFrame to avoid excessive re-paints.
 */
export function triggerMapResize(map: mapboxgl.Map | null | undefined): void {
  if (!map) return;
  requestAnimationFrame(() => {
    try {
      map.resize();
    } catch (err) {
      console.warn("[mapStyles] triggerMapResize failed:", err);
    }
  });
}
