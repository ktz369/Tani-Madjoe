# Dokumen Handoff Sesi 4: SaaS Platform Monitoring Pertanian Presisi "Tani"

**Status Proyek:** 
- **Fase Fondasi (Wave 1 s/d Wave 6):** 100% Selesai (Tiket 01 s/d Tiket 17)
- **Fase Ekstensi Geospasial (Wave 7 — KML/KMZ/GeoJSON Import Pipeline):** 100% Selesai (Tiket 01 s/d Tiket 06, 85 Passed Tests)
- **Fase Sinkronisasi Lanjutan & Impor Massal (Wave 8 — Auto-Centroid, Satellite Backfill & Batch Wizard):** Siap Implementasi (Spec & 6 Tiket Siap di `/implement`)
**Tanggal:** 5 September 2026  
**Lingkup:** Backend FastAPI (PostGIS/SQLAlchemy Async + Alembic), Frontend Next.js 14 App Router (Tailwind CSS, Mapbox GL JS, Recharts), Processing Pipeline (GEE, Open-Meteo, FAO-56 Penman-Monteith, GDD Jagung & Padi, Alert Engine 4 Aturan, ReportLab PDF, CSV Export, SMTP Email Notification), APScheduler Cron Jobs, serta Fitur Impor Geospasial KML/KMZ/GeoJSON Tunggal & Massal.

---

## 1. Ringkasan Eksekutif & Status Terkini Sesi 4

Pada sesi ini, seluruh rangkaian **Wave 7 (Tiket 01 s/d Tiket 06)** telah berhasil diimplementasikan secara tuntas (*end-to-end*):
1. **Core KML/KMZ/GeoJSON Parser:** Mengurai berkas geospasial murni berbasis Python (`xml.etree.ElementTree`, `zipfile`, `json`) tanpa ketergantungan library C native. Berhasil diuji terhadap sampel riil `Bengkoxxx1.kml`: 24 verteks, luas **0.3688 Ha (3.687,7 m²)**, dan nama "Bengkok 1".
2. **Kalkulator Geodesik & Validasi Topologi:** Formula *Chamberlain & Duquette (1995)* menghasilkan presisi identik dengan PostGIS Geography ST_Area. Normalisasi cincin tertutup dan validasi WGS84 $-180..180^\circ / -90..90^\circ$.
3. **API Endpoint Preview:** `POST /api/plots/import-preview` (dan alias `/api/plots/parse-kml`) siap menerima upload multipart atau JSON payload dengan otentikasi JWT.
4. **Antarmuka Pengguna Drag & Drop:** Dropzone terintegrasi di `/admin/petak-baru`, auto-fill nama petak, badge kalkulasi luas instan, serta tombol Reset Berkas.
5. **Animasi Mapbox GL & Auto-FitBounds:** Render batas poligon kontras tinggi, penanda verteks sudut, dan transisi kamera mulus langsung ke bounding box petak.
6. **Registrasi PostGIS & Auto-Sync:** Form menyimpan poligon ke PostGIS, memicu sync cuaca Open-Meteo & $ET_0$, menginisiasi GDD, memasukkan observasi baseline Sentinel-2, dan mengarahkan pengguna ke `/petak/{id}`.
7. **Verifikasi Suite Uji:** 85 test suites (83 passed, 2 skipped integration tests) lolos dalam 0.54s, dan seluruh pekerjaan telah terkomit di git repository (`feat(geospatial): implement Wave 7 KML/KMZ/GeoJSON import pipeline`).

---

## 2. Perencanaan Wave 8: Auto-Centroid, Satellite Backfill & Multi-Placemark Batch Import

