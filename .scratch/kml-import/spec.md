# Spec: Pendaftaran & Analisis Petak Lahan Melalui Berkas KML / KMZ / GeoJSON (Proyek "Tani")

## Problem Statement

Pengelola kebun dan surveyor agribisnis di lapangan umumnya telah memiliki data batas petak lahan yang dipetakan menggunakan Google Earth, GPS handheld Garmin, drone pemetaan, atau aplikasi GIS lapangan (seperti QGIS atau Avenza Maps). Berkas-berkas pemetaan tersebut disimpan dalam format standar geospasial seperti KML (*Keyhole Markup Language*), KMZ (arsip terkompresi KML), dan GeoJSON.

Saat ini, platform Tani hanya menyediakan antarmuka penggambaran manual titik-demi-titik di atas peta satelit Mapbox (`/admin/petak-baru`). Menggambar ulang petak lahan berbatas kompleks secara manual (contohnya petak berliku seperti `Bengkok 1` dengan 24 titik verteks) sangat memakan waktu, rawan ketidaktelitian koordinat batas, dan tidak efisien untuk pendaftaran puluhan hingga ratusan petak lahan. Pengguna membutuhkan cara instan untuk mengunggah berkas spasial yang ada (`.kml`, `.kmz`, `.geojson`), sehingga batas geometri, luas lahan, dan nama petak dapat diekstrak otomatis, diproyeksikan di peta, dan langsung dianalisis oleh pipeline satelit dan agroklimat Tani.

## Solution

Mengembangkan modul pembacaan, validasi, visualisasi, dan registrasi berkas geospasial (KML/KMZ/GeoJSON) yang terintegrasi secara *end-to-end* antara frontend Next.js dan backend FastAPI:

1. **Parser Geometri Standar Industri:**
   - Mengekstrak elemen `<Placemark>`, `<name>`, dan `<Polygon>` / `<MultiGeometry>` dari berkas KML/KMZ tanpa ketergantungan library eksternal C yang rentan gagal di berbagai OS.
   - Mengurai pasangan koordinat WGS84 `longitude,latitude,altitude` menjadi poligon GeoJSON standar (`RFC 7946`).
2. **Kalkulasi & Validasi Spasial Otomatis:**
   - Menghitung luas permukaan geodesik akurat dalam satuan hektar ($Ha$) dan meter persegi ($m^2$).
   - Menghitung batas kotak geospasial (*bounding box*) dan titik sentroid untuk navigasi otomatis.
   - Memvalidasi integritas poligon (lingkar tertutup/closed ring, minimal 3 verteks unik, validitas rentang koordinat).
3. **Antarmuka Pengguna Interaktif (Drag & Drop UI):**
   - Menambahkan area unggah berkas interaktif di halaman `/admin/petak-baru` yang mendukung *drag-and-drop* serta pemilihan berkas eksplorator.
   - Menampilkan visualisasi batas poligon secara instan di peta Mapbox dengan animasi pergerakan kamera (*fitBounds*) langsung menuju lokasi petak.
   - Mengisi otomatis (*auto-fill*) nama petak dari nama Placemark (misal: "Bengkok 1") dan estimasi luas hektar.
4. **Registrasi & Analisis Instan (Tracer-Bullet Pipeline):**
   - Menyimpan poligon ke tabel `plots` PostGIS dengan relasi organisasi yang dipilih.
   - Memicu orkestrasian awal analisis agronomi: penarikan cuaca Open-Meteo & kalkulasi $ET_0$, inisialisasi GDD, dan observasi indeks satelit perdana (Sentinel-2 NDVI/NDRE/NDWI & Sentinel-1 SAR).

## User Stories

1. Sebagai estate manager, saya ingin mengunggah berkas KML (`.kml`) langsung ke halaman pendaftaran petak, agar saya tidak perlu menggambar ulang batas lahan yang sudah dibuat di Google Earth.
2. Sebagai estate manager, saya ingin sistem membaca nama petak dari tag `<name>` di dalam berkas KML, agar formulir nama petak terisi otomatis secara akurat.
3. Sebagai estate manager, saya ingin peta otomatis menggeser (*pan*) dan memperbesar (*zoom*) ke batas lahan yang diimpor, agar saya dapat memverifikasi kesesuaian posisi petak terhadap citra satelit terkini.
4. Sebagai estate manager, saya ingin melihat kalkulasi luas otomatis dalam hektar dari koordinat KML, agar saya dapat mencocokkan data luas sertifikat/lapangan dengan kalkulasi geodesik sistem.
5. Sebagai surveyor, saya ingin sistem mendukung pengunggahan berkas GeoJSON (`.geojson` / `.json`), agar data dari drone mapping atau QGIS dapat diimpor tanpa konversi manual.
6. Sebagai surveyor, saya ingin sistem mendukung pengunggahan berkas KMZ (`.kmz`), agar berkas terkompresi dari Google Earth Pro dapat langsung diunggah tanpa diekstrak manual terlebih dahulu.
7. Sebagai estate manager, saya ingin sistem menampilkan pesan kesalahan yang jelas dan ramah jika berkas KML rusak atau tidak memiliki elemen poligon, agar saya mengetahui penyebab kegagalan impor.
8. Sebagai estate manager, saya ingin dapat menyesuaikan atau mengedit titik batas poligon setelah diimpor jika diperlukan sedikit koreksi batas batas fisik di lapangan.
9. Sebagai estate manager, saya ingin memilih divisi, varietas bibit, dan tanggal tanam setelah berkas KML diimpor sebelum menekan tombol simpan, agar metadata agronomi tetap lengkap.
10. Sebagai agronomist, saya ingin petak yang baru didaftarkan dari KML langsung dapat dimonitor indeks satelitnya (NDVI, NDRE, NDWI), agar kondisi vegetasi petak segera terlihat di dashboard.
11. Sebagai agronomist, saya ingin sistem langsung menghubungkan koordinat petak KML dengan stasiun cuaca Open-Meteo terdekat, agar estimasi kebutuhan air ($ET_c$) dapat langsung dihitung.
12. Sebagai admin sistem, saya ingin endpoint backend memvalidasi struktur geometri poligon sebelum disimpan ke PostGIS, agar database terhindar dari data geometri tidak valid (*self-intersecting* atau *open ring*).
13. Sebagai estate manager, saya ingin opsi untuk mereset atau mengunggah ulang berkas lain jika salah memilih berkas KML tanpa perlu memuat ulang seluruh halaman.

