/**
 * Koordinat batas poligon 24 titik WGS84 resmi Petak Bengkok 1 (Pacitan, Jawa Timur).
 * Luas: 0,37 Hektar | Elevasi: ~327 m dpl (Terasiring lereng perbukitan).
 * Sumber: Bengkoxxx1.kml
 */
export const BENGKOK_1_COORDINATES: [number, number][] = [
  [111.0632475, -8.0841799],
  [111.063234, -8.0842242],
  [111.0632402, -8.0842685],
  [111.0632726, -8.0843325],
  [111.0633705, -8.08435],
  [111.0634159, -8.0843384],
  [111.0634699, -8.0843861],
  [111.0635063, -8.0844383],
  [111.0635559, -8.0844782],
  [111.063587, -8.0845081],
  [111.0636082, -8.0845603],
  [111.0636878, -8.0845655],
  [111.0637463, -8.084553],
  [111.0638206, -8.0844833],
  [111.0638406, -8.0844343],
  [111.0638884, -8.0843512],
  [111.0640268, -8.0842306],
  [111.0640465, -8.0841431],
  [111.0640695, -8.0840409],
  [111.0640333, -8.0839697],
  [111.0637347, -8.0840335],
  [111.0634638, -8.0840518],
  [111.0633133, -8.0840826],
  [111.0632475, -8.0841799],
];

export const BENGKOK_1_CENTER: [number, number] = [111.063654, -8.084073];

/**
 * Menghitung bounding box [[minLng, minLat], [maxLng, maxLat]] dari koordinat Bengkok 1.
 */
export function getBengkok1Bounds(): [[number, number], [number, number]] {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const [lng, lat] of BENGKOK_1_COORDINATES) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

/**
 * GeoJSON Feature resmi Petak Bengkok 1.
 */
export const BENGKOK_1_GEOJSON = {
  type: "Feature" as const,
  properties: {
    id: 1,
    name: "Bengkok 1 (KML Utama)",
    area_hectares: 0.37,
    crop_type: "padi",
    elevation_m: 327,
  },
  geometry: {
    type: "Polygon" as const,
    coordinates: [BENGKOK_1_COORDINATES],
  },
};
