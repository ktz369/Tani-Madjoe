# Spesifikasi Teknis: Restrukturisasi UX Menu & Navigasi
**Platform Pertanian Presisi `TANDUR` (Terraced Rice & Corn Cycles)**
**Dasar Acuan:** Hasil Sesi /grill-me — 12 Keputusan Arsitektur (7 September 2026)
**Standar Kualitas:** Zero Type Error, Production Build 100% OK, Zero Console Error, Mobile-First Responsive

---

## 1. Ringkasan Eksekutif & Objektif Sistem

Sistem `Tani` saat ini mengalami kendala *scroll fatigue* dan penumpukan komponen vertikal yang berlebihan (hingga 12+ komponen dalam 1269 baris kode di halaman `/petak/[id]`). Selain itu, terdapat *role mismatch* pada informasi yang ditampilkan, menyebabkan pengguna kesulitan mencari data yang relevan dengan cepat. 

Restrukturisasi UX ini bertujuan untuk merombak arsitektur navigasi halaman dan menu secara menyeluruh, dengan pendekatan **Deep-Linked Tabbed Hub** pada level petak, penambahan **Agronomy Studio** lintas-petak, dan simplifikasi *navbar global*. Objektif utama adalah mempercepat akses fitur, memisahkan konteks informasi (Ikhtisar, Agronomi, Operasional, Keuangan), serta menciptakan pengalaman *mobile-friendly* yang mulus tanpa mengorbankan kedalaman fungsionalitas aplikasi.

---

## 2. Arsitektur Information Architecture (IA)

Pola dekomposisi data akan dipecah berdasarkan domain fungsional. Berikut adalah struktur matriks tab baru untuk `/petak/[id]`:

| Domain / Tab | Fungsi Utama | Komponen Terdampak |
| :--- | :--- | :--- |
| **Ikhtisar** | Status utama, *monitoring* satelit, cuaca & spektral | PlotTerraceMiniMap, PhenologyTimeline, PlotIndicesChart, PlotSatellitePanel |
| **Agronomi** | Analisis preskripsi, tanah, neraca air | DigitalAgronomyPanel (5 sub-tab) |
| **Operasional** | Manajemen HOK, irigasi, aplikasi saprotan, *scouting* OPT | PlotLaborIrrigationPanel, Pencatatan Aktivitas (Modal) |
| **Keuangan** | Unit economics, modal kerja, HPP berjalan, paska panen | PlotUnitEconomicsCard, PostHarvestModal |

---

## 3. Spesifikasi Teknis: Deep-Linked Tabbed Hub `/petak/[id]`

Satu URL utama `/petak/[id]` akan dikonversi menjadi *Tabbed Hub* menggunakan parameter *query string* untuk memfasilitasi *client-side switch* instan melalui `useSearchParams()`. Pindah tab tidak akan menggunakan hard navigation, melainkan `router.push()` agar pergantian komponen terjadi murni di sisi klien.

### 3.1 Persistent Anchor Header
- **Mini-Map Compact:** Berukuran 120–160px yang selalu melekat di atas halaman, dengan tombol 'Perbesar' yang memicu modal *fullscreen*.
- **KPI Strip:** Menampilkan atribut dasar petak di samping peta: Luas (Ha), Elevasi (mdpl), Kemiringan (%), dan Status Air.
- **Quick Action Buttons:** Tombol aksi utama diletakkan pada *header* (`+ Catat Aktivitas`, OPT, Saprotan).

### 3.2 Segmented Tab Bar
- Memiliki 4 tab utama: `Ikhtisar`, `Agronomi`, `Operasional`, dan `Keuangan`.
- **URL Query Parameter:** Navigasi tab mengubah parameter URL (`?tab=ikhtisar|agronomi|operasional|keuangan`).
- **Default Behavior:** Mengakses `/petak/[id]` tanpa parameter akan secara otomatis membuka Tab **Ikhtisar**.

### 3.3 Tab Ikhtisar
Menyatukan semua komponen *read-only monitoring*:
- `PlotTerraceMiniMap` (Compact view, terintegrasi pada persistent header)
- `PhenologyTimeline`
- *GDD/ETc Monitoring* (Status)
- `PlotIndicesChart` (Spectral)
- `PlotSatellitePanel` (Satellite image monitoring)

### 3.4 Tab Agronomi
Menyajikan panel kecerdasan agronomi yang mendalam, membungkus `DigitalAgronomyPanel` beserta 5 sub-tab internalnya untuk keperluan analisis tanah, air, pertumbuhan, dan kesiapan tanam spesifik petak.

### 3.5 Tab Operasional
Pusat eksekusi dan pelacakan kegiatan lapang:
- Menampilkan: `PlotLaborIrrigationPanel`.
- **Quick Action Flow:** Kombinasi cerdas di mana tombol `+ Catat Aktivitas` dari *Persistent Header* memunculkan modal untuk memilih kategori (HOK, Saprotan, OPT, Panen) seperti `PestScoutingModal` atau `SaprotanApplicationModal`.
- Memiliki tabel/riwayat *log* operasional lengkap dengan *filter*, pencarian, dan ringkasan biaya kumulatif.