## Implementation Decisions

1. **Parser KML Menggunakan Standard Library Python:**
   - Backend mengimplementasikan parser KML berbasis `xml.etree.ElementTree` bawaan Python standard library. Hal ini menghindari ketergantungan C library eksternal (seperti GDAL/GEOS native binding) yang kerap menimbulkan kendala kompatibilitas lintas sistem operasi (Windows/Linux Docker).
   - Parser mendukung format koordinat KML spasi/newline delimiter: `lng,lat,alt` atau `lng,lat`.
   - Parser mendukung ekstraksi berkas KMZ menggunakan modul `zipfile` standar untuk mengekstrak berkas `doc.kml` internal.

2. **Dukungan Parsing Ganda (Client-Side & Server-Side):**
   - **Client-Side (Next.js):** Parser ringan DOMParser berbasis browser diimplementasikan pada frontend untuk memberikan *instant preview* tanpa latensi jaringan saat berkas di-drop oleh pengguna.
   - **Server-Side (FastAPI):** Endpoint validasi dan ekstraksi `POST /api/plots/parse-kml` disediakan untuk pemrosesan berkas berukuran besar, arsip KMZ, sanitasi keamanan XML (*anti-XXE*), dan penghitungan geodesik terstandarisasi PostGIS.

3. **Format Pertukaran Data Geospasial:**
   - Format standar pertukaran internal antara parser, API, dan Mapbox adalah GeoJSON Feature (`geometry.type = "Polygon"` dengan koordinat ring `[[[lng, lat], ...]]`).
   - Koordinat yang masuk selalu dinormalisasi ke orientasi WGS84 standard: Longitude sebagai elemen ke-0, Latitude sebagai elemen ke-1, dengan titik penutup identik dengan titik awal ($coords[0] == coords[-1]$).

4. **Integrasi Antarmuka Petak Baru:**
   - Halaman pendaftaran petak lahan yang sudah ada diintegrasikan dengan komponen `FileUploadZone` di sisi panel form kiri atau modal dropzone.
   - Begitu berkas valid diuraikan, state form `drawnCoords` terisi, `plotName` terisi dari metadata KML, `calculatedAreaHa` diperbarui, dan Mapbox `fitBounds` dieksekusi dengan padding yang nyaman.

5. **Tracer-Bullet Pipeline Trigger:**
   - Setelah petak disimpan ke PostGIS via `POST /api/plots`, sistem secara sinkron/asinkron memicu inisialisasi data cuaca Open-Meteo awal serta kalkulasi observasi satelit sintetis/GEE perdana sehingga pengguna dapat langsung beralih ke halaman detail petak (`/petak/[id]`) dengan data analitik yang hidup.

## Testing Decisions

1. **Kriteria Pengujian yang Baik:**
   - Pengujian berfokus pada perilaku input-output eksternal (mengunggah berkas KML riil -> menghasilkan poligon GeoJSON dan luas yang benar) tanpa terikat pada detail implementasi internal parser.
2. **Cakupan Modul yang Diuji:**
   - Unit test modul parser KML/KMZ/GeoJSON:
     - Pengujian dengan berkas sampel riil `Bengkoxxx1.kml` (verifikasi 24 titik, luas ~0.37 Ha, nama "Bengkok 1").
     - Pengujian poligon 2D (`lng,lat`) dan 3D (`lng,lat,alt`).
     - Pengujian kasus batas: berkas KML tidak valid, KML tanpa poligon (hanya titik/placemark), XML malformasi.
   - API integration test untuk endpoint upload/parse berkas KML.
   - Pengujian integrasi alur pendaftaran petak hingga tersimpan di database dan memicu penghitungan awal.
3. **Prior Art:**
   - Mengikuti pola test suite yang sudah ada di `tests/test_et0.py` dan `tests/test_satellite_indices.py` menggunakan `unittest.TestCase`.

## Out of Scope

- Impor format CAD/Shapefile (.shp berkas terpisah dengan .dbf/.shx) — pengguna disarankan mengonversi ke KML/GeoJSON terlebih dahulu via QGIS.
- Impor massal ratusan petak sekaligus dalam 1 berkas multi-layer KML Folder (fokus saat ini adalah single/multi placemark per kebun dengan tinjauan agronomi per petak).
- Penyuntingan topologi poligon tingkat lanjut (seperti pemotongan poligon bertumpuk / polygon clipping).

## Further Notes

- Berkas contoh `Bengkoxxx1.kml` yang terletak di akar repositori akan dijadikan basis *test fixture* resmi untuk memastikan keandalan parser terhadap berkas riil dari lapangan.
- Fitur ini mempercepat adopsi platform Tani bagi agribisnis skala besar yang sudah memiliki puluhan peta petak dalam format Google Earth.
