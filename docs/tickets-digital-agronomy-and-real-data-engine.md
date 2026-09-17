# Tiket Kerja: Digital Agronomy Engine & Real Data Integration (DAG-01 s.d. DAG-08)

Sprint ini dirancang untuk menyelesaikan seluruh ketidaksesuaian data riil (Peta belum ter-zoom presisi, kontradiksi HOK/Unit Economics di lahan bera) dan mengimplementasikan seluruh modul **Digital Agronomy Engine (Padi & Jagung Terasiring)** sesuai brief `new3.md`.

---

## Ringkasan Alur Kerja Tiket

```text
[DAG-01: Map FitBounds & Mini-Map] ──► [DAG-02: Unit Economics & HOK Parity]
                                                │
       ┌────────────────────────────────────────┴────────────────────────────────────────┐
       ▼                                                                                 ▼
[DAG-03: SoilGrids & DEM Connectors]                                    [DAG-04: Module A - Planting Window Engine]
       │                                                                                 │
       ├────────────────────────────────────────┬────────────────────────────────────────┤
       ▼                                        ▼                                        ▼
[DAG-05: Module B - Cascading Hydrology] [DAG-06: Module C - SAR & Unmix] [DAG-07: Module D - VRN & 3D Drone KML]
       │                                        │                                        │
       └────────────────────────────────────────┼────────────────────────────────────────┘
                                                ▼
                         [DAG-08: API, UI Tab & Full Gate Verification]
```

---

### DAG-01: Mapbox Auto-FitBounds & High-Res Terraced Visuals
- **Domain:** Frontend GIS & Mapbox GL JS
- **Target Files:**
  - `frontend/src/app/peta/page.tsx`
  - `frontend/src/app/dashboard/page.tsx`
  - `frontend/src/app/petak/[id]/page.tsx`
- **Scope & Tujuan:**
  - Menambahkan pemanggilan `map.fitBounds(bounds, { padding: 80, maxZoom: 18, duration: 800 })` menggunakan 24 koordinat WGS84 Bengkok 1 asli begitu peta selesai memuat poligon.
  - Memastikan petak sawah Bengkok 1 berukuran 0,37 Ha tidak lagi tampil kecil di zoom 14, melainkan langsung ter-zoom tajam (zoom 17–18) memenuhi bidang pandang.
  - Menyematkan Mini-Map Terasiring interaktif di halaman detail petak (`/petak/[id]`).
- **Kriteria Penerimaan (Acceptance Criteria):**
  - Peta di `/peta` dan `/dashboard` secara otomatis melakukan auto-zoom ke petak Bengkok 1 tanpa perlu digeser manual.
  - Halaman `/petak/1` menampilkan poligon petak dengan citra satelit resolusi tinggi.

---

### DAG-02: Real Condition Unit Economics & Pre-Planting HOK Realignment
- **Domain:** Agronomi Operasional & Unit Economics
- **Target Files:**
  - `backend/demo_server.py`
  - `frontend/src/components/plot/PlotLaborIrrigationPanel.tsx`
  - `frontend/src/components/plot/PlotUnitEconomicsCard.tsx`
- **Scope & Tujuan:**
  - Menghapus anomali data generatif pada petak berstatus **Bera (0 HST)** (menghapus log panen 13 hari lagi dan log tandur/penyiangan palsu).
  - Menyelaraskan log tenaga kerja ke aktivitas pra-tanam riil: Pengolahan Tanah I & II (Tillage), Perbaikan Pematang Terasiring, dan Pelumpuran (Puddling).
  - Menyesuaikan kartu Unit Economics menjadi **"Rencana Anggaran Modal Kerja Pra-Tanam & Input Musim Baru"** saat lahan berstatus bera, mencakup alokasi modal benih, pupuk dasar, dan biaya olah tanah.
- **Kriteria Penerimaan:**
  - Tidak ada data kontradiktif (panen 13 hari lagi / penyiangan di lahan 0 HST).
  - Tampilan ekonomi merefleksikan kebutuhan modal kerja riil fase persiapan lahan.

---

### DAG-03: Real External Data Connector Layer (ISRIC SoilGrids & DEM)
- **Domain:** Data Ingestion (Hardware-Free Cloud APIs)
- **Target Files:**
  - `backend/app/services/soilgrids_service.py`
  - `backend/app/services/elevation_service.py`
  - `backend/demo_server.py`
- **Scope & Tujuan:**
  - Membangun konektor ke **ISRIC SoilGrids REST API** untuk mengambil persentase pasir (*sand*), debu (*silt*), liat (*clay*), bulk density, dan pH tanah petak Pacitan (`lat: -8.0843, lon: 111.0636`).
  - Membangun konektor ke **Open-Elevation / Copernicus DEM 30m** untuk membaca elevasi rata-rata dan kemiringan lereng (*slope* %).
  - Menyediakan caching layer in-memory untuk mencegah limit kuota API.
