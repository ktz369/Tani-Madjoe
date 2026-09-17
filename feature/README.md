# Katalog Menu dan Fitur Platform Tani (Precision Agriculture)

Dokumen ini memuat daftar lengkap seluruh menu, modul, fitur, dan kapabilitas analitik yang tersedia di platform **Tani**. Sistem ini dirancang untuk pemantauan lahan pertanian presisi (*precision agriculture*) berbasis penginderaan jauh (*remote sensing*), data cuaca agro-klimatologi, dan pemodelan fenologi tanaman.

---

> **Dokumentasi Terkait:**
> - [Panduan Penggunaan: Persiapan Tanam Presisi (SOP)](file:///D:/PEREWANGAN%20369/Tani/feature/panduan_persiapan_tanam.md)
> - [Katalog Menu dan Fitur Lengkap](file:///D:/PEREWANGAN%20369/Tani/feature/daftar_menu_dan_fitur.md)

---

## Daftar Isi
1. [Struktur Navigasi & Arsitektur Sistem](#1-struktur-navigasi--arsitektur-sistem)
2. [Menu 1: Beranda / Landing Page (`/`)](#2-menu-1-beranda--landing-page-)
3. [Menu 2: Dashboard Utama Perkebunan (`/dashboard`)](#3-menu-2-dashboard-utama-perkebunan-dashboard)
4. [Menu 3: Peta Interaktif & Citra Satelit (`/peta`)](#4-menu-3-peta-interaktif--citra-satelit-peta)
5. [Menu 4: Detail Petak & Fenologi Tanaman (`/petak/[id]`)](#5-menu-4-detail-petak--fenologi-tanaman-petakid)
6. [Menu 5: Pusat Laporan & Ekspor Data (`/laporan`)](#6-menu-5-pusat-laporan--ekspor-data-laporan)
7. [Menu 6: Admin - Pendaftaran Petak Baru (`/admin/petak-baru`)](#7-menu-6-admin---pendaftaran-petak-baru-adminpetak-baru)
8. [Menu 7: Admin - Struktur Organisasi (`/admin/organisasi`)](#8-menu-7-admin---struktur-organisasi-adminorganisasi)
9. [Menu 8: Admin - Manajemen Varietas Benih (`/admin/varietas`)](#9-menu-8-admin---manajemen-varietas-benih-adminvarietas)
10. [Mesin Analisis Agronomi & Algoritma Backend](#10-mesin-analisis-agronomi--algoritma-backend)
11. [Integrasi Layanan Eksternal](#11-integrasi-layanan-eksternal)

---

## 1. Struktur Navigasi & Arsitektur Sistem

Platform mengadopsi hierarki multi-tenant spasial:
```
Perusahaan (Company)
 └── Kebun (Estate)
      └── Divisi / Afdeling (Division)
           └── Petak Lahan (Plot - berbasis poligon KML/GeoJSON)
                └── Musim Tanam (Seasons: Bera / Aktif / Panen)
```

- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Mapbox GL JS, Lucide React Icons.
- **Backend:** FastAPI (Python 3.11), SQLAlchemy, PostGIS / GeoPandas, ReportLab PDF Engine, GEE Python API.

---

## 2. Menu 1: Beranda / Landing Page (`/`)
Halaman gerbang utama untuk pengenalan sistem dan akses cepat navigasi.

* **Fitur Utama:**
  * **Header Navigasi:** Tautan cepat menuju Dashboard, Peta, Laporan, dan Admin.
  * **Ringkasan Kemampuan Sistem:** Pemantauan satelit Sentinel-2/Sentinel-1, perhitungan FAO-56 Penman-Monteith, dan prediksi panen GDD.
  * **Status Sistem:** Indikator koneksi API backend dan ketersediaan data satelit.

---

## 3. Menu 2: Dashboard Utama Perkebunan (`/dashboard`)
Pusat komando operasional untuk memantau ringkasan estate dan performa agronomi harian.

* **Fitur Utama:**
  * **Estate Switcher:** Pemilihan kebun/estate aktif secara dinamis.
  * **Ringkasan Metrik KPI:**
    * *Total Luas Lahan (Hektar)*: Akumulasi luas seluruh petak terdaftar.
    * *Status Petak*: Jumlah petak aktif ditanami vs petak bera (lahan terbuka).
    * *Rata-rata Indeks NDVI Estate*: Nilai kerapatan vegetasi terkini beserta badge status (*Sangat Baik, Baik, Waspada, Kritis, atau Bera*).
    * *Petak Butuh Perhatian*: Penghitung petak yang terindikasi mengalami stres vegetasi atau defisit air.
  * **Widget Cuaca Real-Time (FAO-56 Penman-Monteith):**
    * Pemantauan parameter mikro-klimat: Suhu Udara Min/Max (°C), Kelembaban Relatif (%), Curah Hujan Harian (mm), Kecepatan Angin (m/s), Radiasi Matahari ($MJ/m^2$).
    * Evapotranspirasi Referensi Harian ($ET_0$ mm/hari).
  * **Grafik Prakiraan Cuaca 14 Hari:**
    * Visualisasi interaktif tren temperatur, potensi curah hujan, dan laju kehilangan air lingkungan ($ET_0$).
  * **Peta Miniatur Spasial Kebun (Mapbox GL):**
    * Render poligon petak dengan pewarnaan tematik berdasarkan status NDVI.
    * Fitur interaksi: klik pada baris tabel petak akan otomatis memusatkan peta (*fitBounds*) dan menampilkan popup ringkasan petak.
  * **Tabel Status Petak Interaktif:**
    * Kolom informasi: Nama Petak, Komoditas, Varietas Benih, Fase Fenologi, Usia Tanam (HST / Belum Tanam), Luas (ha), dan Nilai NDVI.
    * Pencarian instan (*real-time search*) berdasarkan nama petak.
    * Filter komoditas (Semua, Padi, Jagung) dan filter status NDVI.

---

## 4. Menu 3: Peta Interaktif & Citra Satelit (`/peta`)
Studio spasial geospasial resolusi tinggi untuk inspeksi spektral dan temporal.

* **Fitur Utama:**
  * **Kanvas Spasial Resolusi Penuh:** Peta interaktif Mapbox GL dengan kontrol rotasi, pitch 3D, dan fullscreen.
  * **Pilihan Gaya Dasar Peta (*Base Map Switcher*):**
    * Satelit Resolusi Tinggi (Satellite Streets).
    * Topografi & Kontur Jalan (Outdoors / Streets).
  * **Overlay Citra Satelit Google Earth Engine (GEE Live):**
    * *Sentinel-2 True Color (RGB)*: Tampilan visual warna alami bumi.
    * *Sentinel-2 False Color (NIR)*: Visualisasi inframerah dekat untuk analisis kerapatan klorofil.
    * *Slider Transparansi (Opacity Slider)*: Mengatur transparansi lapisan citra satelit di atas peta dasar (0% – 100%).
  * **Time-Machine Slider (Observasi Multi-Temporal):**
    * Menampilkan riwayat tanggal akuisisi satelit (interval 5 harian).
    * Pengguna dapat menggeser linimasa tanggal untuk melihat perubahan vegetasi dari waktu ke waktu.
  * **Mode Pewarnaan Tematik NDVI:**
    * Toggle visualisasi warna poligon petak (Merah: Kritis/Lahan Terbuka $\rightarrow$ Kuning: Sedang $\rightarrow$ Hijau Tua: Sangat Lebat).
  * **Panel Samping (*Collapsible Sidebar*) Daftar Petak:**
    * Ringkasan informasi per petak saat diklik di peta.
    * Indikator status bera/ditanami, varietas, dan luas area.
  * **Modal Inspeksi Telemetri Spektral & SAR:**
    * Pengecekan 6 indeks spektral lengkap: NDVI, NDRE, NDWI, SAVI, BSI.
    * Analisis Radar SAR Sentinel-1 (Polarisasi VV & VH dalam satuan dB) untuk monitoring tembus awan.

---

## 5. Menu 4: Detail Petak & Fenologi Tanaman (`/petak/[id]`)
Analisis mendalam tingkat mikro untuk satu petak lahan spesifik.

* **Fitur Utama:**
  * **Kartu Identitas Petak:**
    * Nama petak, Kebun, Divisi, Luas Hektar, Titik Koordinat Pusat (*Centroid*), Status Musim Tanam.
  * **Banner Status Musim Tanam:**
    * Menampilkan varietas yang sedang aktif, tanggal sebar/tanam, dan catatan agronomi.
    * Menampilkan status *"Tidak Ada Siklus Aktif (Bera / Persiapan Lahan)"* jika lahan belum ditanami.
  * **Timeline Progres Fase Fenologi (Tiket 13):**
    * Visualisasi alur fase tumbuh tanaman (Vegetatif Awal $\rightarrow$ Vegetatif Aktif $\rightarrow$ Reproduktif / Bunting $\rightarrow$ Pembungaan $\rightarrow$ Pengisian Bulir $\rightarrow$ Pematangan Fisiologis).
    * Highlight fase aktif berdasarkan umur tanaman (HST) dan akumulasi panas (GDD).
  * **Kartu Prediksi Panen & Termal GDD (*Growing Degree Days*):**
    * Progres persentase pencapaian target termal varietas.
    * Akumulasi GDD saat ini vs target GDD varietas (°C-hari).
    * Estimasi sisa hari menuju panen fisiologis dan perkiraan tanggal panen kalender.
  * **Kartu Kebutuhan Air Tanaman ($ET_c$):**
    * Perhitungan kebutuhan air harian tanaman: $ET_c = K_c \times ET_0$.
    * Koefisien tanaman dinamis ($K_c$) yang berubah otomatis mengikuti fase fenologi.
    * Neraca air harian (Curah Hujan vs Kebutuhan Air $\rightarrow$ Status Surplus / Defisit).
  * **Grafik Tren Deret Waktu Satelit (Time-Series Charts):**
    * Grafik histori NDVI (Kerapatan Kanopi).
    * Grafik histori NDRE (Kandungan Klorofil & Kebutuhan Nitrogen).
    * Grafik histori NDWI (Kandungan Air Daun).
    * Grafik radar Sentinel-1 SAR (Backscatter polarisasi VV & VH dB).
  * **Tombol Sinkronisasi Manual:**
    * *Sync Weather*: Memperbarui data cuaca lokal terkini dari stasiun meteorologi reanalysis.
    * *Sync Satellite*: Menjalankan job pengambilan citra dan kalkulasi indeks satelit GEE terbaru.
  * **Riwayat Musim Tanam Terdahulu:**
    * Tabel histori musim tanam masa lalu, realisasi hasil panen (ton/ha), durasi tanam, dan efisiensi air.

---

## 6. Menu 5: Pusat Laporan & Ekspor Data (`/laporan`)
Modul pelaporan agronomi formal dan ekspor data untuk audit serta manajemen perkebunan.

* **Fitur Utama:**
  * **Generator Dokumen PDF Standar Industri (ReportLab Engine):**
    * **Laporan Kesehatan Tanaman & Spektral Satelit:** Memuat ringkasan eksekutif kebun, tabel NDVI/NDRE/NDWI tiap petak, status anomali klorofil, dan rekomendasi lapang.
    * **Laporan Prediksi Panen & Akumulasi Termal GDD:** Memuat status fase perkembangan, progres akumulasi suhu (°C-hari), estimasi tanggal panen per petak, dan target tonase.
    * **Laporan Neraca Air & Kebutuhan Irigasi:** Memuat tabel evapotranspirasi lingkungan ($ET_0$), kebutuhan air tanaman ($ET_c$), curah hujan historis, dan status kecukupan air.
  * **Ekspor Data Mentah CSV (*Spreadsheet Compatible*):**
    * Pengunduhan instan seluruh data deret waktu telemetri dalam format UTF-8 dengan BOM (langsung terbaca rapi di Microsoft Excel tanpa masalah encoding).
    * Memuat kolom: Tanggal, Nama Petak, HST, Fase, NDVI, NDRE, NDWI, SAVI, BSI, SAR VV, SAR VH, Suhu, Curah Hujan, $ET_0$, dan $ET_c$.
  * **Arsip Riwayat Laporan:**
    * Tabel riwayat pembuatan laporan sebelumnya dengan tautan unduh langsung.
  * **Komparasi Antar Musim (*Season Benchmarking*):**
    * Kartu perbandingan performa musim tanam aktif terhadap musim sebelumnya (perbandingan durasi, produktivitas ton/ha, dan rasio efisiensi air).

---

## 7. Menu 6: Admin - Pendaftaran Petak Baru (`/admin/petak-baru`)
Modul pendaftaran geospasial petak lahan kebun baru.

* **Fitur Utama:**
  * **Mode Tunggal (*Single Import*):**
    * Drag & Drop file spatial KML atau KMZ.
    * Parser otomatis mengekstraksi koordinat verteks batas poligon, menghitung luas geodesik (ha), dan menetapkan titik pusat (*centroid*).
  * **Mode Massal (*Batch Import*):**
    * Unggah satu file KML/KMZ yang memuat banyak petak (*Multi-Placemark*) sekaligus.
    * Tabel tinjauan batch: pengubahan nama petak, pemilihan divisi per baris, dan checkbox aktivasi petak.
    * Transaksi batch atomik (seluruh petak tervalidasi sebelum disimpan ke basis data).
  * **Pratinjau Peta Spasial Interaktif:**
    * Render instan poligon petak di atas peta Mapbox sebelum proses simpan permanen.
  * **Formulir Kelengkapan Atribut:**
    * Pengisian nama petak, kode petak, pemilihan estate dan divisi penanggung jawab.

---

## 8. Menu 7: Admin - Struktur Organisasi (`/admin/organisasi`)
Manajemen hierarki entitas bisnis dan operasional perkebunan.

* **Fitur Utama:**
  * **Struktur Pohon Organisasi (*Tree Structure*):**
    * Visualisasi berjenjang: Perusahaan $\rightarrow$ Kebun/Estate $\rightarrow$ Divisi/Afdeling.
  * **Manajemen Perusahaan (*Company*):**
    * Penambahan nama perusahaan, kode registrasi, dan pengaturan multi-tenant.
  * **Manajemen Kebun (*Estate*):**
    * Pendaftaran kebun baru: Nama kebun, provinsi/kabupaten, koordinat geolokasi, dan batas wilayah.
  * **Manajemen Divisi (*Division*):**
    * Pembagian blok afdeling/divisi operasional di bawah masing-masing kebun.
  * **Dialog Modal CRUD:**
    * Tambah, perbarui, dan arsipkan data perusahaan, kebun, dan divisi secara aman.

---

## 9. Menu 8: Admin - Manajemen Varietas Benih (`/admin/varietas`)
Pusat konfigurasi parameter fisiologi dan agronomi komoditas tanaman.

* **Fitur Utama:**
  * **Katalog Komoditas & Varietas:**
    * Padi: Inpari 32 HDB, Ciherang, IR64, dll.
    * Jagung: Pioneer P35, NK212, Bisi 18, dll.
  * **Konfigurasi Parameter Fisiologis per Fase Tumbuh:**
    * Kode fase dan deskripsi (Vegetatif, Bunting, Berbunga, Pengisian, Pematangan).
    * Rentang Hari Setelah Tanam (HST awal – HST akhir).
    * Nilai ambang batas NDVI yang diharapkan (min – max).
    * Ambang batas kecukupan nitrogen (NDRE).
    * Koefisien tanaman ($K_c$) untuk perhitungan kebutuhan air $ET_c$.
    * Target akumulasi suhu efektif (*Thermal GDD Target* dalam °C-hari).
  * **Fleksibilitas Kustomisasi:**
    * Penyesuaian parameter varietas sesuai iklim mikro lokal atau introduksi bibit varietas baru.

---

## 10. Mesin Analisis Agronomi & Algoritma Backend

Platform Tani dilengkapi mesin kalkulasi otomatis yang berjalan di latar belakang:

1. **Model Evapotranspirasi FAO-56 Penman-Monteith:**
   * Menghitung evaporasi dari tanah dan transpirasi tanaman standar ($ET_0$) menggunakan data radiasi bersih, temperatur rata-rata, kecepatan angin 2m, dan tekanan uap jenuh.
2. **Model Akumulasi Termal GDD (*Growing Degree Days*):**
   * Rumus: $GDD = \max\left(0, \frac{T_{\max} + T_{\min}}{2} - T_{\text{base}}\right)$.
   * Menggunakan batas suhu dasar fisiologis ($T_{\text{base}} = 10^\circ\text{C}$ untuk Padi dan Jagung) dengan batas atas $30^\circ\text{C}$ untuk memprediksi tanggal panen secara presisi.
3. **Pipeline Indeks Spektral Satelit:**
   * $\text{NDVI} = \frac{B8 - B4}{B8 + B4}$ (Kerapatan Biomassa & Kanopi)
   * $\text{NDRE} = \frac{B8 - B5}{B8 + B5}$ (Klorofil Daun & Nitrogen)
   * $\text{NDWI} = \frac{B8 - B11}{B8 + B11}$ (Kandungan Air Kanopi)
   * $\text{SAVI} = \frac{(B8 - B4) \times (1 + L)}{B8 + B4 + L}$ dengan $L=0.5$ (Penyesuaian Efek Latar Tanah)
   * $\text{BSI} = \frac{(B11 + B4) - (B8 + B2)}{(B11 + B4) + (B8 + B2)}$ (Deteksi Tanah Terbuka / Lahan Bera)
4. **Mesin Peringatan Dini Agronomi (*Early Warning Engine*):**
   * *Aturan 1 (Stres Air)*: Terpicu jika NDWI $< 0.15$ dan $ET_0 > 5.0\text{ mm/hari}$.
   * *Aturan 2 (Indikasi Hama/Penyakit)*: Terpicu jika NDVI turun $> 15\%$ dalam rentang waktu 10 hari pada fase pertumbuhan aktif.
   * *Aturan 3 (Defisiensi Nitrogen)*: Terpicu jika NDRE $< 0.25$ pada fase vegetatif aktif.
   * *Aturan 4 (Kekeringan Ekstrem)*: Terpicu jika curah hujan $0\text{ mm}$ selama 7 hari berturut-turut disertai defisit air.

---

## 11. Integrasi Layanan Eksternal

* **Google Earth Engine (GEE):**
  * Service Account (`paci-x-a7a003954fc1.json`) untuk mengakses katalog data citra Sentinel-2 MSI dan Sentinel-1 SAR GRD secara otomatis.
* **Mapbox GL JS:**
  * Penyedia *tile server* peta jalan, peta satelit, dan engine visualisasi vektor poligon.
* **Open-Meteo API:**
  * Penyedia data meteorologi reanalysis resolusi tinggi (suhu, kelembaban, angin, curah hujan, radiasi) per koordinat geografis petak.
