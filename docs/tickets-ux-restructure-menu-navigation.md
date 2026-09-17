# Sprint Tickets: Restrukturisasi UX & Navigasi (Deep-Linked Tabbed Hub)

Dokumen ini berisi daftar tiket kerja (work tickets) untuk memecah halaman `/petak/[id]/page.tsx` yang sangat panjang menjadi antarmuka *Deep-Linked Tabbed Hub*, serta menambahkan menu dan halaman Agronomi baru pada platform TANDUR. Setiap tiket dirancang spesifik dan memiliki cakupan yang kecil agar pekerja (worker) dapat fokus dan akurat dalam eksekusinya.

## Dependency Graph (Urutan Pengerjaan)

```text
       [NAV-08]
          |
       [NAV-09]
      /   |    \
[NAV-10][NAV-11][NAV-12]

                          [NAV-01]
                ______________|______________
               /     /      |       \        \
       [NAV-02] [NAV-03] [NAV-04] [NAV-05] [NAV-06] [NAV-07]
               \_____\______|_______/________/       /
                            |
                         [NAV-13]
                            |
                         [NAV-14] (bergantung pada semua tiket di atas)
```

## Daftar Tiket

### NAV-01: Scaffold Tab Router & Persistent Anchor Header di `/petak/[id]`
- **Domain:** Frontend Architecture & Routing
- **Target Files:**
  - `frontend/src/app/petak/[id]/page.tsx` (refactor — extract Persistent Header + tab routing logic)
- **Scope & Tujuan:**
  - Refactor `page.tsx` menjadi: (1) Persistent Anchor Header (Nama Petak, Status, Breadcrumb, Badge KPI), (2) Segmented Tab Bar dengan 4 tab, (3) Conditional render berdasarkan `useSearchParams().get('tab')`.
  - Atur default tab = `ikhtisar` jika parameter `?tab` tidak ada atau tidak dikenali.
  - Implementasikan tab switch melalui `router.push('/petak/${id}?tab=${tabName}', { scroll: false })` agar berjalan client-side tanpa hard navigation.
  - **TIDAK** memindahkan konten ke tab files di tiket ini — tiket ini murni untuk scaffold routing dan persistent header.
- **Kriteria Penerimaan:**
  - Terdapat 4 tombol tab yang dapat dirender; klik tab akan mengubah URL `?tab=` dan menampilkan placeholder konten per tab.
  - Persistent Header selalu terlihat terlepas dari tab apa yang aktif.
  - `npx tsc --noEmit` menghasilkan exit 0.

### NAV-02: Compact Mini-Map Header + Fullscreen Expand Modal
- **Domain:** Frontend GIS & Layout
- **Target Files:**
  - `frontend/src/components/plot/PlotTerraceMiniMap.tsx` (modify — add compact mode)
  - `frontend/src/app/petak/[id]/page.tsx` (integrate compact mini-map into header)
- **Scope & Tujuan:**
  - Modifikasi `PlotTerraceMiniMap` untuk menerima prop `compact`. Jika `compact=true`: tinggi peta menjadi 120-160px, tanpa toolbar, dan kontrol disederhanakan.
  - Tambahkan tombol 'Perbesar Peta' yang akan membuka modal/drawer fullscreen untuk menampilkan peta ukuran penuh.
  - Tempatkan compact mini-map di dalam Persistent Header bersebelahan dengan badge KPI.
  - Untuk mobile (<768px): Mini-Map otomatis di-collapse menjadi badge lokasi kecil (ikon + nama petak), dan jika di-tap akan mengekspansi peta.
- **Kriteria Penerimaan:**
  - Mini-Map berhasil dirender dengan tinggi 120-160px di dalam header pada versi desktop.
  - Tombol 'Perbesar' sukses membuka modal peta fullscreen.
  - Pada perangkat mobile, peta berbentuk badge dan jika ditekan akan membuka peta.
  - `npx tsc --noEmit` menghasilkan exit 0.

### NAV-03: Extract Tab Ikhtisar Component
- **Domain:** Frontend Component Extraction
- **Target Files:**
  - `frontend/src/components/plot/tabs/TabIkhtisar.tsx` (NEW)
  - `frontend/src/app/petak/[id]/page.tsx` (move sections out)
- **Scope & Tujuan:**
  - Ekstrak komponen dari `page.tsx` ke `TabIkhtisar.tsx` yang baru: Phenology Timeline, panel prediksi GDD/ETc (prediksi panen & kebutuhan air), Banner Siklus Musim, Spectral Charts (PlotIndicesChart), dan Satellite Panel (PlotSatellitePanel).
  - Teruskan (pass) props yang dibutuhkan (plot, plotDetail, activeSeason, dll).
  - Hubungkan ke dalam tab router yang dibuat di NAV-01.
