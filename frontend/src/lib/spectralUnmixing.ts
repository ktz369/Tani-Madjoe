/**
 * Spectral Unmixing & Inward Polygon Buffer Library (Module C - DAG-06)
 * Specialized for removing bund/ridge weed contamination (galengan)
 * from Sentinel-2 optical telemetry on terraced rice plots (Bengkok 1, Pacitan).
 *
 * Background:
 * Rice plot bunds (galengan / pematang) are covered with year-round wild weeds/grass
 * having high NDVI (~0.50 - 0.65). In narrow terraced plots, mixed 10m Sentinel-2 pixels
 * capture both the flooded rice bed and the weeded bund, causing false vegetative spikes
 * during fallow / 0 HST land preparation.
 *
 * Solution:
 * 1. Inward Polygon Buffering (2.5m erosion / inset) on the 24 WGS84 polygon vertices.
 * 2. Linear Spectral Unmixing to extract pure canopy/fallow reflectance.
 */

export type Coordinate = [number, number]; // [longitude, latitude] in WGS84

export interface InwardBufferResult {
  originalCoordinates: Coordinate[];
  bufferedCoordinates: Coordinate[];
  bufferDistanceMeters: number;
  originalAreaM2: number;
  bufferedAreaM2: number;
  bundContaminatedAreaM2: number;
  areaReductionPct: number;
  vertexCount: number;
}

export interface SpectralUnmixingResult {
  mixedNDVI: number;
  pureCanopyNDVI: number;
  weedNDVI: number;
  bundFraction: number;
  vegetationContaminationRemoved: boolean;
  agronomicAssessment: string;
}

// =====================================================================
// REAL 24 COORDINATES OF PETAK BENGKOK 1 (FROM BENGKOXXX1.KML)
// =====================================================================
export const BENGKOK_1_WGS84_COORDINATES: Coordinate[] = [
  [111.0632474582804, -8.084179911091981],
  [111.0632339684623, -8.084224180414317],
  [111.0632401855262, -8.084268499522087],
  [111.0632725808569, -8.084332470988944],
  [111.0633704820893, -8.084350009632676],
  [111.0634159296820, -8.084338358958956],
  [111.0634698637928, -8.084386061026333],
  [111.0635063325865, -8.084438263360836],
  [111.0635559282277, -8.084478159557214],
  [111.0635869829254, -8.084508121765730],
  [111.0636082363482, -8.084560344440284],
  [111.0636878429106, -8.084565467710309],
  [111.0637462982362, -8.084553049535586],
  [111.0638206127014, -8.084483298898871],
  [111.0638405677075, -8.084443430874642],
  [111.0638884461838, -8.084351243965257],
  [111.0640267543814, -8.084230642931377],
  [111.0640465157794, -8.084143148747065],
  [111.0640694893006, -8.084040850088959],
  [111.0640333467563, -8.083969725940973],
  [111.0637346955485, -8.084033547650094],
  [111.0634637628904, -8.084051802423692],
  [111.0633132929326, -8.084082613417486],
  [111.0632474582804, -8.084179911091981],
];

// Meters per degree conversions at ~8.084 degrees South
const METERS_PER_DEGREE_LAT = 111320.0;
const REFERENCE_LAT = -8.0842;
const METERS_PER_DEGREE_LON =
  111320.0 * Math.cos((REFERENCE_LAT * Math.PI) / 180.0);

/**
 * Calculates planar area in square meters from WGS84 coordinates using Shoelace formula.
 */
export function calculatePolygonAreaM2(coords: Coordinate[]): number {
  if (!coords || coords.length < 3) return 0;

  // Ensure unique vertices (strip trailing closed loop coordinate if present)
  const pts =
    coords[0][0] === coords[coords.length - 1][0] &&
    coords[0][1] === coords[coords.length - 1][1]
      ? coords.slice(0, coords.length - 1)
      : coords;

  const n = pts.length;
  if (n < 3) return 0;

  const refLon = pts[0][0];
  const refLat = pts[0][1];

  let area = 0.0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = (pts[i][0] - refLon) * METERS_PER_DEGREE_LON;
    const yi = (pts[i][1] - refLat) * METERS_PER_DEGREE_LAT;
    const xj = (pts[j][0] - refLon) * METERS_PER_DEGREE_LON;
    const yj = (pts[j][1] - refLat) * METERS_PER_DEGREE_LAT;

    area += xi * yj - xj * yi;
  }

  return Math.abs(area) * 0.5;
}

