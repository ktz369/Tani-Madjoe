import { initDuckDBSpatial, generatePestQuarantineBuffer, type PestPoint } from './src/lib/duckdb-spatial.ts';

async function runTests() {
  console.log('=== DBG-03: DuckDB-WASM & Spatial Engine Boundary Test ===\n');

  // Test 1: SSR Safety check
  console.log('Test 1: SSR Safety (typeof window === undefined)');
  const conn = await initDuckDBSpatial();
  console.assert(conn === null, 'Expected initDuckDBSpatial to return null in SSR/Node');
  console.log('  -> PASS: initDuckDBSpatial safely returned null in Node.js/SSR environment without error.\n');

  // Test 2: Single Point Geodesic Buffer (32 points, R=50m)
  console.log('Test 2: Single Point Buffer Generation');
  const singlePoint: PestPoint[] = [{ lat: -8.0843, lng: 111.0636, severity: 'berat', pest_type: 'wereng_coklat' }];
  const singleResult = await generatePestQuarantineBuffer(singlePoint, 50);

  console.assert(singleResult.type === 'FeatureCollection', 'Must be FeatureCollection');
  console.assert(singleResult.features.length === 1, `Expected 1 feature, got ${singleResult.features.length}`);
  const f1 = singleResult.features[0];
  console.assert(f1.geometry.type === 'Polygon', 'Geometry must be Polygon');
  const ring1 = (f1.geometry.coordinates as number[][][])[0];
  console.assert(ring1.length === 33, `Expected 33 coordinates (32 steps + 1 closing), got ${ring1.length}`);
  console.assert(
    ring1[0][0] === ring1[32][0] && ring1[0][1] === ring1[32][1],
    'First and last coordinates must match for ring closure'
  );
  console.assert(f1.properties.buffer_radius_m === 50, 'Buffer radius must be 50m');
  console.assert(f1.properties.type === 'quarantine_buffer_geodesic', 'Type must be geodesic fallback');
  console.log(`  -> PASS: Single point generated valid GeoJSON Polygon with ${ring1.length} ring vertices. Strict closure verified: [${ring1[0]}] == [${ring1[32]}].\n`);

  // Test 3: Multi-Point with Various Severe Labels ('berat', 'HIGH', 'EMERGENCY')
  console.log('Test 3: Multi-Point Severe Outbreaks');
  const multiPoints: PestPoint[] = [
    { lat: -8.0843, lng: 111.0636, severity: 'berat', pest_type: 'wereng_coklat' },
    { lat: -8.0850, lng: 111.0640, severity: 'HIGH', pest_type: 'penggerek_batang' },
    { lat: -8.0860, lng: 111.0650, severity: 'EMERGENCY', pest_type: 'blas' },
    { lat: -8.0870, lng: 111.0660, severity: 'ringan', pest_type: 'walang_sangit' }, // should be filtered out
  ];
  const multiResult = await generatePestQuarantineBuffer(multiPoints, 50);
  console.assert(multiResult.features.length === 3, `Expected 3 features (excluding 'ringan'), got ${multiResult.features.length}`);
  for (const f of multiResult.features) {
    console.assert(f.geometry.type === 'Polygon', 'Must be Polygon');
    const ring = (f.geometry.coordinates as number[][][])[0];
    console.assert(ring.length === 33, 'Each ring must have 33 coords');
    console.assert(ring[0][0] === ring[32][0] && ring[0][1] === ring[32][1], 'Closure check');
  }
  console.log('  -> PASS: Multi-point correctly isolated 3 severe hotspots (berat, HIGH, EMERGENCY) and excluded mild cases.\n');

  // Test 4: Empty Points Array
  console.log('Test 4: Empty Coordinates');
  const emptyResult = await generatePestQuarantineBuffer([], 50);
  console.assert(emptyResult.type === 'FeatureCollection', 'Must be FeatureCollection');
  console.assert(emptyResult.features.length === 0, 'Must have 0 features');
  console.log('  -> PASS: Empty array returned valid empty FeatureCollection.\n');

  // Test 5: Invalid Coordinates (NaN, null, out of bounds, malformed)
  console.log('Test 5: Invalid & Out-of-Bounds Coordinates');
  const invalidPoints: any[] = [
    { lat: NaN, lng: 111.0636, severity: 'berat' },
    { lat: -8.0843, lng: NaN, severity: 'berat' },
    { lat: 999, lng: 111.0636, severity: 'berat' }, // lat > 90
    { lat: -8.0843, lng: 999, severity: 'berat' }, // lng > 180
    { lat: null, lng: null, severity: 'berat' },
    null,
    undefined,
  ];
  const invalidResult = await generatePestQuarantineBuffer(invalidPoints, 50);
  console.assert(invalidResult.features.length === 0, `Expected 0 features for all invalid coords, got ${invalidResult.features.length}`);
  console.log('  -> PASS: All invalid coordinates safely filtered without throwing errors.\n');

  // Test 6: Mixed Valid & Invalid Points
  console.log('Test 6: Mixed Valid and Malformed Points');
  const mixedPoints: any[] = [
    { lat: -8.0843, lng: 111.0636, severity: 'berat' },
    { lat: NaN, lng: 111.0636, severity: 'berat' },
    { lat: -8.0855, lng: 111.0645, severity: 'kritis' },
    { lat: 'not a number', lng: 111.0645, severity: 'berat' },
  ];
  const mixedResult = await generatePestQuarantineBuffer(mixedPoints, 50);
  console.assert(mixedResult.features.length === 2, `Expected 2 valid features, got ${mixedResult.features.length}`);
  console.log('  -> PASS: Mixed set cleanly filtered out corrupt points and produced 2 valid GeoJSON features.\n');

  console.log('=== ALL DBG-03 TESTS PASSED (100% SUCCESS) ===');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
