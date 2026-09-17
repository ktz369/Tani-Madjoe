# Spesifikasi Tiket Kerja: Systematic Debugging Seluruh Fitur (SYS-01 s.d. SYS-14)

**Sprint:** Systematic Debugging Seluruh Fitur Platform & WebGL Map Engine  
**Status:** ✅ COMPLETED — All 14 tickets resolved (SYS-01 through SYS-14)  
**Tanggal Selesai:** 2026-09-11  
**Dokumen Induk:** [`docs/tickets-systematic-debugging-all-features.md`](file:///D:/PEREWANGAN%20369/Tani/docs/tickets-systematic-debugging-all-features.md)  
**Prinsip Kerja:** *The Iron Law of Systematic Debugging: No fixes without root cause investigation first. Slices are vertical, isolated, and lightweight.*

---

## 🗺️ Visualisasi Alur Eksekusi & Dependency Graph

```text
               [SYS-01: Diagnostic Script]
                │                       │
                ▼                       ▼
    [SYS-02: Core Plot Cleanse]   [SYS-05: Map Engine Base]
         │            │                  │       │       │
         ▼            ▼                  ▼       ▼       ▼
    [SYS-03: Agro] [SYS-04: Ops]   [SYS-06] [SYS-07] [SYS-08]
         │   │        │     │       (/peta) (MiniMap)(Dash/Admin)
         │   │        │     │          │       │         │
         ▼   │        │     ▼          │       ▼         ▼
     [SYS-10]│        │   [SYS-13]     │    [SYS-11]  [SYS-09]
      (Studio)▼        ▼   (Reports)    │  (Hub Tab 1&2)(Dashboard)
          [SYS-11]  [SYS-12]           │       │         │
        (Hub Tab 1) (Hub Tab 3&4)      │       │         │
              │         │              │       │         │
              └─────────┴──────────────┼───────┴─────────┘
                                       ▼
                     [SYS-14: E2E Quality Gate]
```

---

## 📋 Daftar Rincian Tiket & Kriteria Penerimaan

### SYS-01: Automated Diagnostic & Mock-Leak Detection Suite
- **Blocked by:** None (Dapat langsung dikerjakan)
- **Target Files:** `backend/test_systematic_feature_audit.py`
- **What to build:** Script otomasi uji diagnostik menyeluruh yang memindai seluruh 12 route & sub-endpoint backend, memvalidasi HTTP 200, skema JSON, dan assert *Zero Mock Leak* (bebas dari residu koordinat/nama fiktif atau fallback angka statis).
- **Acceptance Criteria:**
  - [x] Script `test_systematic_feature_audit.py` dibuat dan dapat dijalankan via Python 3.11.
  - [x] Menguji endpoint: `/health`, `/estates`, `/plots`, `/weather/current`, `/weather/forecast`, `/alerts`, `/agronomy/soil-characteristics/1`, `/agronomy/planting-window/simulate`, `/agronomy/plots/1/water-balance`, `/agronomy/plots/1/vrn`, `/operations/*`, `/reports/*`.
  - [x] Memberikan output log diagnostik per endpoint secara jelas.

---

### SYS-02: Cleanse Core Plot & Estate Telemetry Data Layer
- **Blocked by:** `SYS-01`
- **Target Files:** `backend/demo_server.py`
- **What to build:** Pembersihan in-memory data store `PLOTS`, `ESTATES`, dan `DIVISIONS` di `demo_server.py`. Memastikan petak terikat 100% pada poligon KML Pacitan Bengkok 1 (24 koordinat), telemetri Google Earth Engine asli (`real_gee_telemetry.json`), serta mendefinisikan fase bera (0 HST) secara konsisten.
- **Acceptance Criteria:**
  - [ ] Seluruh endpoint petak mengembalikan koordinat `BENGKOK_COORDINATES` asli dan luas 0.37 Ha.
  - [ ] Status petak 1 konsisten sebagai "Bera / Belum Ditanami" (0 HST).
  - [ ] Tidak ada entitas petak/kebun dummy residu.

---

### SYS-03: Cleanse Digital Agronomy & Weather Model Services
- **Blocked by:** `SYS-02`
- **Target Files:** `backend/demo_server.py`, `backend/app/services/*`
- **What to build:** Pembersihan layanan analitik agronomi di backend. Menghapus fallback statis (seperti skor kesiapan tanam default `85` atau tanggal tetap). Seluruh kalkulasi (SoilGrids, Penman-Monteith ET0, GDD, VRN Phonska/Urea) bersumber dari parameter agronomi riil dan cuaca dinamis.
- **Acceptance Criteria:**
  - [ ] Endpoint `/api/v1/agronomy/planting-window/simulate` mengembalikan skor dinamis hasil forward simulation.
  - [ ] Endpoint `/api/v1/agronomy/soil-characteristics/1` mengembalikan tekstur lempung berdebu (Silty Clay Loam) asli Pacitan.
  - [ ] Endpoint `/api/v1/agronomy/plots/1/vrn` menghitung kebutuhan hara N-P-K spesifik petak.

---

### SYS-04: Cleanse Operations & Financial Engine Data Layer
- **Blocked by:** `SYS-02`
- **Target Files:** `backend/demo_server.py`
- **What to build:** Pembersihan ledger data operasional (HOK, Irigasi, Aplikasi Saprotan, Scouting OPT) dan kalkulasi keuangan adaptif di backend. Memastikan PHI guardrail bekerja dan perhitungan penyesuaian mutu panen rafaksi SNI 14% KA akurat.
- **Acceptance Criteria:**
  - [ ] Endpoint `/api/plots/1/operations/financial-summary` menghasilkan angka modal kerja riil tanpa estimasi fiktif.
  - [ ] Endpoint post-harvest menghitung rafaksi SNI 14% KA dengan deviasi < 0.01 kg.
  - [ ] Alert pest anomaly sinkron dengan data scouting OPT lapang.

---

### SYS-05: Robust Mapbox GL & Open-Raster Base Engine
- **Blocked by:** `SYS-01`
- **Target Files:** `frontend/src/lib/mapStyles.ts`
- **What to build:** Penguatan engine peta dasar `mapStyles.ts` untuk menangani Mapbox GL v3 tanpa commercial key, kestabilan fallback open raster (Esri World Imagery & OpenStreetMap), serta helper siklus hidup peta untuk mempertahankan layer GeoJSON saat style re-load.
- **Acceptance Criteria:**
  - [ ] Tidak terjadi crash atau clear canvas saat Mapbox access token kosong.
  - [ ] Switch style antara citra satelit dan jalan/topografi berjalan mulus.
  - [ ] Helper sinkronisasi layer GeoJSON tersedia untuk komponen peta.

---

### SYS-06: Interactive Map (`/peta`) Canvas & DuckDB Quarantine Rendering
- **Blocked by:** `SYS-02`, `SYS-05`
- **Target Files:** `frontend/src/app/peta/page.tsx`
- **What to build:** Debugging halaman `/peta` agar render peta interaktif 100% utuh tanpa tile terpotong, canvas auto-resize saat panel samping dibuka/tutup, slider temporal NDVI bekerja mulus, dan buffer karantina DuckDB-WASM 50m terender presisi.
- **Acceptance Criteria:**
  - [ ] Kanvas Mapbox GL me-resize sempurna saat toggle sidebar (`map.resize()`).
  - [ ] Poligon petak dan popup informasi menampilkan data riil (0.37 Ha, bera, koordinat Pacitan).
  - [ ] Slider waktu dan overlay karantina hama OPT tidak memicu console error.

---

### SYS-07: Terrace Mini-Map Auto-Resize & Fullscreen Modal
- **Blocked by:** `SYS-02`, `SYS-05`
- **Target Files:** `frontend/src/components/plot/PlotTerraceMiniMap.tsx`
- **What to build:** Perbaikan komponen `PlotTerraceMiniMap.tsx` di persistent header petak. Menjamin render kanvas mini (140px) tidak blank saat navigasi antar-tab (?tab=...), dan saat tombol "Perbesar" ditekan, modal fullscreen menampilkan peta interaktif lengkap dengan pematang terasiring.
- **Acceptance Criteria:**
  - [ ] Kanvas mini 140px selalu terender sempurna saat berganti tab URL tanpa reload page.
  - [ ] Modal fullscreen membuka peta dengan auto-fit bounds ke koordinat terasiring Bengkok 1.
  - [ ] Beralih mode satelit/peta jalan di dalam modal berjalan mulus.

---

### SYS-08: Dashboard Map & Admin Polygon Digitization Canvas
- **Blocked by:** `SYS-02`, `SYS-05`
- **Target Files:** `frontend/src/app/dashboard/page.tsx`, `frontend/src/app/admin/petak-baru/page.tsx`
- **What to build:** Peta ikhtisar pada `/dashboard` dan peta digitasi KML pada `/admin/petak-baru` me-render poligon dengan bounding box yang pas (`fitBounds`), serta mendukung preview batch KML tanpa glitch.
- **Acceptance Criteria:**
  - [ ] Peta dashboard memusatkan viewport secara otomatis pada sebaran petak perkebunan.
  - [ ] Peta admin petak baru me-render garis digitasi dan poligon batch import KML secara akurat.
  - [ ] Tidak ada leak memory saat unmount kanvas peta.

---

### SYS-09: Dashboard Feature End-to-End Debugging
- **Blocked by:** `SYS-03`, `SYS-08`
- **Target Files:** `frontend/src/app/dashboard/page.tsx`
- **What to build:** Debugging fungsionalitas penuh Dashboard Utama: sinkronisasi kartu KPI dengan data riil, grafik telemetri cuaca 16-hari Open-Meteo, tabel filter & sort petak, dan tombol navigasi ke petak.
- **Acceptance Criteria:**
  - [ ] Seluruh kartu metrik KPI menampilkan agregasi riil dari backend.
  - [ ] Grafik cuaca Open-Meteo menampilkan data suhu, kelembaban, dan radiasi riil.
  - [ ] Filter komoditas dan pencarian petak responsif dan akurat.

---

### SYS-10: Agronomy Studio Feature End-to-End Debugging
- **Blocked by:** `SYS-03`
- **Target Files:** `frontend/src/app/agronomi/page.tsx`
- **What to build:** Debugging halaman `/agronomi` agar bebas dari data mock: Matriks Kesiapan Tanam membaca skor riil forward simulation, timeline jendela tanam 25-hari presisi, kartu agregasi pupuk VRN (Urea & NPK) terhitung akurat, dan tabel karakteristik tanah menampilkan profil SoilGrids riil.
- **Acceptance Criteria:**
  - [ ] Matriks kesiapan tanam menampilkan skor kalkulasi asli (bukan fallback 85).
  - [ ] Bar visual jendela tanam forward simulation merefleksikan tanggal $T_0^*$ optimal.
  - [ ] Agregasi kebutuhan pupuk terhitung sesuai luasan petak aktif dan preskripsi VRN.

---

### SYS-11: Petak Hub Tab Ikhtisar & Tab Agronomi Debugging
- **Blocked by:** `SYS-03`, `SYS-07`
- **Target Files:** `frontend/src/components/plot/tabs/TabIkhtisar.tsx`, `frontend/src/components/plot/tabs/TabAgronomi.tsx`
- **What to build:** Debugging Tab Ikhtisar dan Tab Agronomi pada Detail Petak. Memastikan kurva spektral membaca telemetri Sentinel-2 riil, model GDD & ETc FAO-56 beradaptasi pada fase bera, dan 5 sub-tab agronomi memuat data tanpa dummy fallback.
- **Acceptance Criteria:**
  - [ ] Kurva NDVI, NDRE, NDWI, SAVI, BSI menampilkan titik observasi riil GEE.
  - [ ] Status bera terrefleksikan pada indikator fenologi dan kebutuhan air.
  - [ ] Ekspor KML misi drone menghasilkan koordinat waypoint penerbangan asli.

---

### SYS-12: Petak Hub Tab Operasional & Tab Keuangan Debugging
- **Blocked by:** `SYS-04`
- **Target Files:** `frontend/src/components/plot/tabs/TabOperasional.tsx`, `frontend/src/components/plot/tabs/TabKeuangan.tsx`
- **What to build:** Debugging Tab Operasional dan Tab Keuangan pada Detail Petak. Menampilkan ledger HOK dan log irigasi riil. Tab Keuangan menampilkan modal kerja pra-tanam secara adaptif untuk fase bera tanpa data rugi/laba tiruan.
- **Acceptance Criteria:**
  - [ ] HOK ledger dan log irigasi terhitung dan tersimpan dengan benar.
  - [ ] Tab Keuangan menampilkan breakdown modal kerja fase bera petak Bengkok 1.
  - [ ] Riwayat musim tanam menampilkan musim panen sebelumnya secara valid.

---

### SYS-13: Reports & Admin Modules End-to-End Debugging
- **Blocked by:** `SYS-04`, `SYS-08`
- **Target Files:** `frontend/src/app/laporan/page.tsx`, `frontend/src/app/admin/organisasi/page.tsx`, `frontend/src/app/admin/varietas/page.tsx`
- **What to build:** Debugging Pusat Laporan (ekspor PDF ReportLab riil dan CSV historis) serta modul Admin (Organisasi, Varietas, dan Petak Baru) agar seluruh operasi CRUD berjalan mulus tanpa placeholder fiktif.
- **Acceptance Criteria:**
  - [ ] Unduhan PDF Kesehatan, Prediksi Panen, dan Neraca Air menghasilkan dokumen valid.
  - [ ] Ekspor CSV memuat data deret waktu telemetri riil.
  - [ ] Modul Admin Organisasi dan Varietas dapat menambah/mengedit data tanpa error 500.

---

### SYS-14: Comprehensive Verification & Zero-Defect Quality Gate
- **Blocked by:** `SYS-06`, `SYS-09`, `SYS-10`, `SYS-11`, `SYS-12`, `SYS-13`
- **Target Files:** Seluruh proyek + `handoff/HANDOFF.md`
- **What to build:** Eksekusi verifikasi total platform: `test_systematic_feature_audit.py` lolos 100%, `npx tsc --noEmit` lolos 0 errors, Next.js build lolos 12/12 routes, audit 0 console error di browser, serta pembaruan dokumen handoff akhir.
- **Acceptance Criteria:**
  - [ ] Script backend audit 100% PASS (0 failures).
  - [ ] `npx tsc --noEmit` menghasilkan exit code 0.
  - [ ] `npm run build` menghasilkan 12/12 routes statis/dinamis valid.
  - [ ] `handoff/HANDOFF.md` mencatat seluruh hasil implementasi dan status sistem terkini.
