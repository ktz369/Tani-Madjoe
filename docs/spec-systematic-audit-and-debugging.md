# Spesifikasi Teknis: Systematic Debugging & Full Feature Verification
**Platform Pertanian Presisi `Tani`**
**Standar Kualitas:** Zero-Defect, 100% Feature Operational, Zero Console Error, Exact Math Parity

---

## 1. Ringkasan & Tujuan Sistem (System Overview & Goals)

Sistem `Tani` adalah platform pertanian presisi berskala enterprise yang mengintegrasikan penginderaan jauh satelit (Sentinel-2 & Sentinel-1 SAR), kalkulasi evapotranspirasi FAO-56 Penman-Monteith, pelacakan fenologi berbasis Growing Degree Days (GDD), pemantauan spasial in-browser WebWorker (DuckDB-WASM), serta operasional agronomi harian tingkat petak (HOK, irigasi, saprotan dengan PHI guardrail, kalkulator rafaksi panen 14% SNI, dan unit economics HPP).

Tujuan dari spesifikasi ini adalah menetapkan **kontrak fungsional dan teknis mutlak (invariants)** untuk setiap fitur di seluruh 5 domain platform tanpa ada yang terlewat, memastikan tidak ada silent bug, tidak ada data contract mismatch, dan tidak ada kegagalan rendering UI di browser.

---

## 2. Kontrak Fungsional & Spesifikasi per Domain

### 2.1 DOMAIN 1: Precision Operations Engine

#### A. Pre-Harvest Interval (PHI) Guardrail
- **Tujuan:** Mencegah kontaminasi residu kimia pada hasil panen.
- **Formula:** 
  $$\Delta\text{Days} = \text{TargetHarvestDate} - \text{ApplicationDate}$$
- **Aturan Bisnis (Invariant):**
  - Jika $\Delta\text{Days} < \text{PHI}$, aplikasi kimia **WAJIB DITOLAK** oleh Backend dengan HTTP 400 (`error_code: "PHI_VIOLATION"`).
  - Pada Frontend (`SaprotanApplicationModal.tsx`), tombol simpan/terapkan harus dalam kondisi `disabled`, dan alert berwarna merah menyala harus memperingatkan operator bahwa komoditas berisiko ditolak pasar akibat residu bahan aktif melebihi Batas Maksimum Residu (BMR).
  - Jika $\Delta\text{Days} \ge \text{PHI}$ atau produk memiliki $\text{PHI} = 0$ (misal: pupuk organik/Urea), status dinyatakan aman (`SAFE`).

#### B. Standardisasi Panen Kadar Air 14% (SNI Rafaksi Engine)
- **Tujuan:** Menghitung konversi bobot kotor gabah/jagung menjadi bobot bersih standar perdagangan nasional (KA 14%).
- **Formula Presisi:**
  $$\text{Net Weight (kg)} = \text{Gross Weight} \times \left(1 - \frac{\text{Dockage \%}}{100}\right) \times \left(\frac{100 - KA_{\text{aktual}} \%}{100 - 14}\right)$$
- **Aturan Bisnis (Invariant):**
  - Nilai $KA_{\text{aktual}}$ valid dalam rentang $10.0\% \le KA \le 40.0\%$.
  - Nilai $\text{Dockage}$ (hampa/kotoran) valid dalam rentang $0.0\% \le \text{Dockage} \le 20.0\%$.
  - Pendapatan kotor: $\text{Gross Revenue} = \text{Net Weight} \times \text{Selling Price/kg}$.
  - Laba bersih: $\text{Net Profit} = \text{Gross Revenue} - \text{Total Running Cost}$.
  - $\text{ROI \%} = (\text{Net Profit} / \text{Total Running Cost}) \times 100\%$.

#### C. Plot Unit Economics & Running HPP Card
- **Tujuan:** Menghitung total beban biaya operasional berjalan petak dan estimasi harga pokok produksi per kilogram.
- **Formula Presisi:**
  $$\text{Total Cost} = \sum \text{Labor Cost (HOK)} + \sum \text{Saprotan Cost} + \sum \text{Irrigation BBM Cost} + \text{Land Rental Cost}$$
  $$\text{Projected HPP/kg} = \frac{\text{Total Cost}}{\text{Projected Yield (kg)}}$$
