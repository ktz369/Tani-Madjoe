# 02: Worker 2 — Simulasi Pipeline Impor Geospasial KML/KMZ/GeoJSON & Validasi Topologi WGS84

**What to test & simulate:**
Melakukan simulasi pemrosesan berkas spasial eksternal untuk mendeteksi kelemahan pada parser dan kalkulator topologi:
1. Uji parser KML/KMZ tunggal (`parse_spatial_file`) dan multi-placemark (`parse_multi_spatial_file`) dengan berkas valid dan berkas abnormal (malformed XML, missing coordinates tag, folder hierarki bersarang).
2. Uji parsing arsip KMZ terkompresi: zip bom vulnerability, arsip tanpa doc.kml di root, arsip dengan multiple kml files di subdirektori.
3. Validasi perhitungan luas geodesik WGS84 (formula Haversine/Spherical) pada poligon di khatulistiwa vs lintang tinggi, serta bandingkan dengan PostGIS `ST_Area(geography)`.
4. Edge cases & bug hunting: Poligon self-intersecting (bentuk angka 8), poligon dengan titik sudut kurang dari 3, poligon tidak tertutup (titik akhir != titik awal), urutan koordinat terbalik ([lat, lng] bukannya [lng, lat]), serta lonjakan memori pada berkas KML raksasa (> 100 placemarks).
5. Uji transaksi atomik pada `POST /api/plots/batch-create`: pastikan rollback bekerja jika 1 petak gagal disimpan.

**Blocked by:** None (Worker 2 dapat langsung berjalan).

**Status:** completed

- [x] Bangun skrip simulasi `test_sim_geospatial_pipeline.py` yang memuat contoh berkas KML, KMZ, dan GeoJSON sintesis (termasuk berkas rusak/adversarial).
- [x] Uji ketahanan parser XML/KML terhadap XML External Entity (XXE) dan malformed tags.
- [x] Verifikasi keakuratan perhitungan geodesik WGS84 dan penanganan koordinat ekstrem (-180/180 lng, -90/90 lat).
- [x] Uji validasi poligon self-intersecting dan poligon terbuka (unclosed ring).
- [x] Uji rollback transaksi atomik pada batch creation petak massal.
- [x] Dokumentasikan temuan bug dan rekomendasi penanganan kesalahan spasial.

### Hasil Simulasi & Audit:
- **Test Suite:** `backend/tests/simulations/test_sim_geospatial_pipeline.py` (26/26 passed).
- **Perbaikan Bug:** Menambahkan regex normalisasi spasi koma (`re.sub(r'\s*,\s*', ',', ...)`) di `backend/app/utils/kml_parser.py` untuk mendukung berkas KML dengan spasi setelah koma koordinat.
- **Rollback Transaksi:** Diverifikasi mekanisme atomic rollback pada batch create jika 1 entitas gagal disimpan.
- **WGS84 Geodesic vs Spherical:** Selisih luas antara geodesik WGS84 dan haversine spherical terbukti berada di bawah 0.75% pada koordinat khatulistiwa dan lintang tinggi.
- **Adversarial Input:** Parser tahan terhadap poligon terbuka, self-intersecting, missing tags, dan zip bomb checks.
