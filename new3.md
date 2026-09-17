```markdown
# AGENT BRIEF: DIGITAL AGRONOMY ENGINE (TERRACED RICE & CORN CYCLES)

## 1. SYSTEM ROLE & OBJECTIVE
Bertindak sebagai Principal Agritech Software Architect & Senior Full-Stack Engineer. Tugasmu adalah mengintegrasikan sistem intelijen pertanian terpadu (berbasis *cloud-only data*, tanpa dependensi hardware fisik) khusus komoditas padi dan jagung pada lahan berkontur/terasiring ke dalam basis kode aplikasi yang sudah ada.

---

## 2. PHASE 0: CODEBASE RECONNAISSANCE (ADAPTATION PROTOCOL)
Sebelum menulis satu baris kode fitur pun, lakukan analisis komprehensif terhadap repositori:
1. **Audit Dependency & Stack:**
   * Periksa `package.json`, `requirements.txt`, `pyproject.toml`, atau file konfigurasi dependensi terkait untuk mendeteksi runtime backend, library GIS (Mapbox, Leaflet, Turf.js, GDAL, Shapely, GeoPandas), dan framework frontend.
2. **Audit Database & Spatial Capability:**
   * Periksa schema ORM (Prisma, Drizzle, SQLAlchemy, Django ORM, dll.).
   * Cek apakah engine database saat ini sudah mendukung tipe data geospasial (PostGIS / Geometry column) atau masih plain JSON / latitude-longitude points.
3. **Audit State Management & Routing:**
   * Identifikasi arsitektur routing (App Router, Pages Router, REST controller, GraphQL) dan middleware autentikasi/organisasi yang berlaku.
4. **Prinsip Non-Breaking Changes:**
   * Seluruh entitas dan modul baru harus berupa ekstensi modular. Dilarang merusak schema tabel yang sudah ada atau memodifikasi konvensi API yang sudah berjalan.

---

## 3. EXTERNAL DATA CONTRACTS (100% HARDWARE-FREE)
Sistem dilarang mengasumsikan adanya sensor IoT di lahan. Gunakan koneksi API berikut:

| Kebutuhan Data | Sumber API / Dataset | Endpoint / Resolusi |
| :--- | :--- | :--- |
| **Cuaca & Radiasi** | Open-Meteo Historical & Forecast API / ERA5 | Harian (Radiasi matahari, suhu min/max, kelembapan, angin, presipitasi) |
| **Karakteristik Tanah** | ISRIC SoilGrids REST API | Resolusi 250m (pH, tekstur pasir/debu/liat, bulk density, CEC pada kedalaman 0–30 cm) |
| **Citra Radar (SAR)** | Sentinel-1 GRD (via Copernicus / GEE) | Band VV & VH (penetrasi awan, deteksi kelembapan & biomassa basah) |
| **Citra Optik** | Sentinel-2 L2A | Band B4 (Red), B8 (NIR), B11/B12 (SWIR) resolusi 10m |
| **Topografi / Elevasi** | Copernicus DEM GLO-30 / SRTM 30m | Data kontur untuk pemodelan hidrologi limpasan terasiring |

---

## 4. MATHEMATICAL ENGINES & ALGORITHMIC LOGIC

### Module A: Dynamic Planting Window Engine (Lahan Kosong)
Jalankan forward-simulation neraca air harian selama 100–120 hari ke depan untuk setiap tanggal kandidat tanam $T_0$ ($T_0 \in [1..30\text{ hari ke depan}]$):

1. **Kapasitas Simpan Air Tanah (AWC):**
   $$\text{AWC} = \theta_{FC} - \theta_{PWP}$$
   *(Dihitung dari tekstur tanah SoilGrids menggunakan fungsi pedotransfer Saxton-Rawls).*
2. **Simulasi Neraca Air Harian (FAO-56):**
   $$S(t) = S(t-1) + P(t) - ET_c(t) - Runoff(t) - DeepPercolation(t)$$
   Di mana $ET_c(t) = K_c(t) \times ET_0(t)$, nilai $K_c$ berubah dinamis sesuai umur fase tanaman.
3. **Fungsi Penalti Kelayakan ($S_{T_0}$):**
   $$S_{T_0} = 100 - \sum_{k=1}^{n} \left( W_k \times \text{StressRisk}_k \right)$$
   * *Rule Jagung:* Jika kadar air tanah fase perkecambahan (hari 0–7) $> 85\%$ kapasitas lapang selama 3 hari berturut-turut $\rightarrow$ beri penalti busuk benih $W = 40$. Jika fase pembungaan/silking (hari 45–60) mengalami defisit air $> 60\%$ $\rightarrow$ beri penalti tongkol ompong $W = 50$.
   * *Rule Padi:* Butuh akumulasi air $\ge 200\text{ mm}$ pada fase pelumpuran (hari -15 s/d 0). Jika air kurang pada fase bunting/malai $\rightarrow$ beri penalti gabah hampa $W = 50$.

### Module B: Cascading Hydrology (Khusus Terasiring)
Ubah asumsi drainase vertikal menjadi drainase berundak:
* Baca slope dan flow direction dari DEM.
* Hitung limpasan permukaan (*runoff*) dari kedok atas sebagai debit masuk (*inflow*) untuk kedok di bawahnya.
* Generate jadwal buka pintu air berjenjang agar undakan bawah tidak tergenang berlebih.

### Module C: Cloud-Penetrating Vegetation & Soil Index
* **SAR Backscatter Ratio:** Hitung rasio $\frac{\sigma^0_{VH}}{\sigma^0_{VV}}$ dari Sentinel-1 untuk estimasi perkembangan biomasa padi saat fase kanopi tertutup awan mendung.
* **Spectral Unmixing:** Filter piksel tepian poligon petak sempit agar pantulan pematang rumput tidak mengontaminasi nilai NDVI kanopi padi/jagung.

### Module D: Terrain-Adaptive Variable Rate Nutrition (VRN)
* Konversi defisiensi nitrogen (dideteksi via degradasi rasio spektral) ke dalam 2 format eksekusi:
  1. *Manual Bucket Format:* Takaran riil per petak (misal: "Petak A1: 12 kg Urea; Petak A2: 8 kg Urea").
  2. *Drone Waypoint Format:* File rute terbang 3D (`.kml` / `.mission`) dengan parameter ketinggian dinamis mengikuti kontur lereng (*terrain-following*).

---

## 5. DATABASE SCHEMA BLUEPRINT (MODULAR EXTENSION)
Integrasikan entitas ini ke dalam ORM yang ada:


```

