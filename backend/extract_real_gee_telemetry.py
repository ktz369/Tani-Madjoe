import json
from datetime import datetime
import ee
from google.oauth2 import service_account

KEY_PATH = r"D:\PEREWANGAN 369\Tani\paci-x-a7a003954fc1.json"

credentials = service_account.Credentials.from_service_account_file(
    KEY_PATH,
    scopes=["https://www.googleapis.com/auth/earthengine"]
)
ee.Initialize(credentials=credentials)

BENGKOK_COORDS = [
    [111.0632475, -8.0841799], [111.0632340, -8.0842242], [111.0632402, -8.0842685],
    [111.0632726, -8.0843325], [111.0633705, -8.0843500], [111.0634159, -8.0843384],
    [111.0634699, -8.0843861], [111.0635063, -8.0844383], [111.0635559, -8.0844782],
    [111.0635870, -8.0845081], [111.0636082, -8.0845603], [111.0636878, -8.0845655],
    [111.0637463, -8.0845530], [111.0638206, -8.0844833], [111.0638406, -8.0844343],
    [111.0638884, -8.0843512], [111.0640268, -8.0842306], [111.0640465, -8.0841431],
    [111.0640695, -8.0840409], [111.0640333, -8.0839697], [111.0637347, -8.0840335],
    [111.0634638, -8.0840518], [111.0633133, -8.0840826], [111.0632475, -8.0841799]
]
poly = ee.Geometry.Polygon([BENGKOK_COORDS])

# 1. Query Sentinel-2
s2 = (
    ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(poly)
    .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40))
    .sort("system:time_start", False)
    .limit(10)
)

def extract_record(img):
    img = ee.Image(img)
    t = img.get("system:time_start")
    cloud = img.get("CLOUDY_PIXEL_PERCENTAGE")
    b = img.select(["B8", "B4", "B5", "B11", "B2"]).multiply(0.0001)
    stats = b.reduceRegion(reducer=ee.Reducer.mean(), geometry=poly, scale=10, maxPixels=1e8)
    return ee.Feature(None, {
        "time": t,
        "cloud": cloud,
        "b8": stats.get("B8"),
        "b4": stats.get("B4"),
        "b5": stats.get("B5"),
        "b11": stats.get("B11"),
        "b2": stats.get("B2"),
    })

feats = s2.map(extract_record).getInfo()["features"]
s2_results = []
for f in feats:
    p = f["properties"]
    if p.get("b8") is not None and p.get("b4") is not None:
        dt = datetime.fromtimestamp(p["time"] / 1000.0).strftime("%Y-%m-%d")
        b8 = float(p["b8"])
        b4 = float(p["b4"])
        b5 = float(p.get("b5") or b4)
        b11 = float(p.get("b11") or 0.1)
        b2 = float(p.get("b2") or 0.05)
        ndvi = (b8 - b4) / (b8 + b4) if (b8 + b4) != 0 else 0
        ndre = (b8 - b5) / (b8 + b5) if (b8 + b5) != 0 else 0
        ndwi = (b8 - b11) / (b8 + b11) if (b8 + b11) != 0 else 0
        savi = ((b8 - b4) / (b8 + b4 + 0.5)) * 1.5 if (b8 + b4 + 0.5) != 0 else 0
        bsi = ((b11 + b4) - (b8 + b2)) / ((b11 + b4) + (b8 + b2)) if ((b11 + b4) + (b8 + b2)) != 0 else 0
        cloud = float(p["cloud"])
        s2_results.append({
            "date": dt,
            "ndvi": round(ndvi, 4),
            "ndre": round(ndre, 4),
            "ndwi": round(ndwi, 4),
            "savi": round(savi, 4),
            "bsi": round(bsi, 4),
            "cloud_cover_pct": round(cloud, 1),
        })

# 2. Get Real Sentinel-2 Tile URL
latest_img = s2.first()
vis_params = {"bands": ["B4", "B3", "B2"], "min": 0, "max": 2500}
map_id = latest_img.getMapId(vis_params)
tile_url = map_id["tile_fetcher"].url_format

# 3. Query Sentinel-1 SAR
s1 = (
    ee.ImageCollection("COPERNICUS/S1_GRD")
    .filterBounds(poly)
    .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
    .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH"))
    .filter(ee.Filter.eq("instrumentMode", "IW"))
    .sort("system:time_start", False)
    .limit(6)
)

def extract_sar(img):
    img = ee.Image(img)
    t = img.get("system:time_start")
    stats = img.select(["VV", "VH"]).reduceRegion(reducer=ee.Reducer.mean(), geometry=poly, scale=10, maxPixels=1e8)
    return ee.Feature(None, {
        "time": t,
        "vv": stats.get("VV"),
        "vh": stats.get("VH"),
    })

sar_feats = s1.map(extract_sar).getInfo()["features"]
s1_results = []
for f in sar_feats:
    p = f["properties"]
    if p.get("vv") is not None:
        dt = datetime.fromtimestamp(p["time"] / 1000.0).strftime("%Y-%m-%d")
        vv = float(p["vv"])
        vh = float(p.get("vh") or -20.0)
        s1_results.append({
            "date": dt,
            "sar_vv_db": round(vv, 2),
            "sar_vh_db": round(vh, 2),
        })

output_data = {
    "plot_name": "Bengkok 1",
    "polygon_vertices": 24,
    "source": "Google Earth Engine (Live Satellites: Sentinel-2 & Sentinel-1)",
    "tile_url": tile_url,
    "sentinel_2_observations": s2_results,
    "sentinel_1_sar_observations": s1_results,
}

with open(r"D:\PEREWANGAN 369\Tani\backend\real_gee_telemetry.json", "w") as out_f:
    json.dump(output_data, out_f, indent=2)

print("SUCCESS: Real GEE telemetry extracted and saved to backend/real_gee_telemetry.json")
print(json.dumps(output_data, indent=2))
