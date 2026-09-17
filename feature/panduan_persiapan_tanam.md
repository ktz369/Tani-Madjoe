# Panduan Penggunaan: Persiapan Tanam Berbasis Pertanian Presisi (Precision Agriculture)

Dokumen ini merupakan Panduan Operasional Standar (*Standard Operating Procedure* / SOP) bagi manajer perkebunan, agronomis, mantri tani, dan operator lapangan dalam memanfaatkan platform **Tani** untuk merencanakan dan mengeksekusi **fase persiapan tanam** secara ilmiah, presisi, dan terukur.

---

## Daftar Isi
1. [Prinsip Dasar Persiapan Tanam Presisi](#1-prinsip-dasar-persiapan-tanam-presisi)
2. [Pra-Syarat & Data Awal](#2-pra-syarat--data-awal)
3. [Alur Kerja Langkah-demi-Langkah (Step-by-Step Workflow)](#3-alur-kerja-langkah-demi-langkah-step-by-step-workflow)
   - [Langkah 1: Registrasi & Verifikasi Batas Spasial Petak (`/admin/petak-baru`)](#langkah-1-registrasi--verifikasi-batas-spasial-petak-adminpetak-baru)
   - [Langkah 2: Audit Spektral Kesiapan Tanah & Fase Bera (`/peta`)](#langkah-2-audit-spektral-kesiapan-tanah--fase-bera-peta)
   - [Langkah 3: Analisis Kelembaban Tanah & Radar SAR Sentinel-1 (`/petak/[id]`)](#langkah-3-analisis-kelembaban-tanah--radar-sar-sentinel-1-petakid)
   - [Langkah 4: Evaluasi Neraca Air & Ramalan Agroklimat 7–14 Hari (`/dashboard`)](#langkah-4-evaluasi-neraca-air--ramalan-agroklimat-714-hari-dashboard)
   - [Langkah 5: Penjadwalan Musim Tanam & Penguncian Tanggal Tanam (`/petak/[id]`)](#langkah-5-penjadwalan-musim-tanam--penguncian-tanggal-tanam-petakid)
   - [Langkah 6: Ekspor Dokumen Rencana Kerja Lapangan (`/laporan`)](#langkah-6-ekspor-dokumen-rencana-kerja-lapangan-laporan)
4. [Matriks Keputusan Tanam (Go / No-Go Checklist)](#4-matriks-keputusan-tanam-go--no-go-checklist)
5. [Mitigasi Risiko & Penanganan Anomali Pra-Tanam](#5-mitigasi-risiko--penanganan-anomali-pra-tanam)
6. [Glosarium Istilah Agronomi & Penginderaan Jauh](#6-glosarium-istilah-agronomi--penginderaan-jauh)

---

## 1. Prinsip Dasar Persiapan Tanam Presisi

Persiapan tanam presisi menggantikan kebiasaan tebak-menebak kalender konvensional dengan **tiga pilar validasi bio-geofisik**:

```
                       ┌──────────────────────────────────────────────┐
                       │   Tiga Pilar Validasi Pra-Tanam Presisi      │
                       └──────────────────────┬───────────────────────┘
                                              │
         ┌────────────────────────────┼────────────────────────────┐
         ▼                            ▼                            ▼
  [Kesiapan Matriks Tanah]     [Ketersediaan Air Sejati]    [Keamanan Fenologi GDD]
  • Bare Soil Index (BSI > 0)  • SAR VV/VH Backscatter      • Target Panas Kumulatif
  • Dekomposisi jerami tuntas  • Eliminasi hujan semu       • Hindari cekaman ekstrem
  • Bebas asam organik racun   • Kecukupan olah basah       • Estimasi panen optimal
```

1. **Kesiapan Fisik & Biokimia Tanah:** Memastikan biomassa musim sebelumnya telah terurai sempurna untuk mencegah keracunan asam organik (*organic acid toxicity*) pada perakaran bibit muda.
2. **Ketersediaan Air Sejati (Bukan Hujan Semu):** Menghindari fenomena *false start monsoon* (hujan 1–2 hari yang diikuti periode kering berkepanjangan) yang sering mematikan persemaian.
3. **Sinkronisasi Fenologi Varietas:** Menyesuaikan siklus tumbuh varietas terhadap profil termal (*Growing Degree Days* / GDD) agar fase kritis pembungaan (*anthesis*) tidak terbentur kemarau ekstrem atau banjir genangan.

---

## 2. Pra-Syarat & Data Awal

Sebelum memulai di platform Tani, pastikan Anda telah menyiapkan:
1. **File Batas Spasial Lahan:** Format `.kml`, `.kmz`, atau `.geojson` dengan poligon tertutup (contoh: Petak Bengkok 1 Pacitan memiliki 24 titik verteks dengan luas 0.37 Ha / 3.688 m²).
2. **Karakteristik Varietas Benih:** Pilihan varietas terdaftar di sistem (misal: *Inpari 32 HDB* untuk padi sawah dengan umur 115–120 hari dan $T_{\text{base}} = 10^\circ\text{C}$, atau *Pioneer P35* untuk jagung hibrida).
3. **Akses Platform Tani:** Akun pengguna aktif atau mode demo mandiri di `http://localhost:3000`.

---

## 3. Alur Kerja Langkah-demi-Langkah (Step-by-Step Workflow)

### Langkah 1: Registrasi & Verifikasi Batas Spasial Petak (`/admin/petak-baru`)
Langkah pertama adalah memastikan koordinat lahan terdaftar dengan presisi sub-meter di basis data spasial (PostGIS).

```
[Buka /admin/petak-baru] ──> [Upload KML / Gambar Poligon] ──> [Verifikasi Luas & Centroid] ──> [Simpan Petak]
```

1. Buka menu navigasi: **Admin** $\rightarrow$ **Daftarkan Petak Baru** (`/admin/petak-baru`).
2. Pilih tab **"Upload File KML/KMZ"**:
   - Tarik dan lepas (*drag & drop*) file KML petak (misal `Bengkoxxx1.kml`).
   - Sistem melakukan parsing otomatis: menampilkan jumlah verteks (24 titik), batas garis poligon di atas citra satelit resolusi tinggi, dan kalkulasi luas otomatis (**0.37 Ha**).
3. Lengkapi atribut administratif:
   - **Perusahaan / Kebun:** Pilih *Kebun Bengkok (Pacitan)*.
   - **Divisi:** *Divisi Bengkok Utama*.
   - **Nama Petak:** `Petak Bengkok 1`.
   - **Komoditas:** *Padi (Oryza Sativa)* atau *Jagung*.
4. Klik **"Simpan & Daftarkan Petak"**.

---

### Langkah 2: Audit Spektral Kesiapan Tanah & Fase Bera (`/peta`)
Setelah petak terdaftar, evaluasi kondisi permukaan tanah menggunakan citra satelit multispektral Sentinel-2.

```
[Buka /peta] ──> [Pilih Petak di Sidebar] ──> [Cek NDVI 0.20-0.28] ──> [Aktifkan Overlay True/False Color]
```

1. Buka menu **Peta Lahan** (`/peta`).
2. Pilih `Kebun Bengkok (Pacitan)` pada dropdown kebun di pojok kiri atas.
3. Klik poligon petak pada peta atau pilih dari panel daftar petak sebelah kanan:
   - Perhatikan **Nilai NDVI Terkini**: Pada lahan siap olah / bera, nilai NDVI normal berkisar antara **0.20 hingga 0.28** (berwarna abu-abu/batu pada legenda).
   - *Catatan:* Nilai NDVI $< 0.30$ pada lahan bera adalah indikator positif bahwa lahan bersih dari gulma tebal dan sisa tanaman tua.
4. Gunakan panel kontrol citra satelit di pojok kanan atas:
   - Aktifkan **"Overlay Citra Satelit"**.
   - Pilih kanal visualisasi **True Color (RGB B04, B03, B02)** untuk melihat warna riil tanah (cokelat terbuka).
   - Pilih kanal **False Color (NIR B08, Red B04, Green B03)** untuk mendeteksi apakah masih ada kantong vegetasi liar yang belum terbajak (vegetasi aktif akan menyala merah terang).
5. Gerakkan **Timeline Slider Temporal** di bagian bawah untuk melihat riwayat 3–6 bulan ke belakang:
   - Pastikan kurva indeks vegetasi telah melandai pasca-panen musim lalu, menandakan periode istirahat tanah (*fallow period*) telah terpenuhi.

---

### Langkah 3: Analisis Kelembaban Tanah & Radar SAR Sentinel-1 (`/petak/[id]`)
Kondisi optik dapat terhalang awan, oleh karena itu verifikasi wajib didukung oleh instrumen radar gelombang mikro Sentinel-1 C-Band SAR.

```
[Buka /petak/1] ──> [Buka Modal Telemetri Satelit] ──> [Audit Nilai SAR VV/VH & BSI] ──> [Evaluasi Kesiapan Olah Tanah]
```

1. Buka halaman detail petak: klik **"Lihat Detail & Musim"** atau buka langsung rute `/petak/1`.
2. Klik tombol **"Telemetri Citra Satelit"** (ikon satelit di samping nama petak).
3. Periksa parameter radar dan bio-geofisik:
   - **BSI (Bare Soil Index):** Nilai positif ($+0.15$ s/d $+0.25$, misal $+0.1951$ pada Bengkok 1) mengonfirmasi lahan berstatus tanah telanjang siap olah.
   - **SAR C-Band VV Polarisation:** Nilai berkisar antara **-10.0 dB s/d -11.5 dB** (kondisi tanah gembur/kasar pasca-bajak).
   - **SAR C-Band VH Polarisation:** Nilai berkisar antara **-20.0 dB s/d -21.0 dB** (menandakan ketiadaan hamburan volume dari tajuk tanaman rapat).
   - **NDWI (Normalized Difference Water Index):** Nilai berkisar $-0.10$ s/d $-0.15$ menandakan tanah dalam fase kelembaban sedang menuju kapasitas lapang (*field capacity*).
4. **Indikator Banjir / Siap Tanam Padi:**
   - Apabila petak dipersiapkan untuk padi sawah, pembajakan basah (*puddling*) dan penggenangan air (2–5 cm) akan menyebabkan penurunan drastis pada koefisien hamburan balik radar ($VV < -14.0\text{ dB}$). Saat nilai ini tercapai, tanah telah jenuh air dan siap untuk pindah tanam (*transplanting*).

---

### Langkah 4: Evaluasi Neraca Air & Ramalan Agroklimat 7–14 Hari (`/dashboard`)
Langkah ini memastikan bibit muda tidak mengalami stres kekeringan (*drought stress*) setelah ditanam di lapangan.

```
[Buka /dashboard] ──> [Periksa Widget Cuaca FAO-56] ──> [Analisis ET₀ vs Curah Hujan 7-14 Hari]
```

1. Buka **Dashboard Utama** (`/dashboard`).
2. Periksa kartu mikro-klimat kebun:
   - **Evapotranspirasi Acuan ($ET_0$):** Rata-rata evaporasi atmosfer di Pacitan berkisar antara **3.8 – 4.5 mm/hari**.
   - **Kebutuhan Air Tanaman Fase Awal ($ET_c$):**
     $$\text{ET}_c = K_c \times \text{ET}_0$$
     - *Padi Sawah (Fase Macak-macak/Bibit):* $K_c \approx 1.05 \implies \text{ET}_c \approx 4.2 - 4.7\text{ mm/hari}$.
     - *Jagung (Fase Perkecambahan):* $K_c \approx 0.35 \implies \text{ET}_c \approx 1.4 - 1.6\text{ mm/hari}$.
3. Buka **"Prakiraan Cuaca 7 Hari ke Depan"**:
   - **Aturan Ambang Hujan Aman:** Pastikan curah hujan kumulatif dalam 7 hari ke depan diproyeksikan $\ge 40\text{ mm}$ (atau pasokan irigasi teknis tersedia stabil).
   - Pastikan tidak ada prakiraan *dry spell* (kemarau terik tanpa hujan $> 5\text{ hari}$ berturut-turut) yang dapat membuat bibit pindahan layu permanen.

---

### Langkah 5: Penjadwalan Musim Tanam & Penguncian Tanggal Tanam (`/petak/[id]`)
Setelah seluruh indikator fisik dan agroklimat terpenuhi, masukkan jadwal ke dalam mesin pelacak fenologi sistem.

```
[Buka /petak/1] ──> [Klik "+ Catat Musim Tanam Baru"] ──> [Pilih Varietas & Tanggal] ──> [Aktifkan Mesin GDD]
```

1. Kembali ke halaman detail petak (`/petak/1`).
2. Gulir ke bagian **"Riwayat Musim Tanam"** dan klik tombol hijau **"+ Catat Musim Tanam Baru"**.
3. Isi formulir pendaftaran musim:
   - **Varietas Benih:** Pilih varietas unggul bersertifikat (misal: *Inpari 32 HDB*).
   - **Tanggal Tanam (Planting Date):** Masukkan tanggal rencana sebar/pindah tanam (misal hari ini atau tanggal awal musim hujan).
   - **Estimasi Target Hasil (Ton/Ha):** Masukkan target rasional (misal: `6.5` ton/ha untuk Inpari 32 HDB).
   - **Catatan Persiapan Lahan:** Tuliskan catatan operasional (contoh: *"Olah tanah sempurna, aplikasi pupuk organik kandang 2 ton/ha, perlakuan benih fungisida"*).
4. Klik **"Simpan Musim Tanam"**.
5. **Dampak Otomatis pada Sistem:**
   - Hari Setelah Tanam (HST) mulai aktif menghitung secara dinamis.
   - Mesin **Growing Degree Days (GDD)** mulai mengakumulasi satuan panas harian dari stasiun cuaca.
   - Proyeksi tanggal panen (*Estimated Harvest Date*) dihitung otomatis berdasarkan akumulasi target GDD varietas.
   - Sistem peringatan dini (*Alert Engine*) mulai memantau anomali NDVI terhadap pita toleransi fase pertumbuhan.

---

### Langkah 6: Ekspor Dokumen Rencana Kerja Lapangan (`/laporan`)
Cetak dokumen instruksi kerja resmi untuk diserahkan kepada mandor dan tim lapangan.

```
[Buka /laporan] ──> [Pilih Estate & Petak] ──> [Generate Laporan PDF / CSV] ──> [Distribusi ke Tim Lapangan]
```

1. Buka menu **Pusat Laporan** (`/laporan`).
2. Pilih Kebun *Kebun Bengkok (Pacitan)* dan Petak *Petak Bengkok 1*.
3. Pilih jenis laporan:
   - **Laporan Kesehatan Vegetasi & Kesiapan Lahan (PDF):** Menghasilkan dokumen resmi yang mencantumkan peta batas poligon, indeks spektral satelit (BSI, NDVI, NDWI), serta rekomendasi pengolahan tanah ReportLab.
   - **Ekspor CSV (UTF-8 BOM):** Data tabel telemetri untuk dianalisis lebih lanjut di Microsoft Excel.
4. Klik **"Generate Laporan PDF"** atau **"Unduh Laporan"**.
5. Distribusikan dokumen fisik/digital kepada pelaksana lapangan sebagai acuan kerja operasional.

---

## 4. Matriks Keputusan Tanam (Go / No-Go Checklist)

Gunakan tabel matriks di bawah ini sebelum memutuskan untuk menyebar benih atau memindahkan bibit ke sawah:

| Parameter Evaluasi | Sumber Data di Platform | Ambang Batas Aman (**GO**) | Ambang Batas Tunda (**NO-GO**) | Tindakan Jika No-Go |
| :--- | :--- | :--- | :--- | :--- |
| **Status Kebersihan Gulma** | Menu `/peta` (NDVI) | $\text{NDVI} \le 0.28$ (Bera bersih) | $\text{NDVI} > 0.35$ | Lakukan penyiangan ulang atau herbisida pra-tumbuh. |
| **Keterbukaan Permukaan Tanah** | Menu `/petak/1` (Modal Telemetri) | $\text{BSI} > +0.10$ | $\text{BSI} \le 0.00$ | Pengolahan tanah (bajak/singkal) belum tuntas. |
| **Kejenuhan Air Tanah (Padi)** | Menu `/petak/1` (SAR Sentinel-1) | $\text{VV} \le -12.0\text{ dB}$ (Tergenang/Macak) | $\text{VV} > -9.5\text{ dB}$ (Kering keras) | Tambah suplai irigasi hingga tanah melumpur (*puddled*). |
| **Proyeksi Hujan 7 Hari** | Menu `/dashboard` (Open-Meteo) | Kumulatif $\ge 40\text{ mm}$ atau irigasi terjamin | Kumulatif $< 15\text{ mm}$ tanpa irigasi | Tunda tanam 1–2 minggu hingga monsun aktif. |
| **Suhu Udara Ekstrem** | Menu `/dashboard` (Cuaca) | $T_{\text{min}} > 18^\circ\text{C}$, $T_{\text{max}} < 36^\circ\text{C}$ | $T_{\text{min}} \le 15^\circ\text{C}$ atau $T_{\text{max}} \ge 38^\circ\text{C}$ | Pasang naungan persemaian atau atur tinggi genangan air. |

---

## 5. Mitigasi Risiko & Penanganan Anomali Pra-Tanam

### Kasus A: Hujan Tertunda (*Delayed Monsoon*)
* **Gejala:** Kalender telah memasuki bulan tanam, tetapi radar SAR menunjukkan tanah kering ($\text{VV} > -9.0\text{ dB}$) dan prakiraan hujan 7 hari minim.
* **Tindakan Platform:** Jangan buat musim tanam baru di sistem. Pertahankan status lahan pada **"Bera / Lahan Terbuka"**. Gunakan air irigasi terbatas hanya untuk pembuatan persemaian sistem kering (*dry nursery*) di lahan khusus.

### Kasus B: Genangan Berlebih / Potensi Banjir Bandang
* **Gejala:** Nilai SAR VV anjlok drastis ($< -18.0\text{ dB}$) dan ramalan cuaca menunjukkan hujan lebat berulang $> 80\text{ mm/hari}$.
* **Tindakan Platform:** Tunda pindah tanam bibit muda. Bibit yang baru dipindahkan berumur $< 15\text{ HSS}$ akan hanyut atau membusuk bila terendam penuh lebih dari 36 jam. Perbaiki saluran drainase tersier petak sebelum tanggal tanam dikunci.

### Kasus C: Tutupan Awan Tebal pada Citra Optik
* **Gejala:** Citra Sentinel-2 True Color pada menu `/peta` tertutup awan putih tebal atau bayangan awan.
* **Tindakan Platform:** Jangan panik menganggap data hilang. Buka menu `/petak/1` dan andalkan data **Sentinel-1 SAR (VV & VH)**. Gelombang radar mikro menembus 100% awan dan kabut, memberikan kepastian kelembaban tanah tanpa kendala atmosfer.

---

## 6. Glosarium Istilah Agronomi & Penginderaan Jauh

* **HST (Hari Setelah Tanam):** Umur tanaman yang dihitung sejak benih ditabur/bibit dipindahkan ke lahan utama.
* **Bera (*Fallow Land*):** Periode saat lahan sengaja diistirahatkan tanpa tanaman budidaya untuk memutus siklus hama dan memulihkan hara tanah.
* **NDVI (*Normalized Difference Vegetation Index*):** Rasio reflektansi inframerah dekat (NIR) dan merah (Red) untuk mengukur kerapatan biomassa dan kadar klorofil vegetasi.
* **BSI (*Bare Soil Index*):** Kombinasi pita spektral biru, merah, NIR, dan SWIR untuk menonjolkan area tanah terbuka dan mengabaikan tutupan daun.
* **SAR (*Synthetic Aperture Radar*):** Sensor radar aktif yang memancarkan gelombang mikro independen dari sinar matahari dan tembus awan.
* **$ET_0$ (*Reference Evapotranspirasi*):** Laju kehilangan air dari permukaan vegetasi rumput acuan dalam kondisi air tidak terbatas, dihitung menggunakan rumus baku FAO-56 Penman-Monteith.
* **GDD (*Growing Degree Days*):** Satuan akumulasi energi panas harian di atas suhu dasar tanaman ($T_{\text{base}}$) yang mengontrol laju perkembangan morfologi tanaman.