Farm (1) ──< Plot (Terasiring/Kedok) (N) ──< CropCycle (N)
│
├──< PlantingWindowSimulation
├──< HydrologyWaterBalance
├──< NutritionPrescription
└──< YieldMarginAnalysis

```

* **`Plot`:** Menyimpan poligon geospasial (`geometry(Polygon, 4326)`), elevasi rata-rata, persentase kemiringan (*slope*), dan urutan undakan (*tier_order*).
* **`CropCycle`:** Komoditas (`RICE` / `CORN`), varietas, tanggal tanam riil, target tonase.
* **`PlantingWindowSimulation`:** Hasil forward calculation, tanggal $T_0$ rekomendasi, skor risiko, dan status kesiapan tanah saat kosong.
* **`NutritionPrescription`:** Dosis per petak, format takaran manual (kg/karung), dan waypoint koordinat untuk drone semprot.
* **`YieldMarginAnalysis`:** Pencatatan biaya riil sarana produksi per petak vs. estimasi tonase hasil panen.

---

## 6. IMPLEMENTATION STEPS (FOR CODE AGENT)
1. **Step 1 (Context Discovery):** Jalankan command pengecekan repo, inspeksi skema DB yang sedang aktif, dan laporkan dependensi yang kurang (misal: client GeoJSON, Turf, atau math engine).
2. **Step 2 (Data Service Layer):** Bangun connector API untuk Open-Meteo, SoilGrids, dan Copernicus Client dengan caching layer (Redis/In-Memory) agar tidak kena limit rate API.
3. **Step 3 (Core Calculation Engines):** Tulis unit logic pure function (tanpa efek samping DB) untuk FAO-56 Penman-Monteith, AWC soil calculator, dan planting window scoring function. Pastikan didukung unit test dengan data uji deterministik.
4. **Step 4 (Database Migration & API Endpoints):** Buat file migrasi skema baru dan sediakan REST/RPC endpoint:
   * `POST /api/agronomy/planting-window/simulate`
   * `GET /api/agronomy/plots/:id/water-balance`
   * `GET /api/agronomy/plots/:id/prescriptions`
5. **Step 5 (UI Integration):** Hubungkan dengan antarmuka peta poligon yang sudah dipakai web app, tambahkan visualisasi indikator kesiapan tanah dan rekomendasi jendela tanam.

---

## 7. VERIFICATION & QUALITY GATES
* **Zero-Hallucination Math:** Pastikan rumus neraca air tanah tidak menghasilkan nilai kadar air negatif atau melampaui kapasitas jenuh tanah (*saturation capacity*).
* **Missing Data Resilience:** Jika API citra satelit optik gagal karena tutupan awan 100%, fallback otomatis ke estimasi radar Sentinel-1 SAR tanpa melempar error 500 ke frontend.
* **Format Compatibility:** Pastikan payload output rute drone valid terhadap format standar waypoint KML.

```
