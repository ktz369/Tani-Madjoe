# Tiket Kerja: Systematic Debugging & Feature Audit Sprint (DBG-01 s.d. DBG-10)

Sprint ini dirancang khusus untuk memverifikasi secara mendalam dan memperbaiki setiap potensi bug di seluruh platform `Tani` tanpa ada fitur yang terlewat. Setiap tiket bersifat mandiri, terisolasi (*non-heavy*), dan memiliki kriteria pengujian mutlak (*pass/fail assertion*).

---

## Ringkasan Alur Kerja Tiket

```text
[DBG-01: Schema & Data Invariant] ──► [DBG-02: REST API & Math Engines]
                                                │
       ┌────────────────────────────────────────┴────────────────────────────────────────┐
       ▼                                                                                 ▼
[DBG-03: DuckDB & Spatial Engine]                                             [DBG-04: Operations UI & Modals]
       │                                                                                 │
       ├────────────────────────────────────────┬────────────────────────────────────────┤
       ▼                                        ▼                                        ▼
[DBG-05: Map & GIS Layout]          [DBG-06: Agronomy & Alerts]              [DBG-07: Auth & Admin RBAC]
       │                                        │                                        │
       └────────────────────────────────────────┼────────────────────────────────────────┘
                                                ▼
                                    [DBG-08: Laporan PDF & CSV]
                                                ▼
                                    [DBG-09: Headless Browser E2E]
                                                ▼
                                    [DBG-10: Zero-Defect Gate & Handoff]
```

---

### DBG-01: Backend Models & Data Contract Invariant Verification
- **Domain:** Data Architecture & ORM
- **Target Files:**
  - `backend/app/models/operations.py`
  - `backend/app/models/plot.py`
  - `backend/app/models/__init__.py`
  - `backend/demo_server.py`
- **Scope & Tujuan:**
  - Memverifikasi bahwa seluruh 6 SQLAlchemy model (`PlotLaborLog`, `PlotIrrigationLog`, `SaprotanItem`, `PlotSaprotanApplication`, `PestScoutingReport`, `PostHarvestLog`) memiliki foreign key yang valid ke `Plot`.
  - Memastikan seluruh tipe Enum (`TaskType`, `SaprotanCategory`, `PestSeverity`, `WaterSource`) konsisten antara ORM, serialisasi JSON di `demo_server.py`, dan TypeScript definitions.
  - Memverifikasi data awal petak Pacitan Bengkok 1 ter-seed dengan 24 koordinat asli.
- **Kriteria Penerimaan (Acceptance Criteria):**
  - Script test impor `python -c "from app.models import ..."` berjalan tanpa `ImportError` atau `AttributeError`.
  - Data JSON petak 1 memiliki relasi aktif ke minimal 3 labor log, 2 irrigation log, 2 scouting reports, dan 5 saprotan catalog items.

---

### DBG-02: Backend REST API & Mathematical Engines Audit
- **Domain:** Backend API & Domain Math
- **Target Files:**
  - `backend/demo_server.py`
  - `backend/app/services/et0_calculator.py`
  - `backend/app/services/gdd_service.py`
  - `backend/test_ops_endpoints.py`
- **Scope & Tujuan:**
  - Mengaudit seluruh endpoint operasional: `/labor`, `/irrigation`, `/saprotan`, `/apply-saprotan`, `/scouting`, `/financial-summary`, `/harvest-closing`.
  - Menguji keandalan PHI Guardrail: Request aplikasi pestisida saat $(\text{HarvestDate} - \text{AppDate}) < \text{PHI}$ **wajib** mengembalikan HTTP 400 `PHI_VIOLATION`.
  - Menguji akurasi matematis rumus rafaksi kadar air 14% SNI:
    $$\text{Net} = \text{Gross} \times (1 - \text{Dockage}/100) \times \left(\frac{100 - KA}{86}\right)$$
    Harus menghasilkan selisih $< 0.01\text{ kg}$.
  - Menguji formula $ET_0$ Penman-Monteith dan GDD agar tidak menghasilkan nilai negatif atau `NaN`.
- **Kriteria Penerimaan:**
  - Skrip pengujian otomatis mengeksekusi seluruh 7 endpoint dengan status 200/201 dan 400 untuk pelanggaran PHI.
  - Seluruh assertion matematis lulus tanpa deviasi numerik.

