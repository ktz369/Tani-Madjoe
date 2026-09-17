# Spesifikasi Teknis: Digital Agronomy Engine & Real Data Integration
**Platform Pertanian Presisi `Tani` (Terraced Rice & Corn Cycles)**  
**Dasar Acuan:** Brief Arsitektur `new3.md` & Audit Real-Data Invariants  
**Standar Kualitas:** 100% Cloud-Only Real Data (Hardware-Free), Exact Math Parity, Zero Mockup, Full-Bleed Map Rendering  

---

## 1. Ringkasan Eksekutif & Objektif Sistem

Sistem `Tani` bertransformasi dari sekadar dashboard pemantauan berbasis seed data menjadi **Digital Agronomy Engine Mandiri** berskala enterprise tanpa dependensi sensor IoT lapang (*100% cloud-only data*). Sistem ini mengintegrasikan penginderaan jauh satelit, karakteristik tanah global, model elevasi digital (DEM), dan algoritma neraca air prediktif untuk komoditas padi dan jagung pada bentang lahan berkontur/terasiring.

### Masalah Nyata yang Diselesaikan:
1. **Peta Belum Terender Sempurna:** Poligon petak KML Pacitan Bengkok 1 (0,37 Ha) sebelumnya terkunci pada `zoom: 14` tanpa pemanggilan `fitBounds`, tampak seperti titik kecil tak terfokus, serta belum tersedianya peta spasial di halaman detail petak (`/petak/[id]`).
2. **Kontradiksi Unit Economics & HOK:** Lahan petak saat ini berstatus **Bera / Lahan Terbuka (0 HST)**, tetapi sistem sebelumnya menyajikan data panen 13 hari lagi dan log buruh tanam/penyiangan palsu.
3. **Ketiadaan Intelijen Pra-Tanam:** Pada lahan kosong/bera, kebutuhan agronomis paling kritis adalah **menentukan jendela tanam terbaik ($T_0$)** berdasarkan neraca air tanah 100–120 hari ke depan dan pemodelan hidrologi terasiring.

---

## 2. Arsitektur Kontrak Data Eksternal (100% Hardware-Free)

Sistem dilarang keras mengasumsikan adanya sensor fisik IoT di lapangan. Seluruh telemetri bersumber langsung dari konektor API cloud terstandarisasi:

| Kebutuhan Data | Sumber API / Dataset | Parameter & Resolusi | Output Sistem |
| :--- | :--- | :--- | :--- |
| **Karakteristik Fisik Tanah** | **ISRIC SoilGrids REST API** (`https://rest.isric.org/soilgrids/v2.0/properties/query`) | Resolusi 250m, kedalaman 0–30 cm: Sand (g/kg), Silt (g/kg), Clay (g/kg), Bulk Density ($cg/cm^3$), pH ($pH \times 10$), CEC ($mmol(c)/kg$) | Parameter Pedotransfer Saxton-Rawls: $\theta_{FC}, \theta_{PWP}, \theta_{SAT}, AWC$ |
| **Cuaca & Radiasi Surya** | **Open-Meteo Historical & Forecast API** | Koordinat petak (`lat: -8.0843, lon: 111.0636`): Suhu min/max, radiasi matahari ($MJ/m^2/hari$), kelembapan, angin 2m, presipitasi harian (aktual + 16 hari ramalan) | $ET_0$ Penman-Monteith & input presipitasi harian $P(t)$ |
| **Topografi & Kontur Elevasi** | **Copernicus DEM GLO-30 / Open-Elevation API** | Resolusi 30m sepanjang 24 koordinat WGS84 petak Bengkok 1 | Elevasi rata-rata (mdpl), persentase kemiringan (*slope* %), arah limpasan (*flow direction*), dan urutan undakan (*tier order*) |
| **Citra Radar (SAR)** | **Sentinel-1 GRD (via Google Earth Engine / Copernicus)** | Band VV & VH resolusi 10m (penetrasi awan) | Rasio backscatter $\sigma^0_{VH} / \sigma^0_{VV}$ untuk estimasi biomassa basah saat mendung |
| **Citra Optik** | **Sentinel-2 L2A (Harmonized)** | Band B2, B4, B8, B11 resolusi 10m | NDVI, NDWI, SAVI, BSI dengan spectral unmixing (pemangkasan pematang) |