- **Aturan Bisnis (Invariant):**
  - Status efisiensi dibandingkan dengan acuan Bapanas:
    - $\text{Projected HPP} \le \text{Rp } 5.500/\text{kg} \implies \textbf{Optimal / Efisien}$ (Hijau).
    - $\text{Rp } 5.500 < \text{Projected HPP} \le \text{Rp } 6.500/\text{kg} \implies \textbf{Waspada / Rata-rata}$ (Kuning).
    - $\text{Projected HPP} > \text{Rp } 6.500/\text{kg} \implies \textbf{Kritis / Defisit}$ (Merah).

#### D. DuckDB-WASM Spatial Buffer Engine
- **Tujuan:** Mengalkulasi poligon karantina darurat radius $50\text{ m}$ di sekitar titik laporan Organisme Pengganggu Tanaman (OPT) kategori `HIGH` atau `EMERGENCY`.
- **Aturan Bisnis (Invariant):**
  - Inisialisasi WebWorker DuckDB-WASM **wajib terlindungi dari SSR crash** (hanya diinisialisasi saat `typeof window !== 'undefined'`).
  - Menggunakan query SQL spasial DuckDB:
    ```sql
    SELECT ST_AsGeoJSON(ST_Union(ST_Buffer(geom, 0.00045))) FROM points;
    ```
  - Jika lingkungan browser memblokir WebWorker/WASM, engine **wajib jatuh ke Geodesic Fallback** (algoritma 32 titik lingkaran geodetik) tanpa melempar runtime error.

---

### 2.2 DOMAIN 2: Geospatial & Penginderaan Jauh (Remote Sensing)

#### A. Mapbox GL & Satellite Tiles
- **Aturan Bisnis (Invariant):**
  - Layer citra satelit default: Esri World Imagery (`https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`).
  - Fallback otomatis: OpenStreetMap standard tiles jika koneksi satelit timeout/gagal.
  - Poligon petak (Pacitan Bengkok 1, 24 koordinat WGS84) **hanya boleh di-push setelah event `map.once('idle')`** untuk mencegah layer hilang saat map berpindah style.
  - Bebas dari error `Style is not done loading` di console.

#### B. KML Parsing Engine
- **Aturan Bisnis (Invariant):**
  - Mampu mengekstrak koordinat dari `<Polygon><coordinates>` baik single maupun batch `<Folder>`.
  - Memvalidasi urutan koordinat `[lon, lat]` dan menutup poligon (titik akhir = titik awal).
  - Mengalkulasi luas poligon menggunakan proyeksi geodetik spheroid WGS84 dengan toleransi deviasi $< 1\%$ terhadap data BPN.

#### C. Indeks Vegetasi Satelit
- **NDVI:** $(B8 - B4) / (B8 + B4)$ (Rentang $-1.0 \text{ s.d. } +1.0$)
- **NDWI:** $(B8 - B11) / (B8 + B11)$
- **EVI:** $2.5 \times (B8 - B4) / (B8 + 6 \times B4 - 7.5 \times B2 + 1)$
- **SAVI:** $((B8 - B4) / (B8 + B4 + 0.5)) \times 1.5$

---

### 2.3 DOMAIN 3: Agronomi, Cuaca & Fenologi

#### A. FAO-56 Penman-Monteith Evapotranspirasi Acuan ($ET_0$)
- **Formula:**
  $$ET_0 = \frac{0.408\Delta(R_n - G) + \gamma \frac{900}{T + 273} u_2 (e_s - e_a)}{\Delta + \gamma(1 + 0.34 u_2)}$$
- **Invariant:** $ET_0$ bernilai positif ($1.0 \text{ s.d. } 9.0\text{ mm/hari}$ untuk wilayah tropis Indonesia).

#### B. Growing Degree Days (GDD) & Fenologi Padi
- **Formula:** $GDD = \max\left(0, \frac{T_{\max} + T_{\min}}{2} - T_{\text{base}}\right)$ dengan $T_{\text{base}} = 10^\circ\text{C}$.
- **Fase Pertumbuhan:**
  1. Vegetatif Awal: $0 \le \sum GDD < 350$
  2. Vegetatif Aktif: $350 \le \sum GDD < 650$
  3. Inisiasi Malai: $650 \le \sum GDD < 850$
  4. Bunting (Booting): $850 \le \sum GDD < 1050$
  5. Berbunga (Heading): $1050 \le \sum GDD < 1250$
  6. Pengisian Bulir: $1250 \le \sum GDD < 1600$
  7. Masak Fisiologis: $\sum GDD \ge 1600$