Sesuai arahan dan diskusi, spesifikasi Wave 8 telah disusun di [`.scratch/wave-8-sync-and-batch/spec.md`](file:///D:/PEREWANGAN%20369/Tani/.scratch/wave-8-sync-and-batch/spec.md) dan dipecah menjadi **6 tiket kerja terisolasi (*vertical slices*)** di [`.scratch/wave-8-sync-and-batch/issues/`](file:///D:/PEREWANGAN%20369/Tani/.scratch/wave-8-sync-and-batch/issues/):

### Tiket 01: Auto-Centroid Estate Geolocation & Weather Propagation
* **Berkas:** [`.scratch/wave-8-sync-and-batch/issues/01-auto-centroid-estate-gps.md`](file:///D:/PEREWANGAN%20369/Tani/.scratch/wave-8-sync-and-batch/issues/01-auto-centroid-estate-gps.md)
* **Tujuan:** Jika sebuah Estate belum memiliki koordinat GPS (`location_point is null`), secara otomatis set titik GPS estate mengambil titik sentroid dari petak KML pertama yang didaftarkan dan langsung picu sinkronisasi cuaca Open-Meteo & $ET_0$ di koordinat presisi tersebut.
* **Blocked by:** *None (Dapat langsung dikerjakan)*

### Tiket 02: Multi-Placemark KML & GeoJSON Collection Parser
* **Berkas:** [`.scratch/wave-8-sync-and-batch/issues/02-multi-placemark-kml-parser.md`](file:///D:/PEREWANGAN%20369/Tani/.scratch/wave-8-sync-and-batch/issues/02-multi-placemark-kml-parser.md)
* **Tujuan:** Memperluas `kml_parser.py` untuk mengekstrak seluruh `<Placemark>` yang memiliki poligon dalam satu berkas KML/KMZ atau FeatureCollection GeoJSON, menghitung luas masing-masing, serta menghasilkan akumulasi total luas dan *unified bounding box*.
* **Blocked by:** *None (Dapat langsung dikerjakan)*

### Tiket 03: Batch Spatial Import Preview & Validation API
* **Berkas:** [`.scratch/wave-8-sync-and-batch/issues/03-batch-import-preview-api.md`](file:///D:/PEREWANGAN%20369/Tani/.scratch/wave-8-sync-and-batch/issues/03-batch-import-preview-api.md)
* **Tujuan:** Endpoint FastAPI `POST /api/plots/batch-import-preview` yang menerima berkas multi-placemark dan mengembalikan daftar array ringkasan seluruh petak terdeteksi, status validitas topologi, dan batas koordinat gabungan.
* **Blocked by:** Tiket 02

### Tiket 04: 30-Day Historical Satellite Telemetry Backfill Pipeline
* **Berkas:** [`.scratch/wave-8-sync-and-batch/issues/04-historical-satellite-backfill-pipeline.md`](file:///D:/PEREWANGAN%20369/Tani/.scratch/wave-8-sync-and-batch/issues/04-historical-satellite-backfill-pipeline.md)
* **Tujuan:** Layanan asinkron `satellite_backfill_service.py` untuk mengisi tabel `spectral_indices` dengan runtun waktu 30 hari ke belakang (interval 5 hari = 6 observasi) begitu petak baru didaftarkan, sehingga grafik NDVI/NDRE/NDWI langsung hidup dan menampilkan tren riwayat pertumbuhan.
* **Blocked by:** *None (Dapat langsung dikerjakan)*

### Tiket 05: Frontend Batch Import Wizard & Multi-Polygon Mapbox Viewer
* **Berkas:** [`.scratch/wave-8-sync-and-batch/issues/05-batch-import-wizard-ui.md`](file:///D:/PEREWANGAN%20369/Tani/.scratch/wave-8-sync-and-batch/issues/05-batch-import-wizard-ui.md)
* **Tujuan:** Komponen antarmuka tab "Impor Massal (Batch KML)" pada `/admin/petak-baru`, menampilkan tabel preview dengan checkbox include/exclude, batch setting varietas dan tanggal tanam, serta render multi-poligon bersamaan di Mapbox GL dengan auto-fitBounds.
* **Blocked by:** Tiket 03

### Tiket 06: Bulk Plot Registration, Transactional PostGIS Save & Telemetry Activation
* **Berkas:** [`.scratch/wave-8-sync-and-batch/issues/06-bulk-registration-telemetry-activation.md`](file:///D:/PEREWANGAN%20369/Tani/.scratch/wave-8-sync-and-batch/issues/06-bulk-registration-telemetry-activation.md)
* **Tujuan:** Endpoint `POST /api/plots/batch-create` untuk menyimpan seluruh petak yang dipilih dalam satu transaksi database atomik, memperbarui sentroid estate, memicu cuaca, GDD, dan antrean backfill satelit 30 hari untuk seluruh petak sekaligus.
* **Blocked by:** Tiket 01, Tiket 04, Tiket 05

---

## 3. Instruksi Memulai Sesi Berikutnya (`/implement`)

Pada sesi berikutnya, agen dapat langsung menjalankan perintah:
```bash
/implement D:\PEREWANGAN 369\Tani\handoff\HANDOFF.md . Pakai fleet worker. Kasih auto approve. HARUS AUTO APPROVE
```

Urutan eksekusi frontier:
1. Kerjakan **Tiket 01** (`01-auto-centroid-estate-gps.md`), **Tiket 02** (`02-multi-placemark-kml-parser.md`), dan **Tiket 04** (`04-historical-satellite-backfill-pipeline.md`) yang tidak memiliki blockers.
2. Lanjutkan ke **Tiket 03** dan **Tiket 05**.
3. Selesaikan dengan **Tiket 06** (*bulk registration & telemetry activation*).
4. Jalankan pengujian test suite: `python -m unittest discover -s tests -p "test_*.py"`.
5. Komit hasil pekerjaan ke master branch.

---

## 4. Riwayat Tiket Selesai (Wave 1 s/d Wave 7)

| Gelombang | Tiket | Nama Fitur | Status |
|---|---|---|---|
| **Wave 1** | 01–03 | Docker Compose, Auth & RBAC, Organization Hierarchy | Selesai |
| **Wave 2** | 04–06 | Crop Varieties, Plot CRUD PostGIS, Planting Seasons | Selesai |
| **Wave 3** | 07–09 | GEE Satellite Processor, Weather Fetcher & ET₀, GDD Calculator | Selesai |
| **Wave 4** | 10–12 | Alert Engine (4 Rules), Main Dashboard, In-App Alert Panel | Selesai |
| **Wave 5** | 13–15 | Plot Detail Stepper, 16-Day Weather Widget, Timelapse Satellite Overlay | Selesai |
| **Wave 6** | 16–17 | ReportLab PDF / CSV Reporting, SMTP Email Daily Summary | Selesai |
| **Wave 7** | 01–06 | KML/KMZ/GeoJSON Parser, Geodesic Area, Import Preview API, Dropzone UI, Mapbox FitBounds, PostGIS Auto-Sync | Selesai |

---

## 5. Ringkasan Berkas Kunci Proyek

* **Spesifikasi Wave 8:** [`.scratch/wave-8-sync-and-batch/spec.md`](file:///D:/PEREWANGAN%20369/Tani/.scratch/wave-8-sync-and-batch/spec.md)
* **Direktori Tiket Wave 8:** [`.scratch/wave-8-sync-and-batch/issues/`](file:///D:/PEREWANGAN%20369/Tani/.scratch/wave-8-sync-and-batch/issues/)
* **Spesifikasi Wave 7:** [`.scratch/kml-import/spec.md`](file:///D:/PEREWANGAN%20369/Tani/.scratch/kml-import/spec.md)
* **Parser Geospasial Backend:** [`backend/app/utils/kml_parser.py`](file:///D:/PEREWANGAN%20369/Tani/backend/app/utils/kml_parser.py)
* **Halaman Pendaftaran Petak:** [`frontend/src/app/admin/petak-baru/page.tsx`](file:///D:/PEREWANGAN%20369/Tani/frontend/src/app/admin/petak-baru/page.tsx)
* **Router Petak Backend:** [`backend/app/api/plots.py`](file:///D:/PEREWANGAN%20369/Tani/backend/app/api/plots.py)
* **Test Suite:** `backend/tests/test_*.py` (85 tests, 83 passed, 2 skipped)