---

## 3. Spesifikasi Algoritma & Mathematical Engines

### 3.1 Module A: Dynamic Planting Window Engine (Khusus Lahan Kosong/Bera)
- **Tujuan:** Menjalankan forward-simulation neraca air harian selama 100–120 hari ke depan untuk setiap tanggal kandidat tanam $T_0$ ($T_0 \in [1..30\text{ hari ke depan}]$).
- **Langkah 1: Pedotransfer Saxton-Rawls (2006) dari SoilGrids:**
  $$\theta_{FC} = -0.000251 S + 0.00195 C + 0.011 S \times C + \dots$$
  $$\theta_{PWP} = -0.000098 S + 0.00392 C + 0.0000015 S^2 + \dots$$
  $$\text{AWC} = \theta_{FC} - \theta_{PWP}$$
  *(Di mana $S = \%\text{sand}, C = \%\text{clay}$ ditarik dari SoilGrids Pacitan).*
- **Langkah 2: Simulasi Neraca Air Harian FAO-56:**
  $$S(t) = \max(0, \min(\theta_{SAT}, S(t-1) + P(t) - ET_c(t) - Runoff(t) - DeepPercolation(t)))$$
  Di mana $ET_c(t) = K_c(t) \times ET_0(t)$, dengan $K_c(t)$ berubah dinamis per fase pertumbuhan tanaman.
- **Langkah 3: Fungsi Penalti Kelayakan Tanam ($S_{T_0}$):**
  $$S_{T_0} = 100 - \sum_{k=1}^{n} (W_k \times \text{StressRisk}_k)$$
  - **Rule Padi (Oryza sativa):**
    - Wajib akumulasi air $\ge 200\text{ mm}$ pada fase pelumpuran/puddling (hari -15 s/d 0). Jika defisit $\rightarrow$ penalti $W = 35$.
    - Jika defisit lengas tanah $> 40\%$ pada fase bunting/heading $\rightarrow$ penalti gabah hampa $W = 50$.
  - **Rule Jagung (Zea mays):**
    - Jika kadar air tanah fase perkecambahan (hari 0–7) $> 85\%$ kapasitas lapang selama 3 hari berturut-turut $\rightarrow$ penalti busuk benih $W = 40$.
    - Jika fase pembungaan/silking (hari 45–60) mengalami defisit air $> 60\%$ $\rightarrow$ penalti tongkol ompong $W = 50$.
- **Output:** Rekomendasi tanggal tanam terbaik $T_0^* = \arg\max(S_{T_0})$ dengan kalender visual skor kesiapan (0–100).

### 3.2 Module B: Cascading Hydrology (Khusus Terasiring Berundak)
- Memodelkan drainase berundak:
  $$Inflow_{tier}(t) = Runoff_{upper\_tier}(t) \times (1 - \text{AbsorptionFactor})$$
- Menghitung kemiringan lereng petak dari DEM:
  $$\text{Slope (\%)} = \frac{\Delta \text{Elevation}}{\text{Horizontal Distance}} \times 100\%$$
- Menghasilkan jadwal pembukaan pintu air bertingkat (*cascading sluice gate schedule*) agar petak undakan bawah tidak tergenang berlebih saat curah hujan tinggi.

### 3.3 Module C: Cloud-Penetrating Vegetation & Soil Index
- **SAR Backscatter Ratio:** Saat tutupan awan Sentinel-2 $> 40\%$, sistem beralih otomatis ke:
  $$Ratio_{SAR} = \frac{\sigma^0_{VH}}{\sigma^0_{VV}}$$
  Mengindikasikan perkembangan volume biomassa kanopi dan genangan air sawah secara tembus awan.
- **Spectral Inward Buffer (Spectral Unmixing):** Memotong poligon petak ke dalam sebesar $2.5\text{ m}$ (inward buffer) sebelum mengekstraksi piksel satelit, membuang kontaminasi pantulan rumput pematang/galengan.