- **Kriteria Penerimaan:**
  - Tab Ikhtisar merender bagian-bagian tersebut sama persis dengan layout saat ini.
  - Tidak ada kemunduran visual (visual regression).
  - `npx tsc --noEmit` menghasilkan exit 0.

### NAV-04: Extract Tab Agronomi Component
- **Domain:** Frontend Component Extraction
- **Target Files:**
  - `frontend/src/components/plot/tabs/TabAgronomi.tsx` (NEW)
  - `frontend/src/app/petak/[id]/page.tsx` (move section out)
- **Scope & Tujuan:**
  - Ekstrak penggunaan `DigitalAgronomyPanel` dari `page.tsx` ke dalam `TabAgronomi.tsx`.
  - Pass props: plotId, plotName, areaHectares, cropType, currentHst.
  - Biarkan 5 sub-tab internal yang ada di dalam `DigitalAgronomyPanel` tidak berubah.
- **Kriteria Penerimaan:**
  - Tab Agronomi sukses merender `DigitalAgronomyPanel` persis seperti sebelumnya.
  - Tidak ada visual regression.
  - `npx tsc --noEmit` menghasilkan exit 0.

### NAV-05: Extract Tab Operasional Component
- **Domain:** Frontend Component Extraction
- **Target Files:**
  - `frontend/src/components/plot/tabs/TabOperasional.tsx` (NEW)
  - `frontend/src/app/petak/[id]/page.tsx` (move sections out)
- **Scope & Tujuan:**
  - Ekstrak: PlotLaborIrrigationPanel, PlotAlertList, Tabel Histori Musim Tanam (beserta getStatusBadge, tombol panen/gagal) ke dalam `TabOperasional.tsx`.
  - Sertakan semua logika manajemen musim (form buat musim baru, modal panen, modal gagal).
  - Termasuk juga riwayat log Saprotan & OPT jika dirender inline.
- **Kriteria Penerimaan:**
  - Tab Operasional dapat menampilkan panel HOK/Tenaga Kerja, tabel riwayat musim, dan daftar alert.
  - Modal aksi (Buat Musim/Panen/Gagal) berfungsi secara tepat dari dalam tab ini.
  - `npx tsc --noEmit` menghasilkan exit 0.

### NAV-06: Extract Tab Keuangan Component (Adaptive per Phase)
- **Domain:** Frontend Component Extraction & Business Logic
- **Target Files:**
  - `frontend/src/components/plot/tabs/TabKeuangan.tsx` (NEW)
  - `frontend/src/app/petak/[id]/page.tsx` (move section out)
- **Scope & Tujuan:**
  - Ekstrak `PlotUnitEconomicsCard` ke dalam `TabKeuangan.tsx`.
  - Implementasikan rendering adaptif berdasarkan fase:
    - Fase Bera (0 HST): Tampilkan 'Rencana Anggaran Modal Kerja Pra-Tanam'.
    - Fase Aktif (>0 HST): Tampilkan 'Running HPP' (biaya kumulatif vs estimasi pendapatan).
    - Fase Panen (status harvested): Tampilkan 'Laporan Laba/Rugi Musim' + trigger modal PostHarvest.
  - Pastikan integrasi PostHarvestModal tetap berada dan berfungsi di tab ini.
- **Kriteria Penerimaan:**
  - Konten otomatis berubah menyesuaikan fase petak (Bera/Aktif/Panen).
  - `PlotUnitEconomicsCard` dirender dengan benar.
  - Modal PostHarvest berfungsi penuh dari tab ini.
  - `npx tsc --noEmit` menghasilkan exit 0.

### NAV-07: Quick Action Buttons in Persistent Header
- **Domain:** Frontend UX & Modal Integration
- **Target Files:**
  - `frontend/src/app/petak/[id]/page.tsx` (modify header section)
- **Scope & Tujuan:**
  - Pindahkan tombol aksi cepat (+Catat Aktivitas, Catat OPT, Aplikasi Saprotan, Mulai Musim Baru) dari bar breadcrumb KE DALAM Persistent Anchor Header.
  - Pastikan semua modal (SaprotanApplicationModal, PestScoutingModal) dapat di-trigger dari header dan beroperasi dengan baik terlepas dari tab apa yang sedang aktif.
  - Untuk tampilan Mobile: render tombol aksi hanya dengan ikon saja (tanpa label teks).
- **Kriteria Penerimaan:**
  - Tombol aksi terlihat di dalam header pada SEMUA tab yang aktif.
  - Menekan tombol akan membuka modal yang sesuai.
  - Setelah modal disubmit, data pada tab terkait akan diperbarui.
  - Pada perangkat mobile, tombol hanya berupa ikon.
  - `npx tsc --noEmit` menghasilkan exit 0.

