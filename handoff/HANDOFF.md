# Dokumen Handoff Sesi 3: SaaS Platform Monitoring Pertanian Presisi "Tani"

**Status Proyek:** 
- **Fase Fondasi (Wave 1 s/d Wave 6):** 100% Selesai (Tiket 01 s/d Tiket 17)
- **Fase Ekstensi Geospasial (Wave 7 — KML/KMZ/GeoJSON Import):** Siap Implementasi (Spec & 6 Tiket Ringan Siap di `/implement`)
**Tanggal:** 5 September 2026  
**Lingkup:** Backend FastAPI (PostGIS/SQLAlchemy Async + Alembic), Frontend Next.js 14 App Router (Tailwind CSS, Mapbox GL JS, Recharts), Processing Pipeline (GEE, FAO-56 Penman-Monteith, GDD Jagung & Padi, Alert Engine 4 Aturan, ReportLab PDF, CSV Export, SMTP Email Notification), APScheduler Cron Jobs, serta Fitur Ekstensi Impor Berkas Geospasial KML/KMZ/GeoJSON (`Bengkoxxx1.kml`).

---

## 1. Ringkasan Eksekutif & Status Terkini

Platform SaaS Pertanian Presisi **"Tani"** telah beroperasi dengan 17 tiket teknis fondasi (Wave 1 s/d Wave 6) yang lulus pengujian 71 passed test suites.

