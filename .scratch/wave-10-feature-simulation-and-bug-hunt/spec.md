# Spec: Wave 10 — Simulasi Mendalam & Audit Pengujian Bug Seluruh Fitur (Fleet Worker Testing)

## Problem Statement

Platform SaaS Monitoring Pertanian Presisi "Tani" telah mengintegrasikan berbagai kapabilitas enterprise: mulai dari autentikasi berbasis peran (RBAC), hierarki organisasi kebun (Company -> Estate -> Division), pipeline impor berkas geospasial tunggal maupun massal (KML/KMZ/GeoJSON), sinkronisasi cuaca & evapotranspirasi FAO-56 Penman-Monteith, akumulasi GDD & penentuan fase fenologi, pemodelan telemetri satelit Sentinel-2 & backfill 30 hari kurva sigmoidal, alert engine 4 aturan agronomis, sistem pengiriman email SMTP, generator dokumen PDF ReportLab & ekspor CSV, hingga antarmuka pengguna Apple Editorial 100% Light Mode dengan komponen Beautiful UI.

Meskipun suite pengujian unit backend yang ada saat ini mencakup 123 tes yang lulus secara nominal, aplikasi belum pernah diuji melalui **simulasi eksekusi fitur secara mendalam (deep simulation)** dan **pencarian bug pada kondisi ekstrem (edge cases, adversarial input, boundary testing, concurrent load, dan failover state)**.

Untuk memastikan kesiapan produksi (*production readiness*) dan stabilitas platform, diperlukan simulasi komprehensif yang membedah setiap modul fitur secara terisolasi menggunakan **1 armada worker untuk 1 fitur** guna menemukan, mendokumentasikan, dan memvalidasi penanganan setiap potensi bug.

---

## Solution

Melakukan orkestrasi pengujian dan simulasi stres secara terdistribusi di mana 7 worker independen mengaudit 7 domain fitur utama platform:

1. **Worker 1 (Autentikasi, RBAC & Hierarki Organisasi):**
   - Simulasi otentikasi JWT (login, token refresh, invalid signature, expired token).
   - Pengujian batas RBAC (Superadmin, Estate Manager, Agronomist, Surveyor).
   - Validasi integritas relasi foreign key berjenjang Company -> Estate -> Division, isolasi data antar perusahaan (*tenant isolation*), dan penanganan nama estate/divisi duplikat.

2. **Worker 2 (Pipeline Geospasial KML/KMZ/GeoJSON Tunggal & Massal):**
   - Simulasi upload berkas riil: KML single placemark, KMZ terkompresi zip, GeoJSON multi-poligon, hingga berkas korup/kosong.
   - Uji batas topologi spasial: poligon *self-intersecting*, ring tidak tertutup, koordinat terbalik (longitude vs latitude), koordinat di luar batas WGS84.
   - Validasi presisi geodesik formula Haversine/WGS84 vs luas PostGIS `ST_Area(geography)`.
   - Pengujian transaksi atomik pada endpoint `POST /api/plots/batch-create` saat 1 dari N poligon bermasalah.

3. **Worker 3 (Engine Cuaca, Evapotranspirasi FAO-56 & GDD):**
   - Simulasi integrasi Open-Meteo dengan koordinat valid, maritim/pesisir, dan dataran tinggi.
   - Uji batas perhitungan FAO-56 Penman-Monteith: radiasi mendekati 0 (malam hari/mendung tebal), kelembaban 100%, pembagian dengan nol.
   - Simulasi perhitungan GDD jagung & padi dengan suhu ekstrem (< 10°C, > 35°C), tanggal tanam hari ini, lampau (120 HST), dan masa depan.
   - Validasi kestabilan pembaruan fase fenologi tanaman.

4. **Worker 4 (Telemetri Satelit Sentinel-2 & 30-Day Backfill Pipeline):**
   - Simulasi ekstraksi & kalkulasi 6 indeks vegetasi: NDVI, NDRE, NDWI, SAVI, BSI, dan SAR (VH/VV).
   - Validasi batas nilai matematis: semua indeks wajib berada pada rentang valid [-1.0, 1.0].
   - Pengujian algoritma sigmoid pada `satellite_backfill_service.py` untuk memastikan 6 titik observasi historis memiliki deret tanggal teratur dan nilai fenologi logis.
   - Uji beban pembuatan telemetri untuk batch 50 petak sekaligus tanpa memory spike.