---

### DBG-03: DuckDB-WASM & Spatial Engine Boundary Audit
- **Domain:** Browser WebAssembly & GIS
- **Target Files:**
  - `frontend/src/lib/duckdb-spatial.ts`
  - `frontend/package.json`
- **Scope & Tujuan:**
  - Memastikan inisialisasi `@duckdb/duckdb-wasm` sepenuhnya aman dari SSR (Server-Side Rendering) Next.js.
  - Menguji fungsi `generatePestQuarantineBuffer()` dengan berbagai skenario titik koordinat OPT (single point, multi point, invalid coordinates).
  - Memastikan fallback geodetik circle ($R=50\text{ m}$) aktif otomatis jika WebWorker atau WASM tidak tersedia/gagal dimuat.
- **Kriteria Penerimaan:**
  - Fungsi menghasilkan valid GeoJSON `FeatureCollection` Poligon.
  - Zero runtime exception saat dijalankan di lingkungan SSR maupun browser.

---

### DBG-04: Precision Operations UI Modals & State Flow Audit
- **Domain:** Frontend UI / Operations
- **Target Files:**
  - `frontend/src/components/plot/SaprotanApplicationModal.tsx`
  - `frontend/src/components/plot/PestScoutingModal.tsx`
  - `frontend/src/components/plot/PlotLaborIrrigationPanel.tsx`
  - `frontend/src/components/plot/PlotUnitEconomicsCard.tsx`
  - `frontend/src/components/plot/PostHarvestModal.tsx`
  - `frontend/src/app/petak/[id]/page.tsx`
- **Scope & Tujuan:**
  - Memverifikasi form interaktif di masing-masing modal:
    - PHI Modal: Saat tanggal panen dekat dipilih, tombol submit terkunci otomatis (`disabled`) dan peringatan merah menyala.
    - Scouting Modal: Tombol "Ambil GPS Saat Ini" mengisi lat/lon dengan presisi, dan deteksi keparahan `HIGH`/`EMERGENCY` memicu notifikasi karantina 50m.
    - Post-Harvest Modal: Input kadar air dan dockage memperbarui bobot bersih standar 14%, total omset, dan ROI secara real-time.
  - Memastikan submit sukses memicu re-fetch data di parent page tanpa reload layar.
- **Kriteria Penerimaan:**
  - Semua 4 modal dapat dibuka, diisi, divalidasi, dan ditutup dengan mulus.
  - Data yang diinput langsung terefleksi pada tabel atau kartu telemetri petak.

---

### DBG-05: Interactive Map & Full-Bleed GIS Layout Audit
- **Domain:** Frontend GIS & Mapbox GL JS
- **Target Files:**
  - `frontend/src/app/peta/page.tsx`
  - `frontend/src/app/dashboard/page.tsx`
  - `frontend/src/lib/mapStyles.ts`
- **Scope & Tujuan:**
  - Mengaudit sinkronisasi layer Mapbox GL JS dengan Esri World Imagery.
  - Memastikan poligon petak Pacitan Bengkok 1 hanya ditambahkan saat event `idle` (`map.once('idle')`) untuk mencegah error `Style is not done loading`.
  - Menguji render layer karantina OPT 50m DuckDB-WASM di `/peta` saat laporan scouting berstatus bahaya.
  - Memverifikasi layout full-bleed viewport lock (`h-screen overflow-hidden pt-[68px]`).
- **Kriteria Penerimaan:**
  - Peta memuat citra satelit dan poligon petak tanpa flickering.
  - Tidak ada pesan error Mapbox di console browser.

---

### DBG-06: Agronomy, Phenology & Alert Engine UI Audit
- **Domain:** Frontend Agronomy & Alerts
- **Target Files:**
  - `frontend/src/components/plot/PhenologyTimeline.tsx`
  - `frontend/src/components/alerts/AlertPanel.tsx`
  - `frontend/src/components/alerts/AlertCard.tsx`
  - `frontend/src/components/plot/PlotActiveAlerts.tsx`
- **Scope & Tujuan:**
  - Memverifikasi pemetaan GDD aktual terhadap 7 fase fenologi padi pada timeline.
  - Menguji drawer notifikasi (`AlertPanel.tsx`): toggle buka/tutup, pencarian teks, dan filter chip keparahan (`CRITICAL`, `WARNING`, `INFO`).
  - Memastikan badge unread pada icon lonceng di Navbar berkurang/sinkron saat peringatan ditandai selesai.
