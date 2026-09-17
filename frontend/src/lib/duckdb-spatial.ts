/**
 * DuckDB-WASM Spatial Engine & Client-Side Geoprocessing Service
 *
 * Provides browser-side ST_Buffer & ST_Union spatial geoprocessing for emergency
 * pest quarantine zones (R=50m) without server round-trips.
 * Includes SSR-safe hydration guards and a geodesic polygon fallback engine.
 */

export interface PestPoint {
  lat: number;
  lng: number;
  severity?: string;
  pest_type?: string;
  id?: number;
}

export interface QuarantineGeoJSON {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: {
      id?: number;
      type: string;
      severity: string;
      pest_type?: string;
      buffer_radius_m: number;
      created_at: string;
    };
    geometry: {
      type: 'Polygon' | 'MultiPolygon';
      coordinates: number[][][] | number[][][][];
    };
  }>;
}

let duckdbInstance: any = null;
let duckdbConnection: any = null;
let isInitializing = false;

/**
 * Initializes DuckDB-WASM with spatial extension in browser client.
 * Returns null gracefully if called in SSR or if browser environment does not support WASM/Workers.
 */
export async function initDuckDBSpatial(): Promise<any | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  if (duckdbConnection) {
    return duckdbConnection;
  }

  if (isInitializing) {
    // Wait for in-flight initialization
    let attempts = 0;
    while (isInitializing && attempts < 20) {
      await new Promise((r) => setTimeout(r, 100));
      attempts++;
    }
    if (duckdbConnection) return duckdbConnection;
  }

  isInitializing = true;

  try {
    const duckdb = await import('@duckdb/duckdb-wasm');
    const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

    const worker = await duckdb.createWorker(bundle.mainWorker!);
    const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

    const conn = await db.connect();

    // Try installing and loading the spatial extension
    try {
      await conn.query('INSTALL spatial;');
      await conn.query('LOAD spatial;');
    } catch (spatialErr) {
      console.warn('[DuckDB-WASM] Spatial extension load warning (using geodesic engine fallback):', spatialErr);
    }

    duckdbInstance = db;
    duckdbConnection = conn;
    return duckdbConnection;
  } catch (err) {
    console.warn('[DuckDB-WASM] Dynamic initialization skipped, active fallback engaged:', err);
    return null;
  } finally {
    isInitializing = false;
  }
}

/**
 * High-precision geodesic circle generator (32-point polygon for R meters radius).
 * Produces a strictly closed GeoJSON LinearRing (33 points, first == last).
 */
function createGeodesicCirclePolygon(lat: number, lng: number, radiusMeters: number, steps = 32): number[][] {
  const coords: number[][] = [];
  const earthRadius = 6378137; // WGS84 equatorial radius in meters
  const dLat = radiusMeters / earthRadius;
  const dLng = radiusMeters / (earthRadius * Math.cos((Math.PI * lat) / 180));

  for (let i = 0; i < steps; i++) {
    const theta = (i / steps) * 2 * Math.PI;
    const pLat = lat + (dLat * (180 / Math.PI)) * Math.sin(theta);
    const pLng = lng + (dLng * (180 / Math.PI)) * Math.cos(theta);
    coords.push([Number(pLng.toFixed(7)), Number(pLat.toFixed(7))]);
  }
  // Ensure strict closure of GeoJSON linear ring (first point == last point)
  coords.push([coords[0][0], coords[0][1]]);
  return coords;
}

/**
 * Generates an emergency quarantine polygon buffer (default 50m) for severe pest hotspots.
 * Executes DuckDB-WASM ST_Buffer & ST_Union or fast geodesic engine fallback.
 * Always returns a strictly valid GeoJSON FeatureCollection.
 */
export async function generatePestQuarantineBuffer(
  points: PestPoint[],
  bufferMeters = 50
): Promise<QuarantineGeoJSON> {
  if (!Array.isArray(points) || points.length === 0) {
    return {
      type: 'FeatureCollection',
      features: [],
    };
  }

  // Filter out any null, undefined, or mathematically invalid coordinates
  const validPoints = points.filter(
    (p) =>
      p &&
      typeof p.lat === 'number' &&
      typeof p.lng === 'number' &&
      !isNaN(p.lat) &&
      !isNaN(p.lng) &&
      p.lat >= -90 &&
      p.lat <= 90 &&
      p.lng >= -180 &&
      p.lng <= 180
  );

  // Only isolate severe/critical/emergency outbreaks for emergency quarantine buffer
  const severePoints = validPoints.filter((p) => {
    if (!p.severity) return true;
    const s = String(p.severity).toLowerCase();
    return ['berat', 'merah', 'high', 'emergency', 'kritis', 'critical'].includes(s);
  });

  if (severePoints.length === 0) {
    return {
      type: 'FeatureCollection',
      features: [],
    };
  }

  // Attempt DuckDB-WASM processing if available in browser
  try {
    const conn = await initDuckDBSpatial();
    if (conn) {
      // Build point list table
      await conn.query('CREATE TEMPORARY TABLE IF NOT EXISTS pest_outbreaks (id INTEGER, lat DOUBLE, lng DOUBLE);');
      await conn.query('DELETE FROM pest_outbreaks;');

      for (let idx = 0; idx < severePoints.length; idx++) {
        const pt = severePoints[idx];
        await conn.query(`INSERT INTO pest_outbreaks VALUES (${idx + 1}, ${pt.lat}, ${pt.lng});`);
      }

      // 50m converted to degrees approximation: 50 / 111320
      const degBuffer = bufferMeters / 111320.0;
      let res: any = null;
      try {
        res = await conn.query(`
          SELECT ST_AsGeoJSON(ST_Union_Agg(ST_Buffer(ST_Point(lng, lat), ${degBuffer}))) as geom_json
          FROM pest_outbreaks;
        `);
      } catch (aggErr) {
        try {
          res = await conn.query(`
            SELECT ST_AsGeoJSON(ST_Buffer(ST_Point(lng, lat), ${degBuffer})) as geom_json
            FROM pest_outbreaks;
          `);
        } catch {
          res = null;
        }
      }

      const rows = res ? res.toArray() : [];
      if (rows && rows.length > 0 && rows[0].geom_json) {
        const parsedGeom = JSON.parse(rows[0].geom_json);
        if (parsedGeom) {
          return {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {
                  type: 'quarantine_buffer_duckdb_wasm',
                  severity: 'berat',
                  buffer_radius_m: bufferMeters,
                  created_at: new Date().toISOString(),
                },
                geometry: parsedGeom,
              },
            ],
          };
        }
      }
    }
  } catch (err) {
    console.warn('[DuckDB-WASM] Query execution failed, reverting to geodesic polygon engine:', err);
  }

  // Geodesic Engine Fallback (Standard GeoJSON Polygon / MultiPolygon)
  const features = severePoints.map((pt, index) => {
    const ring = createGeodesicCirclePolygon(pt.lat, pt.lng, bufferMeters);
    return {
      type: 'Feature' as const,
      properties: {
        id: pt.id || index + 1,
        type: 'quarantine_buffer_geodesic',
        severity: pt.severity || 'berat',
        pest_type: pt.pest_type || 'OPT Berat',
        buffer_radius_m: bufferMeters,
        created_at: new Date().toISOString(),
      },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [ring],
      },
    };
  });

  return {
    type: 'FeatureCollection',
    features,
  };
}