/**
 * Executes inward buffer (polygon erosion / inset) by a specified distance (default 2.5m).
 * Eliminates bund/ridge weed spectral reflection contamination from satellite telemetry.
 *
 * @param coordinates Array of [lon, lat] pairs (e.g. 24 coordinates of Bengkok 1)
 * @param bufferDistanceMeters Inward buffer distance in meters (default: 2.5m)
 * @returns InwardBufferResult containing both original and buffered coordinates and area metrics
 */
export function applyInwardBuffer(
  coordinates: Coordinate[] = BENGKOK_1_WGS84_COORDINATES,
  bufferDistanceMeters: number = 2.5
): InwardBufferResult {
  if (!coordinates || coordinates.length < 3) {
    throw new Error("Polygon must contain at least 3 vertices.");
  }

  // Normalize points: strip duplicate closing vertex for processing
  const isClosed =
    coordinates[0][0] === coordinates[coordinates.length - 1][0] &&
    coordinates[0][1] === coordinates[coordinates.length - 1][1];

  const uniqueCoords = isClosed ? coordinates.slice(0, -1) : [...coordinates];
  const n = uniqueCoords.length;

  // Origin reference for projection
  const originLon = uniqueCoords[0][0];
  const originLat = uniqueCoords[0][1];

  // Convert to local metric Cartesian coordinates
  const metricPts: { x: number; y: number }[] = uniqueCoords.map(([lon, lat]) => ({
    x: (lon - originLon) * METERS_PER_DEGREE_LON,
    y: (lat - originLat) * METERS_PER_DEGREE_LAT,
  }));

  // Determine polygon winding order (signed area)
  let signedArea = 0.0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    signedArea += metricPts[i].x * metricPts[j].y - metricPts[j].x * metricPts[i].y;
  }
  const isCCW = signedArea > 0;

  // Compute unit direction and inward normal for each edge i -> i+1
  const edgeNormals: { nx: number; ny: number; ux: number; uy: number }[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = metricPts[j].x - metricPts[i].x;
    const dy = metricPts[j].y - metricPts[i].y;
    const len = Math.hypot(dx, dy) || 1e-9;
    const ux = dx / len;
    const uy = dy / len;

    // Inward normal perpendicular to edge
    const nx = isCCW ? -uy : uy;
    const ny = isCCW ? ux : -ux;

    edgeNormals.push({ nx, ny, ux, uy });
  }

  // Intersect adjacent offset lines to obtain new buffered vertices
  const bufferedMetricPts: { x: number; y: number }[] = [];
  const miterLimit = 2.2; // Avoid excessive outward spikes on sharp acute angles

  for (let i = 0; i < n; i++) {
    const prevIdx = (i - 1 + n) % n;
    const nPrev = edgeNormals[prevIdx];
    const nCurr = edgeNormals[i];

    // Shift points by bufferDistanceMeters inward
    const d = bufferDistanceMeters;
    const pPrev = {
      x: metricPts[i].x + d * nPrev.nx,
      y: metricPts[i].y + d * nPrev.ny,
    };
    const pCurr = {
      x: metricPts[i].x + d * nCurr.nx,
      y: metricPts[i].y + d * nCurr.ny,
    };

    // Intersection of line (pPrev + t * uPrev) and line (pCurr + s * uCurr)
    const det = nPrev.ux * nCurr.uy - nPrev.uy * nCurr.ux;

    let bufX: number;
    let bufY: number;

    if (Math.abs(det) > 1e-4) {
      const dx = pCurr.x - pPrev.x;
      const dy = pCurr.y - pPrev.y;
      const t = (dx * nCurr.uy - dy * nCurr.ux) / det;
      bufX = pPrev.x + t * nPrev.ux;
      bufY = pPrev.y + t * nPrev.uy;

      // Miter limit check: if distance from original vertex exceeds threshold, clamp towards bisector
      const miterDist = Math.hypot(bufX - metricPts[i].x, bufY - metricPts[i].y);
      if (miterDist > d * miterLimit) {
        const bisectorX = nPrev.nx + nCurr.nx;
        const bisectorY = nPrev.ny + nCurr.ny;
        const bisectorLen = Math.hypot(bisectorX, bisectorY) || 1e-9;
        bufX = metricPts[i].x + (bisectorX / bisectorLen) * d * miterLimit;
        bufY = metricPts[i].y + (bisectorY / bisectorLen) * d * miterLimit;
      }
    } else {
      // Parallel or near collinear edges
      bufX = metricPts[i].x + d * nCurr.nx;
      bufY = metricPts[i].y + d * nCurr.ny;
    }

    bufferedMetricPts.push({ x: bufX, y: bufY });
  }

  // Convert buffered metric coordinates back to WGS84 [lon, lat]
  const bufferedWGS84: Coordinate[] = bufferedMetricPts.map((p) => [
    Number((originLon + p.x / METERS_PER_DEGREE_LON).toFixed(7)),
    Number((originLat + p.y / METERS_PER_DEGREE_LAT).toFixed(7)),
  ]);

  // Re-close loop if original input was closed
  if (isClosed) {
    bufferedWGS84.push([bufferedWGS84[0][0], bufferedWGS84[0][1]]);
  }

  const origArea = calculatePolygonAreaM2(coordinates);
  const buffArea = calculatePolygonAreaM2(bufferedWGS84);
  const bundArea = Math.max(0, origArea - buffArea);
  const areaReductionPct = origArea > 0 ? (bundArea / origArea) * 100.0 : 0.0;

  return {
    originalCoordinates: coordinates,
    bufferedCoordinates: bufferedWGS84,
    bufferDistanceMeters,
    originalAreaM2: Number(origArea.toFixed(2)),
    bufferedAreaM2: Number(buffArea.toFixed(2)),
    bundContaminatedAreaM2: Number(bundArea.toFixed(2)),
    areaReductionPct: Number(areaReductionPct.toFixed(2)),
    vertexCount: bufferedWGS84.length,
  };
}

