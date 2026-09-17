import {
  getMapboxToken,
  isMapboxTokenValid,
  OPEN_SATELLITE_STYLE,
  OPEN_STREETS_STYLE,
  getMapStyle,
  applyMapboxToken,
} from "./mapStyles";

// Simple test runner for mapStyles
function runTests() {
  const originalEnv = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`PASS: ${message}`);
      passed++;
    } else {
      console.error(`FAIL: ${message}`);
      failed++;
    }
  }

  console.log("--- Starting mapStyles Tests ---");

  // Test 1: Empty / undefined token
  delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  assert(getMapboxToken() === "", "Empty token returns empty string");
  assert(isMapboxTokenValid() === false, "Empty token is marked invalid");

  // Test 2: Example placeholder token
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN =
    "pk.eyJ1IjoiZXhhbXBsZSIsImEiOiJjbGV4YW1wbGUifQ.example";
  assert(
    getMapboxToken() === "",
    "Placeholder token starting with pk.eyJ1IjoiZXhhbXBsZS returns empty string"
  );
  assert(isMapboxTokenValid() === false, "Placeholder token is marked invalid");

  // Test 3: Token with 'example' in it
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "pk.my_example_token_abc";
  assert(
    getMapboxToken() === "",
    "Token containing 'example' returns empty string"
  );
  assert(isMapboxTokenValid() === false, "'example' token is marked invalid");

  // Test 4: Token not starting with 'pk.'
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "sk.eyJ1Ijoiam9obiJ9.secret123";
  assert(
    getMapboxToken() === "",
    "Token not starting with 'pk.' returns empty string"
  );

  // Test 5: Valid token
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "pk.eyJ1IjoidGVzdHVzZXIiLCJhIjoiMTIzNDU2Nzg5MCJ9.abcdef";
  assert(
    getMapboxToken() === "pk.eyJ1IjoidGVzdHVzZXIiLCJhIjoiMTIzNDU2Nzg5MCJ9.abcdef",
    "Valid token is preserved and returned"
  );
  assert(isMapboxTokenValid() === true, "Valid token is marked valid");

  // Test 6: OPEN_SATELLITE_STYLE structure
  assert(OPEN_SATELLITE_STYLE.version === 8, "OPEN_SATELLITE_STYLE version is 8");
  const satSources = OPEN_SATELLITE_STYLE.sources as Record<string, any>;
  assert(Boolean(satSources["esri-world-imagery"]), "Esri World Imagery source exists");
  assert(
    satSources["esri-world-imagery"].tiles[0].includes("arcgisonline.com"),
    "Esri tile URL is configured properly"
  );
  assert(OPEN_SATELLITE_STYLE.layers.length > 0, "Satellite raster layers exist");

  // Test 7: OPEN_STREETS_STYLE structure
  assert(OPEN_STREETS_STYLE.version === 8, "OPEN_STREETS_STYLE version is 8");
  const streetsSources = OPEN_STREETS_STYLE.sources as Record<string, any>;
  assert(Boolean(streetsSources["osm-tiles"]), "OSM tiles source exists");
  assert(
    streetsSources["osm-tiles"].tiles[0].includes("tile.openstreetmap.org"),
    "OSM tile URL is configured properly"
  );
  assert(OPEN_STREETS_STYLE.layers.length > 0, "Street raster layers exist");

  // Test 8: getMapStyle fallback when token is invalid
  delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  assert(
    getMapStyle("satellite") === OPEN_SATELLITE_STYLE,
    "getMapStyle('satellite') returns OPEN_SATELLITE_STYLE without token"
  );
  assert(
    getMapStyle("streets") === OPEN_STREETS_STYLE,
    "getMapStyle('streets') returns OPEN_STREETS_STYLE without token"
  );

  // Test 9: getMapStyle when token is valid
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "pk.eyJ1IjoidGVzdHVzZXIiLCJhIjoiMTIzNDU2Nzg5MCJ9.abcdef";
  assert(
    getMapStyle("satellite") === "mapbox://styles/mapbox/satellite-streets-v12",
    "getMapStyle('satellite') returns mapbox URL with valid token"
  );
  assert(
    getMapStyle("streets") === "mapbox://styles/mapbox/outdoors-v12",
    "getMapStyle('streets') returns mapbox URL with valid token"
  );

  // Test 10: applyMapboxToken
  const mockMapbox: { accessToken?: string } = { accessToken: "old-broken-token" };
  delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  applyMapboxToken(mockMapbox);
  assert(
    mockMapbox.accessToken === "",
    "applyMapboxToken resets accessToken to empty string when token is invalid"
  );

  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "pk.eyJ1IjoidGVzdHVzZXIiLCJhIjoiMTIzNDU2Nzg5MCJ9.abcdef";
  applyMapboxToken(mockMapbox);
  assert(
    mockMapbox.accessToken === "pk.eyJ1IjoidGVzdHVzZXIiLCJhIjoiMTIzNDU2Nzg5MCJ9.abcdef",
    "applyMapboxToken sets accessToken to valid token when token is valid"
  );

  // Restore env
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = originalEnv;

  console.log(`\nTests finished: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    throw new Error(`${failed} tests failed!`);
  }
}

runTests();