- **Kriteria Penerimaan:**
  - Endpoint mengembalikan parameter tanah dan elevasi riil dari Pacitan tanpa angka buatan (*zero mockup*).

---

### DAG-04: Module A - Dynamic Planting Window Engine (Saxton-Rawls & FAO-56)
- **Domain:** Algoritma Neraca Air & Prediksi Tanam
- **Target Files:**
  - `backend/app/services/planting_window_service.py`
  - `backend/demo_server.py`
- **Scope & Tujuan:**
  - Mengimplementasikan rumus pedotransfer **Saxton-Rawls (2006)** untuk menghitung $\theta_{FC}, \theta_{PWP}, \theta_{SAT}$, dan Available Water Capacity (AWC).
  - Menjalankan forward-simulation 100–120 hari neraca air harian FAO-56 ($S(t) = S(t-1) + P(t) - ET_c - Runoff - Percolation$).
  - Menerapkan fungsi skor kelayakan tanam ($S_{T_0} \in [0, 100]$) dengan penalti khusus Padi (wajib lumpur 200mm) dan Jagung (penalti busuk benih & tongkol ompong).
- **Kriteria Penerimaan:**
  - Menghasilkan rekomendasi tanggal $T_0^*$ terbaik dalam 30 hari ke depan dengan kurva neraca air harian yang valid (kadar air tidak negatif dan tidak melebihi saturasi).

---

### DAG-05: Module B - Cascading Hydrology for Terraced Land
- **Domain:** Pemodelan Hidrologi Terasiring
- **Target Files:**
  - `backend/app/services/hydrology_service.py`
  - `backend/demo_server.py`
- **Scope & Tujuan:**
  - Memodelkan aliran limpasan berundak: limpasan (*runoff*) kedok atas menjadi aliran masuk (*inflow*) untuk kedok di bawahnya.
  - Menghitung jadwal buka-tutup pintu air (*cascading sluice gate schedule*) untuk mencegah genangan berlebih di undakan bawah saat hujan lebat.
- **Kriteria Penerimaan:**
  - Neraca air memperhitungkan aliran limpasan berjenjang sesuai kemiringan lereng (*slope*) terasiring.

---

### DAG-06: Module C - Cloud-Penetrating Sentinel-1 SAR & Spectral Unmixing
- **Domain:** Penginderaan Jauh (Radar SAR & Optik)
- **Target Files:**
  - `backend/app/services/sar_service.py`
  - `frontend/src/lib/spectralUnmixing.ts`
- **Scope & Tujuan:**
  - Mengkalkulasi rasio backscatter radar Sentinel-1 ($\sigma^0_{VH} / \sigma^0_{VV}$) untuk estimasi biomassa basah saat citra Sentinel-2 tertutup awan mendung.
  - Mengimplementasikan algoritma pemangkasan poligon ke dalam (*inward buffer 2.5m*) untuk membuang kontaminasi pantulan rumput pematang.
- **Kriteria Penerimaan:**
  - Nilai biomassa tetap terestimasi saat awan 100% tanpa melempar error 500.

---

### DAG-07: Module D - Terrain-Adaptive VRN & 3D Drone Mission KML
- **Domain:** Preskripsi Nutrisi & Pemetaan Drone
- **Target Files:**
  - `backend/app/services/vrn_service.py`
  - `backend/app/utils/drone_kml_generator.py`
- **Scope & Tujuan:**
  - Menghitung dosis pupuk Urea dan NPK per petak dalam format *Manual Bucket* (kg dan jumlah karung).
  - Menghasilkan file misi penerbangan drone semprot 3D format standar KML (`.kml`) dengan elevasi dinamis mengikuti kontur lereng (*terrain-following*).
- **Kriteria Penerimaan:**
  - File KML yang diunduh dapat dibuka di Google Earth / software pilot drone dengan waypoint koordinat 3D yang valid.

---

### DAG-08: REST API Endpoints, Frontend UI Tab & Full Gate Verification
- **Domain:** Full-Stack Integration & QA Gate
- **Target Files:**
  - `backend/demo_server.py` & `backend/app/main.py`
  - `frontend/src/components/plot/DigitalAgronomyPanel.tsx`
  - `frontend/src/app/petak/[id]/page.tsx`
  - `handoff/HANDOFF.md`
- **Scope & Tujuan:**
  - Membuka endpoint:
    - `GET /api/v1/agronomy/soil-characteristics/{plot_id}`
    - `POST /api/v1/agronomy/planting-window/simulate`
    - `GET /api/v1/agronomy/plots/{plot_id}/water-balance`
    - `GET /api/v1/agronomy/plots/{plot_id}/drone-mission.kml`
  - Menambahkan panel **"Digital Agronomy & Rekomendasi Tanam"** di halaman detail petak (`/petak/1`).
  - Menjalankan pengujian `npx tsc --noEmit` dan `npm run build` serta verifikasi headless Chrome (0 console errors).
- **Kriteria Penerimaan:**
  - Seluruh endpoint merespon 200 OK.
  - Kompilasi build lulus 100% (exit code 0).