/**
 * Pre-computed 2.5m inward-buffered coordinates for Bengkok 1.
 * Ready for high-performance map rendering and spectral pixel extraction.
 */
export const BENGKOK_1_BUFFERED_COORDINATES: Coordinate[] =
  applyInwardBuffer(BENGKOK_1_WGS84_COORDINATES, 2.5).bufferedCoordinates;

/**
 * Spectral Linear Unmixing:
 * Removes weed reflection contamination from mixed satellite NDVI pixels.
 *
 * Formula:
 * NDVI_mixed = f_bund * NDVI_weed + (1 - f_bund) * NDVI_canopy
 * => NDVI_canopy = (NDVI_mixed - f_bund * NDVI_weed) / (1 - f_bund)
 *
 * @param mixedNDVI Raw satellite pixel NDVI (typically 0.27 - 0.32 during fallow)
 * @param bundFraction Area fraction of bund/ridge within pixel footprint (typically ~0.22)
 * @param weedNDVI Spectral reflectance of bund grass/weeds (default: 0.55)
 */
export function computePureCanopyNDVI(
  mixedNDVI: number,
  bundFraction: number = 0.22,
  weedNDVI: number = 0.55
): SpectralUnmixingResult {
  const f = Math.max(0.05, Math.min(0.50, bundFraction));
  const rawPure = (mixedNDVI - f * weedNDVI) / (1.0 - f);
  const pureCanopy = Math.max(-0.15, Math.min(0.95, Number(rawPure.toFixed(4))));

  let assessment = "";
  if (pureCanopy <= 0.20) {
    assessment =
      "Kanopi sawah murni terkonfirmasi fase BERA / OLAH TANAH (0 HST). " +
      "Kontaminasi rumput pematang berhasil dipisahkan.";
  } else if (pureCanopy <= 0.40) {
    assessment = "Fase vegetatif awal (bibit baru tandur / persemaian).";
  } else if (pureCanopy <= 0.70) {
    assessment = "Fase vegetatif aktif / anakan maksimal.";
  } else {
    assessment = "Fase generatif / kanopi rapat.";
  }

  return {
    mixedNDVI,
    pureCanopyNDVI: pureCanopy,
    weedNDVI,
    bundFraction: f,
    vegetationContaminationRemoved: true,
    agronomicAssessment: assessment,
  };
}