Pada sesi ini, telah dilakukan analisis kelayakan terhadap berkas pemetaan riil [Bengkoxxx1.kml](file:///D:/PEREWANGAN%20369/Tani/Bengkoxxx1.kml):
- **Hasil Analisis Berkas:** Placemark `Bengkok 1`, koordinat lat `-8.084` / lon `111.063` (Pacitan/Wonogiri), 24 titik batas poligon (*LinearRing*), luas terhitung **0.3688 Hektar (3.687,7 m²)**.
- **Kebutuhan Fitur:** Pengguna membutuhkan kemampuan mengunggah berkas KML/KMZ/GeoJSON secara langsung di antarmuka pendaftaran petak (`/admin/petak-baru`) agar poligon, nama petak, dan luas terisi otomatis dan kamera Mapbox langsung memusat ke lahan, menggantikan proses gambar manual satu per satu.
- **Perencanaan Telah Selesai:** Telah disusun spesifikasi lengkap di [`.scratch/kml-import/spec.md`](file:///D:/PEREWANGAN%20369/Tani/.scratch/kml-import/spec.md) dan dipecah menjadi **6 tiket kerja ringan (*lightweight vertical slices*)** di [`.scratch/kml-import/issues/`](file:///D:/PEREWANGAN%20369/Tani/.scratch/kml-import/issues/).

---

## 2. Rincian Tiket Wave 7: KML & GeoJSON Import Pipeline

Seluruh tiket dirancang berukuran kecil (10–15 menit pengerjaan per tiket), terisolasi, dan mudah diuji secara independen:

### Tiket 01: Core KML Parser and WGS84 Extraction
* **Berkas:** [`.scratch/kml-import/issues/01-core-kml-parser.md`](file:///D:/PEREWANGAN%20369/Tani/.scratch/kml-import/issues/01-core-kml-parser.md)
* **Tujuan:** Modul murni Python menggunakan `xml.etree.ElementTree` untuk mengekstrak `<name>` ("Bengkok 1") dan koordinat poligon 2D/3D dari berkas KML, menormalkannya ke format GeoJSON Polygon `[[[lng, lat], ...]]`, serta menghitung sentroid dan bounding box.
* **Pengujian:** Unit test di `tests/test_kml_parser.py` terhadap berkas sampel [Bengkoxxx1.kml](file:///D:/PEREWANGAN%20369/Tani/Bengkoxxx1.kml).
* **Blocked by:** *None (Dapat langsung dikerjakan)*

### Tiket 02: Geodesic Area Calculator and Spatial Validator
* **Berkas:** [`.scratch/kml-import/issues/02-geodesic-area-validator.md`](file:///D:/PEREWANGAN%20369/Tani/.scratch/kml-import/issues/02-geodesic-area-validator.md)
* **Tujuan:** Modul matematika validasi topologi (cincin poligon tertutup, minimal 3 verteks unik, rentang WGS84 -180..180 / -90..90) dan perhitungan luas permukaan geodesik dalam satuan Hektar ($Ha$) dan $m^2$ (menghasilkan ~0.3688 Ha untuk `Bengkok 1` sesuai PostGIS).
* **Pengujian:** Unit test validasi poligon normal, poligon terbuka, koordinat out-of-range.
* **Blocked by:** Tiket 01

### Tiket 03: Import Preview API Endpoint
* **Berkas:** [`.scratch/kml-import/issues/03-import-preview-api.md`](file:///D:/PEREWANGAN%20369/Tani/.scratch/kml-import/issues/03-import-preview-api.md)
* **Tujuan:** Endpoint FastAPI `POST /api/plots/import-preview` yang menerima file upload (`.kml`, `.kmz`, `.geojson`) atau string mentah, memanggil parser dan validator, lalu mengembalikan respon JSON preview (nama, luas, geometri GeoJSON, bbox, sentroid, dan status).
* **Pengujian:** Integration test upload `Bengkoxxx1.kml` mengembalikan HTTP 200 dengan payload valid.
* **Blocked by:** Tiket 02

### Tiket 04: Frontend Dropzone and Form Auto-Fill
* **Berkas:** [`.scratch/kml-import/issues/04-frontend-dropzone-autofill.md`](file:///D:/PEREWANGAN%20369/Tani/.scratch/kml-import/issues/04-frontend-dropzone-autofill.md)
* **Tujuan:** Komponen drag-and-drop & file selector di halaman [`frontend/src/app/admin/petak-baru/page.tsx`](file:///D:/PEREWANGAN%20369/Tani/frontend/src/app/admin/petak-baru/page.tsx). Begitu berkas diunggah, nama petak otomatis terisi ("Bengkok 1") dan estimasi luas hektar diperbarui di formulir.
* **Blocked by:** Tiket 03

### Tiket 05: Mapbox Polygon Rendering and Auto-FitBounds
* **Berkas:** [`.scratch/kml-import/issues/05-mapbox-polygon-fitbounds.md`](file:///D:/PEREWANGAN%20369/Tani/.scratch/kml-import/issues/05-mapbox-polygon-fitbounds.md)
* **Tujuan:** Render batas poligon hasil impor di atas layer Mapbox GL dan eksekusi otomatis animasi kamera `map.fitBounds()` ke batas koordinat petak dengan padding yang proporsional.
* **Blocked by:** Tiket 04

### Tiket 06: PostGIS Registration and Analysis Pipeline Trigger
* **Berkas:** [`.scratch/kml-import/issues/06-postgis-registration-pipeline-trigger.md`](file:///D:/PEREWANGAN%20369/Tani/.scratch/kml-import/issues/06-postgis-registration-pipeline-trigger.md)
* **Tujuan:** Menghubungkan formulir impor ke penyimpanan PostGIS `POST /api/plots`, memicu penarikan cuaca Open-Meteo dan observasi satelit perdana, lalu mengarahkan pengguna ke `/petak/{id}`.
* **Blocked by:** Tiket 05

---

## 3. Instruksi Eksekusi Sesi Berikutnya (`/implement`)

Pada sesi berikutnya, agen dapat langsung menjalankan perintah:
```bash
/implement
```
Urutan pengerjaan frontier:
1. **Buka & selesaikan Tiket 01:** [`.scratch/kml-import/issues/01-core-kml-parser.md`](file:///D:/PEREWANGAN%20369/Tani/.scratch/kml-import/issues/01-core-kml-parser.md)
   - Buat modul parser di `backend/app/utils/kml_parser.py`
   - Buat unit test di `tests/test_kml_parser.py` dengan membaca [Bengkoxxx1.kml](file:///D:/PEREWANGAN%20369/Tani/Bengkoxxx1.kml)
   - Jalankan test: `python -m unittest tests/test_kml_parser.py`
2. **Lanjutkan bertahap ke Tiket 02 hingga Tiket 06** sesuai dependency order.

---

## 4. Riwayat Tiket Fondasi Selesai (Wave 1 s/d Wave 6)

| Tiket | Nama Fitur | Status |
|---|---|---|
| **01** | Project Scaffolding & Docker Compose | Selesai |
| **02** | Auth & RBAC (JWT, bcrypt) | Selesai |
| **03** | Hierarki Organisasi (Company → Estate → Division) | Selesai |
| **04** | Varietas Tanaman & Fase Fenologi (Padi & Jagung) | Selesai |
| **05** | Plot CRUD & Mapbox Draw Polygon PostGIS | Selesai |
| **06** | Planting Season Management | Selesai |
| **07** | GEE Satellite Processor (NDVI, NDRE, NDWI, SAVI, SAR) | Selesai |
| **08** | Weather Fetcher & FAO-56 Penman-Monteith ET₀ | Selesai |
| **09** | GDD Thermal Calculator & Prediksi Panen ($ET_c$) | Selesai |
| **10** | Alert Engine (4 Aturan Anomali Agronomi) | Selesai |
| **11** | Dashboard Utama (NDVI Heatmap & Tabel Petak) | Selesai |
| **12** | Panel Alert & Notifikasi In-App | Selesai |
| **13** | Detail Petak (Time-Series Chart & Stepper Fenologi) | Selesai |
| **14** | Weather Widget & Prakiraan Cuaca 16 Hari | Selesai |
| **15** | Timeline Slider Timelapse & Satellite Overlay | Selesai |
| **16** | Reporting (PDF ReportLab & CSV Export) | Selesai |
| **17** | Email Notification (Ringkasan Alert Harian HTML) | Selesai |

---

## 5. Ringkasan File Kunci Terkait

* **Contoh Berkas Uji KML:** [`Bengkoxxx1.kml`](file:///D:/PEREWANGAN%20369/Tani/Bengkoxxx1.kml)
* **Dokumen Spesifikasi Fitur:** [`.scratch/kml-import/spec.md`](file:///D:/PEREWANGAN%20369/Tani/.scratch/kml-import/spec.md)
* **Direktori Tiket Aktif:** [`.scratch/kml-import/issues/`](file:///D:/PEREWANGAN%20369/Tani/.scratch/kml-import/issues/)
* **Halaman Pendaftaran Petak:** [`frontend/src/app/admin/petak-baru/page.tsx`](file:///D:/PEREWANGAN%20369/Tani/frontend/src/app/admin/petak-baru/page.tsx)
* **Router Petak Backend:** [`backend/app/api/plots.py`](file:///D:/PEREWANGAN%20369/Tani/backend/app/api/plots.py)
* **Test Suite Saat Ini:** `tests/test_*.py` (72 tests, 71 passed, 1 skipped)
