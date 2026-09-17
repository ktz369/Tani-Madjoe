import json
import os
import sys
from datetime import date, datetime, timedelta

import ee
from google.oauth2 import service_account

KEY_PATH = r"D:\PEREWANGAN 369\Tani\paci-x-a7a003954fc1.json"
PROJECT_ID = "paci-x"

BENGKOK_COORDS = [
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
    [111.0638405677075, -8.084434308746422],
    [111.0638884461838, -8.084351243965257],
    [111.0640267543814, -8.084230642931377],
    [111.0640465157794, -8.084143148747065],
    [111.0640694893006, -8.084040850088959],
    [111.0640333467563, -8.083969725940973],
    [111.0637346955485, -8.084033547650094],
    [111.0634637628904, -8.084051802423692],
    [111.0633132929326, -8.084082613417486],
    [111.0632474582804, -8.084179911091981],
]

def main():
    print(f"=== TESTING GOOGLE EARTH ENGINE AUTHENTICATION ===")
    print(f"Key Path: {KEY_PATH}")
    print(f"Project ID: {PROJECT_ID}")

    if not os.path.exists(KEY_PATH):
        print(f"ERROR: Key file not found at {KEY_PATH}")
        sys.exit(1)

    with open(KEY_PATH, "r") as f:
        key_data = json.load(f)
    client_email = key_data.get("client_email")
    print(f"Service Account Email: {client_email}")

    credentials = service_account.Credentials.from_service_account_file(
        KEY_PATH,
        scopes=["https://www.googleapis.com/auth/earthengine"]
    )

    try:
        ee.Initialize(credentials=credentials)
        print("SUCCESS: Google Earth Engine initialized successfully with Service Account!")
    except Exception as e:
        print(f"FAILED to initialize GEE: {e}")
        sys.exit(1)

    # 1. Test basic computation
    test_val = ee.Number(42).getInfo()
    print(f"GEE Ping Test (ee.Number(42)): {test_val}")

    # 2. Test Sentinel-2 L2A Collection over Bengkok 1
    poly = ee.Geometry.Polygon([BENGKOK_COORDS])
    end_d = date.today()
    start_d = end_d - timedelta(days=90) # look back 90 days
    print(f"\nQuerying Sentinel-2 SR Harmonized over Bengkok 1 ({start_d} to {end_d})...")

    s2 = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(poly)
        .filterDate(start_d.isoformat(), end_d.isoformat())
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 50))
    )
    count = s2.size().getInfo()
    print(f"Found {count} clear Sentinel-2 scenes over Bengkok 1!")

    if count > 0:
        # Get latest image
        img = s2.sort("system:time_start", False).first()
        t_millis = img.get("system:time_start").getInfo()
        obs_date = datetime.fromtimestamp(t_millis / 1000.0).strftime("%Y-%m-%d %H:%M:%S UTC")
        cloud_pct = img.get("CLOUDY_PIXEL_PERCENTAGE").getInfo()
        print(f"Latest S2 Scene Date: {obs_date}, Cloud Cover: {cloud_pct:.1f}%")

        # Reduce region for bands
        bands = img.select(["B2", "B4", "B5", "B8", "B11"]).multiply(0.0001)
        mean_stats = bands.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=poly,
            scale=10,
            maxPixels=1e8
        ).getInfo()
        print(f"Mean Band Reflectance at Bengkok 1: {mean_stats}")

        if mean_stats and mean_stats.get("B8") is not None and mean_stats.get("B4") is not None:
            b8 = float(mean_stats["B8"])
            b4 = float(mean_stats["B4"])
            b5 = float(mean_stats.get("B5", b4))
            b11 = float(mean_stats.get("B11", 0.1))
            b2 = float(mean_stats.get("B2", 0.05))

            real_ndvi = (b8 - b4) / (b8 + b4) if (b8 + b4) != 0 else 0
            real_ndre = (b8 - b5) / (b8 + b5) if (b8 + b5) != 0 else 0
            real_ndwi = (b8 - b11) / (b8 + b11) if (b8 + b11) != 0 else 0
            real_savi = ((b8 - b4) / (b8 + b4 + 0.5)) * 1.5 if (b8 + b4 + 0.5) != 0 else 0

            print("\n--- ACTUAL REAL SATELLITE INDICES FOR BENGKOK 1 ---")
            print(f"REAL NDVI: {real_ndvi:.4f}")
            print(f"REAL NDRE: {real_ndre:.4f}")
            print(f"REAL NDWI: {real_ndwi:.4f}")
            print(f"REAL SAVI: {real_savi:.4f}")

        # Test Map ID generation for True Color RGB
        vis_params = {"bands": ["B4", "B3", "B2"], "min": 0, "max": 3000}
        map_id = img.getMapId(vis_params)
        tile_url = map_id["tile_fetcher"].url_format
        print(f"\nReal GEE Sentinel-2 True Color Tile URL Format:\n{tile_url}")

    # 3. Test Sentinel-1 SAR over Bengkok 1
    print(f"\nQuerying Sentinel-1 SAR GRD over Bengkok 1...")
    s1 = (
        ee.ImageCollection("COPERNICUS/S1_GRD")
        .filterBounds(poly)
        .filterDate(start_d.isoformat(), end_d.isoformat())
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH"))
        .filter(ee.Filter.eq("instrumentMode", "IW"))
    )
    s1_count = s1.size().getInfo()
    print(f"Found {s1_count} Sentinel-1 SAR scenes over Bengkok 1!")
    if s1_count > 0:
        s1_img = s1.sort("system:time_start", False).first()
        s1_t_millis = s1_img.get("system:time_start").getInfo()
        s1_date = datetime.fromtimestamp(s1_t_millis / 1000.0).strftime("%Y-%m-%d %H:%M:%S UTC")
        s1_stats = s1_img.select(["VV", "VH"]).reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=poly,
            scale=10,
            maxPixels=1e8
        ).getInfo()
        print(f"Latest S1 SAR Scene Date: {s1_date}")
        print(f"REAL Sentinel-1 SAR Backscatter (dB): {s1_stats}")

    print("\n=== ALL GEE LIVE TESTS COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    main()
