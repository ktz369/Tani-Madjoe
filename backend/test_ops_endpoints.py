import json
import threading
import time
import urllib.request
import urllib.error
import http.server
from demo_server import DemoAPIHandler

TEST_PORT = 8008
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
urllib.request.install_opener(opener)
server = http.server.ThreadingHTTPServer(('127.0.0.1', TEST_PORT), DemoAPIHandler)
t = threading.Thread(target=server.serve_forever, daemon=True)
t.start()
time.sleep(0.5)

base = f'http://127.0.0.1:{TEST_PORT}/api/v1'

def get(path):
    req = urllib.request.Request(f'{base}{path}')
    with urllib.request.urlopen(req) as resp:
        return resp.status, json.loads(resp.read().decode())

def post(path, body):
    data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(f'{base}{path}', data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())

print('1. Testing GET /plots/1/labor...')
s, d = get('/plots/1/labor')
assert s == 200 and len(d) >= 3, f'Expected >=3 labor logs, got {len(d)}'
print('   -> PASS: ' + str(len(d)) + ' labor logs found')

print('2. Testing GET /plots/1/irrigation...')
s, d = get('/plots/1/irrigation')
assert s == 200 and len(d) >= 2, f'Expected >=2 irrigation logs, got {len(d)}'
print('   -> PASS: ' + str(len(d)) + ' irrigation logs found')

print('3. Testing GET /saprotan...')
s, d = get('/saprotan')
assert s == 200 and len(d) >= 5, f'Expected >=5 saprotan items, got {len(d)}'
print('   -> PASS: ' + str(len(d)) + ' saprotan items found')

print('4. Testing GET /plots/1/scouting...')
s, d = get('/plots/1/scouting')
assert s == 200 and len(d) >= 2, f'Expected >=2 scouting reports, got {len(d)}'
print('   -> PASS: ' + str(len(d)) + ' scouting reports found')

print('5. Testing GET /plots/1/financial-summary...')
s, d = get('/plots/1/financial-summary')
assert s == 200 and 'projected_hpp_per_kg' in d and 'efficiency_ratio' in d, f'Invalid summary: {d}'
print('   -> PASS: Total running cost: Rp' + str(d['total_running_cost']) + ', HPP/kg: Rp' + str(d['projected_hpp_per_kg']) + ', Ratio: ' + str(d['efficiency_ratio']) + ' (' + str(d['efficiency_status']) + ')')

print('6. Testing POST /plots/1/apply-saprotan PHI GUARDRAIL...')
# Virtako 300 SC has PHI = 14 days. If harvest is in 10 days, application must be REJECTED with 400!
app_date = '2026-09-07'
harvest_soon = '2026-09-17' # 10 days diff < 14 PHI
s, d = post('/plots/1/apply-saprotan', {
    'item_id': 1,
    'application_date': app_date,
    'target_harvest_date': harvest_soon,
    'quantity_used': 0.5
})
assert s == 400 and d.get('error_code') == 'PHI_VIOLATION', f'Expected PHI_VIOLATION 400, got {s}: {d}'
print('   -> PASS: Correctly blocked by PHI Guardrail (HTTP 400): ' + str(d['detail']))

# Allowed application (Urea Petro, PHI = 0)
s, d = post('/plots/1/apply-saprotan', {
    'item_id': 2,
    'application_date': app_date,
    'target_harvest_date': harvest_soon,
    'quantity_used': 20.0
})
assert s == 201, f'Expected 201 for Urea application, got {s}: {d}'
print('   -> PASS: Allowed safe application (HTTP 201): Item ' + str(d['item_name']) + ', total: Rp' + str(d['total_cost']))

print('7. Testing POST /plots/1/harvest-closing (14% MOISTURE RAFAKSI FORMULA)...')
# Gross: 2550 kg, Moisture: 21.5%, Dockage: 3%
# Formula: 2550 * (1 - 0.03) * ((100 - 21.5) / (100 - 14)) = 2473.5 * (78.5 / 86) = 2257.79 kg
s, d = post('/plots/1/harvest-closing', {
    'harvest_date': '2026-09-07',
    'gross_yield_kg': 2550.0,
    'moisture_content_pct': 21.5,
    'dockage_pct': 3.0,
    'selling_price_per_kg': 6800.0,
    'storage_location': 'Gudang Pacitan Barat'
})
assert s == 201, f'Expected 201 for harvest closing, got {s}: {d}'
assert abs(d['net_yield_kg'] - 2257.79) < 0.1, 'Math formula mismatch: expected ~2257.79, got ' + str(d['net_yield_kg'])
print('   -> PASS: 14% Moisture Standardization: Gross ' + str(d['gross_yield_kg']) + ' kg (21.5% KA, 3% Dockage) -> Net ' + str(d['net_yield_kg']) + ' kg std 14%')
print('            Revenue: Rp' + str(d['total_revenue']) + ', Cost: Rp' + str(d['total_cost']) + ', Net Profit: Rp' + str(d['net_profit']) + ' (ROI: ' + str(d['roi_pct']) + '%)')

print('\nALL 7 OPS-02 ENDPOINTS & MATHEMATICAL ENGINES VERIFIED SUCCESSFULLY!')
server.shutdown()
