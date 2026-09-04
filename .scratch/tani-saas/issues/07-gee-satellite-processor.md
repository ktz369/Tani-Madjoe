# 07: GEE Satellite Processor — Indeks Spektral

**What to build:** Scheduled job yang berjalan harian, mengambil citra Sentinel-2 terbaru dari Google Earth Engine per poligon petak, menghitung 5 indeks spektral (NDVI, NDRE, NDWI, SAVI, BSI) sebagai rata-rata per poligon, dan mengambil SAR Sentinel-1 backscatter (VV/VH dB). Hasil disimpan ke tabel spectral_indices. Jika hari itu tidak ada citra baru (revisit 5 hari), skip petak tersebut.

**Blocked by:** 05-plot-crud-draw-polygon

**Status:** completed

- [x] Model `SpectralIndex`: id, plot_id (FK), observation_date, satellite (sentinel-2/sentinel-1), ndvi, ndre, ndwi, savi, bsi, sar_vv_db, sar_vh_db, cloud_cover_pct
- [x] Alembic migration untuk tabel spectral_indices
- [x] Service `gee_service.py`: inisialisasi GEE dengan Service Account JSON key
- [x] Service `satellite_indices.py`: fungsi-fungsi kalkulasi NDVI, NDRE, NDWI, SAVI (L=0.5), BSI menggunakan band Sentinel-2
- [x] GEE computation: untuk setiap poligon petak, query `COPERNICUS/S2_SR_HARMONIZED` image collection, filter tanggal (1 hari terakhir yang tersedia), cloud mask (SCL band), hitung indeks, reduceRegion(ee.Reducer.mean()) per poligon
- [x] GEE computation: query `COPERNICUS/S1_GRD` untuk SAR VV/VH backscatter (dB), reduceRegion mean per poligon
- [x] Scheduled job via APScheduler: berjalan setiap hari jam 06:00 WIB
- [x] Endpoint `GET /api/plots/{id}/indices?start_date=&end_date=` — mengembalikan time-series indeks spektral
- [x] Endpoint manual trigger `POST /api/jobs/satellite` — untuk testing tanpa menunggu schedule
- [x] Unit test: fungsi kalkulasi indeks (input band values → output index)