#### C. Engine Peringatan Dini (Alert Rules)
- **Rule 1 (Stres Air):** Defisit lengas tanah $> 40\%$ kapasitas lapang atau kelembapan tanah $< 20\%$.
- **Rule 2 (Risiko OPT):** Kelembapan udara $> 85\%$ selama $> 48\text{ jam}$ berturut-turut pada suhu $24-28^\circ\text{C}$.
- **Rule 3 (Anomali Kanopi):** Penurunan NDVI $> 0.15$ dalam rentang 10 hari tanpa adanya panen.
- **Rule 4 (Cuaca Ekstrim):** Prediksi curah hujan $> 50\text{ mm/hari}$ atau kecepatan angin $> 30\text{ km/jam}$.

---

### 2.4 DOMAIN 4: Autentikasi, Hak Akses & Laporan

#### A. RBAC & Autentikasi
- Enkripsi password menggunakan `bcrypt`.
- Token JWT berekspersi 24 jam dengan validasi signature HMAC-SHA256.
- Role matrix:
  - `SUPER_ADMIN`: Akses penuh ke seluruh menu dan pengaturan organisasi.
  - `ESTATE_MANAGER`: Akses manajemen petak, persetujuan panen, dan laporan estate.
  - `AGRONOMIST`: Akses telemetri satelit, scouting OPT, dan rekomendasi saprotan.
  - `OPERATOR`: Logging harian HOK, BBM pompa air, dan form scouting lapang.

#### B. Laporan & Dokumen Ekspor
- PDF Engine: ReportLab dengan layout header korporat, ringkasan telemetri, tabel biaya, dan grafik indeks vegetasi.
- CSV Engine: Tabular data UTF-8 dengan pemisah koma terstandarisasi.

---

### 2.5 DOMAIN 5: Editorial UI & Mapbox Integration

#### A. Desain Editorial Bebas Card Soup
- Typografi: Aspekta Variable Font (300 s.d. 700). Tidak ada dependensi font eksternal yang memblokir render.
- Border & Dividing: Hairline border `border-black/[0.08]`, mengeliminasi drop shadow yang berlebihan (`shadow-md`, `shadow-lg`, dsb.) digantikan dengan pembagian bidang datar elegan.
- Skala Spasial: Skala Fibonacci (`3px`, `5px`, `8px`, `13px`, `21px`, `34px`, `55px`, `89px`).
- Angka Telemetri: Wajib menggunakan kelas `.tabular-nums` atau `font-mono` untuk keselarasan vertikal.

#### B. Floating Capsule Navbar & Admin Popover
- Navbar melayang di tengah: `fixed top-[13px] left-1/2 -translate-x-1/2 z-50 h-[44px] max-w-[720px] rounded-[9999px] bg-white/85 backdrop-blur-[14px]`.
- Dropdown Admin Popover melayang bebas tanpa terpotong oleh `overflow-x-auto`.

---

## 3. Matriks Kriteria Penerimaan (Acceptance Criteria Matrix)

| Kriteria | Kondisi Sukses |
| :--- | :--- |
| **Backend Endpoints** | Seluruh endpoint REST API merespon HTTP 200/201 untuk payload valid, HTTP 400 untuk pelanggaran PHI, HTTP 422 untuk schema invalid. |
| **Mathematical Parity** | Formula SNI 14% memberikan hasil presisi pada pengujian ($2.550\text{ kg} \implies 2.257,79\text{ kg}$). |
| **DuckDB-WASM** | Eksekusi query spasial di browser tanpa error console, fallback geodetik aktif jika WASM dinonaktifkan. |
| **Browser Console** | 0 error (`console.error`) pada seluruh 8 rute Next.js. |
| **TypeScript & Build** | `npx tsc --noEmit` exit code 0, `npm run build` exit code 0 (11/11 halaman terkompilasi). |
