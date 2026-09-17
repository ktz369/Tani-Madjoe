const routes = [
  '/login',
  '/dashboard',
  '/peta',
  '/petak/1',
  '/laporan',
  '/admin/petak-baru',
  '/admin/organisasi',
  '/admin/varietas',
];

async function checkRoutes() {
  console.log('--- Verifying Frontend Routes on http://localhost:3000 ---');
  let failures = 0;
  for (const route of routes) {
    try {
      const res = await fetch(`http://localhost:3000${route}`);
      const text = await res.text();
      const hasError = text.includes('Failed to compile') || text.includes('Unhandled Runtime Error');
      if (res.status === 200 && !hasError) {
        console.log(`[PASS] ${route} -> Status: 200 OK (${(text.length / 1024).toFixed(1)} KB)`);
      } else {
        console.error(`[FAIL] ${route} -> Status: ${res.status}, hasCompileError: ${hasError}`);
        failures++;
      }
    } catch (err) {
      console.error(`[ERROR] ${route} -> ${err.message}`);
      failures++;
    }
  }
  if (failures === 0) {
    console.log('ALL_ROUTES_OK: All routes compiled and rendered successfully with ZERO errors!');
  } else {
    console.error(`${failures} route(s) failed.`);
    process.exit(1);
  }
}

checkRoutes();