### NAV-08: Navbar Restructure — Remove Beranda, Add Agronomi, Update Logo Link
- **Domain:** Frontend Navigation & Layout
- **Target Files:**
  - `frontend/src/components/layout/Navbar.tsx` (modify)
- **Scope & Tujuan:**
  - Hapus item menu 'Beranda' dari navbar.
  - Tambahkan item menu baru 'Agronomi' yang mengarah ke `/agronomi`, posisikan di antara 'Peta' dan 'Laporan'.
  - Ubah link logo TANDUR agar mengarah ke `/dashboard` bukan ke `/`.
  - Perbarui status aktif (highlight) pada nav: pill 'Agronomi' aktif saat `pathname.startsWith('/agronomi')`.
  - Pastikan status aktif ketika berada di rute `/petak/*` dipertimbangkan secara minor.
- **Kriteria Penerimaan:**
  - Susunan Navbar: `Dashboard | Peta | Agronomi | Laporan | Admin▾`.
  - Logo mengarahkan ke `/dashboard`.
  - Menu 'Beranda' dihapus.
  - Navigasi 'Agronomi' menyala dengan benar ketika aktif.
  - `npx tsc --noEmit` menghasilkan exit 0.

### NAV-09: Scaffold Agronomy Studio Page (`/agronomi`)
- **Domain:** Frontend New Page
- **Target Files:**
  - `frontend/src/app/agronomi/page.tsx` (NEW)
- **Scope & Tujuan:**
  - Buat route baru `/agronomi` dengan page layout yang sejalan dengan design system TANDUR.
  - Scaffold 5 placeholder section beserta title section yang memadai:
    1. Matriks Kesiapan Tanam — placeholder table
    2. Timeline Jendela Tanam — placeholder
    3. Ringkasan Preskripsi Pupuk VRN — placeholder table
    4. Ringkasan Karakteristik Tanah — placeholder table
    5. Dashboard Alert Agronomi — placeholder
  - Tiap bagian harus memiliki placeholder UI seperti teks 'Memuat data...'.
  - Title halaman: 'Agronomi Presisi — TANDUR'.
- **Kriteria Penerimaan:**
  - Route `/agronomi` berjalan tanpa adanya error.
  - Ke-5 bagian muncul dengan data placeholder.
  - Tautan 'Agronomi' di Navbar dapat digunakan dan akan tersorot saat diakses.
  - `npx tsc --noEmit` exit 0, `npm run build` exit 0.

### NAV-10: Agronomy Studio — Matriks Kesiapan Tanam (Data Integration)
- **Domain:** Frontend Data Integration & API
- **Target Files:**
  - `frontend/src/app/agronomi/page.tsx` (or sub-component)
  - `backend/demo_server.py` (new endpoint if needed)
- **Scope & Tujuan:**
  - Ganti placeholder bagian 1 dengan memuat data riil: ambil seluruh petak, lalu ambil skor kesiapan tanam untuk setiap petaknya.
  - Tampilkan data tersebut di dalam sebuah tabel yang dapat di-sort atau difilter: Nama Petak, Skor Kesiapan (0-100), Tanggal T₀* Terbaik, Fase Saat Ini (Bera/Vegetatif/Generatif), Luas (ha).
  - Tambahkan opsi sortir berdasarkan kolom skor, dan filter berdasarkan fase.
- **Kriteria Penerimaan:**
  - Tabel memunculkan data dari panggilan API.
  - Sortir dan filter fungsional.
  - Link nama petak membawa pengguna menuju halaman `/petak/{id}?tab=agronomi`.

### NAV-11: Agronomy Studio — Timeline Jendela Tanam & Ringkasan VRN
- **Domain:** Frontend Data Visualization
- **Target Files:**
  - `frontend/src/app/agronomi/page.tsx` (or sub-components)
- **Scope & Tujuan:**
  - Ganti placeholder bagian 2 dengan grafik bar timeline horizontal yang menampilkan jendela penanaman untuk setiap petak.
  - Ganti placeholder bagian 3 dengan tabel kebutuhan agregat pupuk secara total (Urea kg, NPK kg, dan biaya total), dan breakdown per-petaknya.
- **Kriteria Penerimaan:**
  - Bagan timeline akan merepresentasikan jeda masa tanam.
  - Tabel VRN menyuguhkan hitungan ringkas agregat total dari semua pupuk.
  - Bersumber dari endpoint API agronomi.

### NAV-12: Agronomy Studio — Tanah & Alert Sections
- **Domain:** Frontend Data Integration
- **Target Files:**
  - `frontend/src/app/agronomi/page.tsx` (or sub-components)