5. **Worker 5 (Alert Engine 4 Aturan Agronomis & SMTP Notification):**
   - Simulasi injeksi data anomali untuk memicu 4 aturan:
     1. *Water Stress*: NDWI < 0.15 dan $ET_0$ > 5.0 mm.
     2. *Hama/Penyakit*: Penurunan NDVI > 15% dalam 10 hari.
     3. *Defisiensi Nitrogen*: NDRE < 0.25 pada fase vegetatif aktif.
     4. *Kekeringan Ekstrem*: Curah hujan 0 mm berturut-turut + defisit kelembaban.
   - Uji mekanisme deduplikasi: mencegah spamming alert berturut-turut pada petak yang sama.
   - Simulasi pengiriman email SMTP harian, penanganan kegagalan koneksi (*graceful fallback* saat SMTP timeout), dan sanitasi template HTML email.

6. **Worker 6 (Generator Laporan PDF ReportLab & Ekspor CSV):**
   - Simulasi pembuatan PDF ReportLab: validasi layout multi-halaman, rendering tabel metrik, penanganan karakter non-ASCII/emotikon pada nama petak.
   - Uji batas: petak tanpa telemetri satelit (0 data points), petak luas mikroskopis (< 0.01 Ha), atau petak raksasa (> 10,000 Ha).
   - Simulasi ekspor CSV: integritas header, encoding UTF-8 BOM untuk Microsoft Excel, pemformatan angka desimal.

7. **Worker 7 (Frontend Apple Editorial UI & Mapbox Interaction):**
   - Simulasi interaksi pengguna pada komponen Beautiful UI: `ModeSegmentedControl`, `SpatialDropzone`, `BatchSummaryCard`, `BatchRecordsTable`, dan `BatchCompletionModal`.
   - Pengujian reaktivitas status layer Mapbox GL JS (`batch-polygons-fill`, `batch-polygons-line`, `drawn-polygon-source`).
   - Uji alur input formulir: pembatalan/reset impor berkas, seleksi/deseleksi baris massal, pengubahan nama petak secara inline, dan penanganan error respons API.

---

## User Stories

1. Sebagai QA Engineer, saya ingin setiap fitur diuji dengan skenario adversarial dan boundary case agar bug kritis teridentifikasi sebelum rilis.
2. Sebagai Agronomist, saya ingin memastikan perhitungan GDD, fase fenologi, dan telemetri satelit konsisten secara agronomis tanpa anomali nilai.
3. Sebagai Surveyor, saya ingin berkas geospasial KML/GeoJSON yang rusak atau memiliki titik tidak valid ditolak dengan pesan kesalahan yang jelas dan ramah pengguna.
4. Sebagai Estate Manager, saya ingin alert agronomis dan laporan PDF dapat digenerasi dengan andal meskipun terdapat data cuaca/satelit yang belum lengkap.
5. Sebagai Platform Architect, saya ingin seluruh 7 modul memiliki status audit yang terdokumentasi dan dapat diverifikasi ulang secara otomatis.

---

## Implementation Decisions

1. **Struktur Pengujian Terisolasi:**
   Setiap worker memiliki skrip simulasi mandiri di bawah direktori `backend/tests/simulations/` atau test harness spesifik.
2. **Zero Production Mutation:**
   Simulasi menggunakan database test SQLite / PostgreSQL terisolasi atau mock transaction rollback sehingga tidak mencemari data produksi.
3. **Dokumentasi Terstruktur:**
   Setiap tiket memetakan status `ready-for-agent`, kriteria penerimaan (*acceptance criteria*), dan format pelaporan temuan bug.

---

## Testing Decisions

- Simulasi eksekusi langsung menggunakan interpreter Python lingkungan lokal:
  `C:\Users\M S I\AppData\Roaming\uv\python\cpython-3.11-windows-x86_64-none\python.exe`.
- Eksekusi verifikasi suite uji unit (123 tes) wajib tetap mempertahankan status 100% OK setelah audit/penyempurnaan bug.

---

## Out of Scope

- Penambahan arsitektur cloud baru (AWS/GCP/Kubernetes) di luar runtime lokal saat ini.
- Perubahan total skema model ORM yang merusak backward-compatibility Wave 1-9.