### 3.6 Tab Keuangan
Konten `PlotUnitEconomicsCard` dan `PostHarvestModal` beradaptasi cerdas terhadap fase tumbuh (*phenology*) petak saat ini:
- **Bera (0 HST):** Menampilkan *Rencana Anggaran Modal Kerja Pra-Tanam*.
- **Aktif (>0 HST):** Menampilkan metrik *Running HPP* (Harga Pokok Penjualan).
- **Panen:** Laporan Laba/Rugi komprehensif & metrik *Post-Harvest* (standar SNI 14% *Moisture Content*).

---

## 4. Spesifikasi Teknis: Restrukturisasi Navbar Global

### 4.1 Menu Items & Ordering
Susunan *navbar* (`Navbar.tsx`) disederhanakan dari item sebelumnya. Urutan terbarunya memiliki total 5 menu:
1. `Dashboard`
2. `Peta`
3. `Agronomi`
4. `Laporan`
5. `Admin ▾`

### 4.2 Logo Behavior Change
Link "Beranda" teks dihapus sepenuhnya. Klik pada *Logo TANDUR* akan langsung bertindak sebagai *link* ke `/dashboard`.

### 4.3 Active State Highlighting
Penyorotan visual (*active state*) disesuaikan untuk URL. Rute turunan seperti `/petak/*` menyalakan menu terkait, sementara rute `/agronomi` akan menyoroti menu baru 'Agronomi'.

---

## 5. Spesifikasi Teknis: Halaman Agronomy Studio (`/agronomi`)

Top-level menu baru yang ditujukan sebagai kapabilitas analitik lintas-petak (*cross-plot*). Halaman ini memuat 5 komponen utama:

### 5.1 Matriks Kesiapan Tanam
Tabel/skoring kesiapan lahan berikisar `0-100`, estimasi tanggal tanam $T_0^*$, dan fase pertumbuhan saat ini untuk keseluruhan petak.

### 5.2 Timeline Jendela Tanam
Grafik perbandingan rentang waktu (*horizontal timeline*) untuk memonitor jendela tanam optimum dari berbagai petak secara bersamaan.

### 5.3 Ringkasan VRN (Variable Rate Nutrition)
Agregasi kebutuhan preskripsi pemupukan (Total Urea, NPK) dari seluruh petak untuk manajemen *supply-chain*.

### 5.4 Ringkasan Tanah
Menampilkan statistik agregat Sand, Silt, Clay, dan pH per petak.

### 5.5 Alert Agronomi
Panel sentral (`PlotAlertList`) yang memusatkan notifikasi anomali lintas-petak secara global.

---

## 6. Spesifikasi Responsif Mobile (<768px)

Perilaku komponen di-optimasi untuk pengguna ponsel di lahan:
- **Mini-Map Auto-Collapse:** Peta pada *header* halaman `/petak/[id]` otomatis mengecil (*collapse*) menjadi sekadar *badge* lokasi (Ikon peta + Nama petak).
- **Scrollable Tab Bar:** Bar navigasi tab `Ikhtisar | Agronomi ...` dapat di-*scroll* secara horizontal tanpa patah/turun baris (menghindari penumpukan).
- **Compact Action Buttons:** Tombol aksi pada *header* disingkat menjadi mode *icon-only*.

---

## 7. File Terdampak & Dependency Graph

### 7.1 File Eksisting yang Dimodifikasi
- `frontend/src/app/petak/[id]/page.tsx` → Dirampingkan dari 1269 baris menjadi ~200–300 baris (Persistent Header + Tab Router + Modal host).
- `frontend/src/components/layout/Navbar.tsx` → Penataan ulang jumlah dan urutan link, hapus Beranda, tambah Agronomi, Logo → `/dashboard`.
- `frontend/src/components/plot/PlotTerraceMiniMap.tsx` → Tambah prop `compact` untuk mode header 120–160px + modal fullscreen expand.
- `frontend/src/components/plot/DigitalAgronomyPanel.tsx` → Relokasi ke Tab Agronomi.
- `frontend/src/components/plot/PlotLaborIrrigationPanel.tsx` → Relokasi ke Tab Operasional.
- `frontend/src/components/plot/PlotUnitEconomicsCard.tsx` → Relokasi ke Tab Keuangan + adaptasi render per fase (Bera/Aktif/Panen).
- `frontend/src/components/plot/PestScoutingModal.tsx`, `SaprotanApplicationModal.tsx`, `PostHarvestModal.tsx` → Pemanggilan dari tombol sentral `+ Catat Aktivitas` di Persistent Header.
- `frontend/src/components/plot/index.ts` → Update barrel exports.

### 7.2 File Baru yang Dibuat
- `frontend/src/components/plot/tabs/TabIkhtisar.tsx` → Konten Tab Ikhtisar (Phenology, GDD/ETc, Spectral, Satellite).
- `frontend/src/components/plot/tabs/TabAgronomi.tsx` → Wrapper Tab Agronomi untuk DigitalAgronomyPanel.
- `frontend/src/components/plot/tabs/TabOperasional.tsx` → Konten Tab Operasional (HOK, Saprotan, OPT, Histori Musim).
- `frontend/src/components/plot/tabs/TabKeuangan.tsx` → Konten Tab Keuangan (adaptif per fase petak).
- `frontend/src/components/plot/tabs/index.ts` → Barrel exports untuk semua tab components.
- `frontend/src/app/agronomi/page.tsx` → Halaman Agronomy Studio lintas-petak.