- **Scope & Tujuan:**
  - Ganti placeholder bagian 4 menggunakan tabel komparasi parameter tanah (%Pasir, Debu, Lempung, pH, beserta parameter Saxton-Rawls) antar petak.
  - Ganti placeholder bagian 5 menjadi alert lintas-petak (menginfokan petak yang akan optimal ditanam atau petak yang memerlukan tambahan pupuk).
- **Kriteria Penerimaan:**
  - Tabel tanah merender hasil panggilan API tanah.
  - Alert dashboard ter-update secara lintas platform.
  - Link individu per petak fungsional.

### NAV-13: Responsive Mobile Polish & Tab Bar Scroll
- **Domain:** Frontend CSS & Responsive Design
- **Target Files:**
  - `frontend/src/app/petak/[id]/page.tsx`
  - `frontend/src/components/layout/Navbar.tsx`
  - Various tab components
- **Scope & Tujuan:**
  - Tab Bar harus mampu digulir ke kiri & kanan (scrollable horizontally) untuk versi mobile (<768px).
  - Pastikan desain Mini-Map auto-collapse (tampilan mobile) menjadi sekecil mungkin.
  - Pastikan tombol aksi menjadi wujud ikon saat berada di mobile screen (dari NAV-07).
  - Tes semua 4 tab dengan resolusi layar 375px dan 768px.
  - Responsivitas behavior dari menu capsule di Navbar pada layar yang kecil.
- **Kriteria Penerimaan:**
  - Seluruh layout dan komponen yang dirender kompatibel 100% pada resolusi lebar 375px.
  - Tab bar memiliki fitur horizontal scroll.
  - Menghindari konten tumpang tindih secara mendatar pada laman.
  - `npm run build` exit 0.

### NAV-14: Cleanup page.tsx, Update index.ts Exports & Full Quality Gate
- **Domain:** Refactoring & QA
- **Target Files:**
  - `frontend/src/app/petak/[id]/page.tsx` (final cleanup)
  - `frontend/src/components/plot/index.ts` (update exports)
  - `frontend/src/components/plot/tabs/index.ts` (NEW — barrel exports)
- **Scope & Tujuan:**
  - Bersihkan dan hapus segala dead code yang ada dalam `page.tsx`. Halaman ini harus meramping di rentang panjang antara ~200-300 baris kode saja (hanya menyisakan komponen header + router tab + dan penempatan modal).
  - Bangun skema barrel exports untuk `tabs/` directory.
  - Edit `plot/index.ts` untuk merepresentasikan seluruh export file-file tab baru yang ada.
  - Eksekusi checkup yang menyeluruh pada basis kode: `npx tsc --noEmit` & `npm run build` bagi keseluruhan aplikasi, verifikasi tidak muncul log error.
  - Update log handoff `handoff/HANDOFF.md` guna menyatakan jika pekerjaan berhasil dirampungkan 100%.
- **Kriteria Penerimaan:**
  - File `page.tsx` akan lebih singkat dan berkisar < 350 baris.
  - Barrel exports diselenggarakan.
  - Menjalankan `npx tsc --noEmit` meraih exit code 0.
  - Eksekusi `npm run build` merangkum semua build app dengan status 0 tanpa kemunculan error.
  - Tersedia 0 Type Errors serta 0 Console Errors dalam pemeriksaan QA.

## Ringkasan Tiket

| ID Tiket | Domain | Tujuan Singkat | Dependensi |
| --- | --- | --- | --- |
| **NAV-01** | Frontend Architecture | Scaffold Tab Router & Header | - |
| **NAV-02** | Frontend GIS & Layout | Compact Mini-Map Header & Fullscreen Modal | NAV-01 |
| **NAV-03** | Frontend Extraction | Ekstrak Tab Ikhtisar | NAV-01 |
| **NAV-04** | Frontend Extraction | Ekstrak Tab Agronomi | NAV-01 |
| **NAV-05** | Frontend Extraction | Ekstrak Tab Operasional | NAV-01 |
| **NAV-06** | Frontend Extraction | Ekstrak Tab Keuangan (Adaptive phase) | NAV-01 |
| **NAV-07** | Frontend UX | Quick action buttons di Persistent Header | NAV-01 |
| **NAV-08** | Frontend Navigation | Update layout Navbar & Menu | - |
| **NAV-09** | Frontend New Page | Scaffold Agronomy Studio Page | NAV-08 |
| **NAV-10** | Frontend Integration | Kesiapan Tanam Agronomy Studio | NAV-09 |
| **NAV-11** | Frontend Data Viz | Timeline Jendela Tanam & VRN | NAV-09 |
| **NAV-12** | Frontend Integration | Perbandingan Tanah & Alerts | NAV-09 |
| **NAV-13** | Frontend CSS & UX | Poles layout & render responsif mobile | NAV-03 s/d NAV-07 |
| **NAV-14** | Refactoring & QA | Kode bersih, export baru, checkup total QA | Seluruh Tiket |