- **Kriteria Penerimaan:**
  - Phenology timeline menampilkan tahapan aktif dengan benar.
  - Alert drawer bergeser mulus (*smooth transition*) dengan border hairline dan tipografi Aspekta.

---

### DBG-07: Authentication, RBAC & Admin Flow Audit
- **Domain:** Frontend Auth & Admin
- **Target Files:**
  - `frontend/src/app/login/page.tsx`
  - `frontend/src/app/admin/petak-baru/page.tsx`
  - `frontend/src/app/admin/organisasi/page.tsx`
  - `frontend/src/app/admin/varietas/page.tsx`
  - `frontend/src/components/layout/Navbar.tsx`
- **Scope & Tujuan:**
  - Menguji login formulir, validasi input kredensial, dan penyimpanan JWT token.
  - Memastikan dropdown popover Admin pada floating pill navbar melayang bebas di bawah pill dan dapat diklik menuju ketiga halaman admin.
  - Menguji halaman pendaftaran petak baru (`/admin/petak-baru`) dengan upload dropzone file KML/GeoJSON.
- **Kriteria Penerimaan:**
  - Alur login dan navigasi admin berfungsi tanpa mental ke rute login.
  - Dropdown admin tidak terjepit atau terpotong container navbar.

---

### DBG-08: Report Generation & Export Audit (PDF & CSV)
- **Domain:** Pelaporan & Ekspor Data
- **Target Files:**
  - `backend/app/services/report_service.py`
  - `backend/demo_server.py`
  - `frontend/src/app/laporan/page.tsx`
- **Scope & Tujuan:**
  - Menguji endpoint download laporan PDF `/api/v1/reports/pdf` berbasis ReportLab.
  - Menguji download ekspor CSV `/api/v1/reports/csv` untuk ringkasan telemetri petak dan log biaya operasional.
  - Memverifikasi filter rentang tanggal pada antarmuka `/laporan`.
- **Kriteria Penerimaan:**
  - File PDF terunduh lengkap dengan header, ringkasan NDVI/GDD, dan tabel tanpa corrupt.
  - File CSV terunduh dengan baris data yang valid dan angka tabular rapi.

---

### DBG-09: Comprehensive Headless Browser CDP E2E Automation Suite
- **Domain:** E2E Automated Testing (Puppeteer / CDP)
- **Target Files:**
  - `.scratch/audit_e2e_all_features.js` (skrip eksekutor)
- **Scope & Tujuan:**
  - Menjalankan robot browser otomatis mengunjungi seluruh 8 rute sistem (`/`, `/dashboard`, `/peta`, `/petak/1`, `/admin/petak-baru`, `/admin/organisasi`, `/admin/varietas`, `/laporan`).
  - Menangkap seluruh log browser (`console.log`, `console.warn`, `console.error`).
  - Mengklik tombol aksi operasional (Buka modal PHI, modal panen, input form) dan menangkap screenshot bukti eksekusi.
- **Kriteria Penerimaan:**
  - Seluruh 8 rute merespon HTTP 200.
  - Jumlah `console.error` di seluruh rute adalah **TEPAT 0 (NOL)**.
  - Screenshot tersimpan sebagai bukti visual tanpa artefak visual / layout broken.

---

### DBG-10: Zero-Defect Gate, Typecheck & Handoff Sign-Off
- **Domain:** Quality Assurance & Gate Sign-off
- **Target Files:**
  - `frontend/package.json`
  - `handoff/HANDOFF.md`
- **Scope & Tujuan:**
  - Menjalankan `npx.cmd tsc --noEmit` di direktori frontend.
  - Menjalankan `npm.cmd run build` untuk memverifikasi kesiapan bundle produksi (11/11 halaman).
  - Menyusun laporan audit komprehensif di `handoff/HANDOFF.md` yang merangkum seluruh hasil verifikasi.
- **Kriteria Penerimaan:**
  - TypeScript typecheck exit code 0 (0 error).
  - Next.js build exit code 0 (11/11 static/dynamic pages compiled).
  - Seluruh dokumen serah terima terbarui secara akurat.