### 3.4 Module D: Terrain-Adaptive Variable Rate Nutrition (VRN) & 3D Drone Mission
- Menghitung defisiensi hara Nitrogen ($N$) berdasarkan anomali NDVI/NDRE terhadap kurva varietas Inpari 32 HDB.
- **Format 1 (Manual Bucket):** Dosis takaran riil per petak dalam kg/karung (misal: *Petak Bengkok 1 (0,37 Ha): 37 kg Urea & 18 kg Phonska Plus*).
- **Format 2 (Drone Mission 3D KML):** Menghasilkan file misi penerbangan drone otomatis (`.kml` / `.mission`) dengan waypoint 3D berkoordinat WGS84 dan ketinggian dinamis relatif terhadap kontur lereng (*terrain-following altitude = 2.5m di atas kanopi*).

---

## 4. Perbaikan Fitur Existing (Zero-Defect Fixes)

### 4.1 Map Engine Rendering Sempurna:
1. **Auto-FitBounds Geodetik:** Begitu peta selesai memuat poligon 24 titik KML Pacitan, peta wajib otomatis memanggil:
   `map.fitBounds(bounds, { padding: { top: 60, bottom: 60, left: 60, right: 500 }, maxZoom: 18, duration: 800 })`.
   Memastikan petak sawah Bengkok 1 langsung tampil besar, tajam, dan fokus (zoom 17–18) di tengah layar.
2. **Mini-Map Terasiring di `/petak/[id]`:** Menyematkan peta interaktif poligon petak 24 koordinat di halaman detail petak lengkap dengan overlay elevasi dan kontur.
3. **Default Satelit & Kontur Aktif:** Citra satelit resolusi tinggi dan batas petak aktif secara langsung saat pertama kali dibuka.

### 4.2 Unit Economics & HOK Parity:
1. **Kondisi Lahan Bera (0 HST):**
   - Menghilangkan log panen 13 hari lagi dan log buruh tandur/penyiangan yang tidak sinkron.
   - Mengubah tampilan kartu ekonomi menjadi **"Rencana Anggaran Modal Kerja Pra-Tanam & Input Musim Baru"**.
   - Menghitung biaya olah tanah (tillage), perbaikan pematang terasiring, dan kebutuhan benih/pupuk dasar sesuai rekomendasi jendela tanam.

---

## 5. Blueprint Ekstensi Database ORM (Modular & Non-Breaking)

Dibuat model baru di `backend/app/models/agronomy.py`:
- `TerrainElevationProfile` (plot_id, mean_elevation, slope_pct, aspect, tier_count)
- `SoilCharacteristics` (plot_id, sand_pct, silt_pct, clay_pct, bulk_density, ph, cec, awc_mm)
- `PlantingWindowSimulation` (plot_id, crop_type, candidate_date, suitability_score, status, penalty_breakdown_json)
- `HydrologyWaterBalance` (plot_id, simulation_date, precipitation_mm, etc_mm, soil_moisture_pct, runoff_inflow_mm, runoff_outflow_mm)
- `NutritionPrescription` (plot_id, crop_type, urea_kg, npk_kg, drone_mission_kml_url)

---

## 6. Kriteria Penerimaan Spesifikasi (Acceptance Criteria)

1. **SoilGrids Live Integration:** Endpoint `/api/v1/agronomy/soil-characteristics/{plot_id}` mengembalikan data tekstur tanah riil dari REST API ISRIC SoilGrids untuk Pacitan.
2. **Dynamic Planting Window:** Endpoint `/api/v1/agronomy/planting-window/simulate` mengembalikan simulasi 120 hari dengan skor kelayakan tanam $S_{T_0} \in [0, 100]$.
3. **Mapbox FitBounds:** Halaman `/peta` dan `/dashboard` otomatis melakukan auto-zoom fokus ke petak Bengkok 1 dengan zoom level $\ge 17$.
4. **Terrain-Following KML:** File rute drone yang diunduh merupakan file KML valid dengan tag `<coordinates>` 3D `[lon, lat, altitude]`.
5. **Zero Error & Parity:** Tidak ada mock data statis yang bertentangan dengan fase bera (0 HST).
