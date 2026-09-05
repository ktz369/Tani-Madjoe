# Spec: Wave 9 — Apple Editorial UI, Fibonacci Composition & Beautiful UI Pure Component Integration (100% Light Mode)

## Problem Statement

Meskipun fungsionalitas geospasial Wave 8 (Multi-Placemark KML Parser, Auto-Centroid GPS, 30-Day Satellite Backfill, dan Batch Import Wizard) telah 100% selesai dan lulus seluruh 123 tes unit, aspek antarmuka pengguna (*frontend UI*) masih memiliki beberapa kekurangan visual yang perlu disempurnakan:

1. **Kebocoran Elemen Mode Gelap (*Dark Theme Elements*):**
   Kontainer peta dan beberapa overlay status masih menggunakan warna gelap (`bg-slate-900`, `border-slate-700/50`, teks putih pada floating footer). Hal ini memecah kohesi visual aplikasi yang ditargetkan untuk lingkungan operasional terang (*clean, modern daylight SaaS*).
2. **Ketiadaan Komposisi Ruang Matematis (*Harmonic Spacing*):**
   Jarak antar elemen, padding kontainer, dan rasio kolom masih menggunakan ukuran arbitrer standar, belum menerapkan prinsip proporsi harmonik deret Fibonacci ($F_n \in \{2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987\}$) dan rasio emas (*Golden Ratio* 1 : 1.618) yang memberikan ketenangan visual khas desain premium.
3. **Tipografi Kurang Sentuhan Editorial:**
   Tipografi saat ini mengandalkan sans-serif generik tanpa sentuhan editorial (*editorial flair*) yang elegan untuk memperkuat positioning sebagai platform agritech enterprise berkelas dunia.
4. **Belum Mengadopsi Komponen Murni dari Beautiful UI:**
   Komponen antarmuka (seperti tab switcher, dropzone, tabel review, kartu status tugas, dan modal approval) perlu mengadopsi secara langsung struktur kode murni (Tailwind CSS & React) dari perpustakaan komponen **[Beautiful UI](https://www.beautifului.dev/)** (`loading-state`, `task-rows`, `records-table`, `approval-card`, `selection-actions`).

---

## Solution

Mentransformasikan seluruh antarmuka `/admin/petak-baru` menjadi **100% Light Mode** murni dengan memadukan **Apple Style Editorial**, **Komposisi Spasi Fibonacci**, dan **Adopsi Langsung Komponen Beautiful UI**:

1. **100% Pure Light Theme Architecture & Zero Dark Purge:**
   - Menghapus seluruh kelas bernuansa gelap (`bg-slate-900`, `text-slate-900/80` yang kontras terbalik, `border-slate-700`).
   - Menerapkan palet kanvas Apple bersih: Kanvas utama `#fbfbfb` / `#ffffff`, field input `#f4f4f5`, hairline borders `border-black/[0.06]` atau `border-black/[0.04]`, teks utama `#09090b` (`--ink`), teks sekunder `#71717a` (`--ink-2`), dan aksen hijau sage/emerald `#059669`.

2. **Harmonic Fibonacci Composition & Spacing Grid:**
   - **Rasio Kolom Emas (*Golden Ratio* 1 : 1.618):** Lebar sidebar kiri diatur tepat `w-[377px]` (mode tunggal) dan `w-[550px]`–`w-[610px]` (mode batch), membagi layar secara matematis proporsional ~38.2% berbanding ~61.8% terhadap kanvas peta utama (`987px`).
   - **Skala Spasi Fibonacci ($F_n$):**
     - Padding utama panel: `px-[21px] py-[34px]`.
     - Jarak antar kartu: `gap-[21px]`.
     - Jarak antar grup kontrol: `gap-[13px]`.
     - Spasi mikro label & input: `gap-[5px]` dan `mb-[5px]`.
     - Radius kelengkungan sudut: `rounded-[21px]` untuk kartu & dropzone, `rounded-[13px]` untuk sel input/tombol, dan `rounded-full` untuk pill segmented control.

3. **Tipografi Apple Style Beraksen Editorial:**
   - Judul halaman memadukan serif modern bereputasi tinggi: `font-serif text-[24px] font-medium tracking-[-0.025em] text-[#09090b]`.
   - Subjudul dan petunjuk menggunakan sans-serif Apple yang santun: `font-sans text-[13px] text-[#71717a] font-normal leading-relaxed`.
   - Angka metrik dan luas spasial menggunakan font monospace tabular: `font-mono text-[13px] tabular-nums font-semibold text-[#09090b]`.

4. **Integrasi Kode Komponen Murni Beautiful UI (`https://www.beautifului.dev/`):**
   - **Pill Segmented Control (dari `loading-state` & `selection-actions`):** Kontainer pill bulat `bg-[#f4f4f5] rounded-full p-[3px] border border-black/[0.04]` dengan sliding white pill `bg-white text-[#09090b] shadow-[0_1px_3px_rgba(0,0,0,0.08)]`.
   - **Canvas Dropzone:** Area dropzone berkanvas putih bersih dengan batas putus-putus mikro halus, avatar sirkular hijau sage, dan teks instruksi bernada editorial.
   - **Task Row Summary Card (dari `#06 task-rows`):** Kartu ringkasan `rounded-[21px] bg-white border border-black/[0.06] shadow-card` yang memuat ikon status selesai/loading, total petak terdeteksi, dan pill badge luas tabular.
   - **Records Table Grid (dari `#12 records-table`):** Tabel peninjauan dengan header clean abu-abu halus, pembatas baris *hairline* `divide-black/[0.04]`, padding sel tepat 13px Fibonacci, checkbox berpenanda emerald, dan kontrol inline.
   - **Glassmorphic Map Controls & Legend:** Floating bar di atas peta satelit menggunakan kaca es terang Apple (`bg-white/80 backdrop-blur-xl border border-black/[0.06] text-[#09090b] shadow-sm`).
   - **Crafted Action Buttons (dari Primitif Beautiful UI):** Tombol hijau emerald ber-highlight spekular mikro `shadow-[0_1px_2px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.22)] active:scale-[0.98]`.

---

## User Stories

1. Sebagai pengguna, saya ingin seluruh antarmuka bernuansa 100% terang (Light Mode) tanpa ada blok hitam atau kontras gelap mendadak pada peta dan overlay.
2. Sebagai estate manager, saya ingin antarmuka memiliki tipografi yang elegan dan proporsi spasi yang rapi (Fibonacci), sehingga nyaman ditinjau berjam-jam saat memetakan kebun.
3. Sebagai surveyor, saya ingin beralih antara pendaftaran petak tunggal dan impor massal menggunakan pill segmented control yang halus dan responsif.
4. Sebagai surveyor, saya ingin dropzone berkas berpenampilan bersih (*pure white canvas*) dengan indikator drag-and-drop yang jelas.
5. Sebagai surveyor, saya ingin ringkasan berkas multi-placemark ditampilkan dalam format *Task Row* Beautiful UI dengan badge luas yang mudah dibaca.
6. Sebagai agronomist, saya ingin tabel peninjauan petak memiliki jarak sel yang proporsional (13px), garis pemisah halus (*hairline*), dan checkbox yang intuitif.
7. Sebagai estate manager, saya ingin kontrol di atas peta satelit berpenampilan *frosted glassmorphism* putih khas Apple yang modern.
8. Sebagai admin sistem, saya ingin memastikan seluruh fungsionalitas backend dan frontend yang telah dibangun (KML parser, PostGIS save, auto-centroid, satellite backfill) tetap bekerja 100% tanpa regresi.

---

## Implementation Decisions

1. **Pemilihan Token Warna & Gaya:**
   - Background canvas: `#fbfbfb` / `#ffffff`.
   - Border hairline: `border-black/[0.06]` (1px subtle border).
   - Inset & field background: `#f4f4f5`.
   - Accent emerald: `#059669` (hover `#047857`, tint `#ecfdf5`, border `#a7f3d0`).
   - Text ink: `#09090b` (primary), `#71717a` (secondary), `#a1a1aa` (tertiary).

2. **Skala Spasi Fibonacci ($F_n$):**
   - Padding panel utama: `p-[21px]` (desktop `px-[21px] py-[34px]`).
   - Gaps layout: `gap-[21px]` (macro), `gap-[13px]` (component), `gap-[8px]` (sub-element), `gap-[5px]` (micro).
   - Radius: `rounded-[21px]` (card/dropzone), `rounded-[13px]` (cell/button), `rounded-full` (capsule).

3. **Peta Mapbox Satelit & Vektor Light:**
   - Map container wrapper: `bg-slate-50 border-l border-black/[0.06]`.
   - Floating controls: `bg-white/85 backdrop-blur-xl border border-black/[0.06] shadow-sm rounded-full px-3.5 py-2 text-[12px]`.
   - Polygon styling: garis batas emerald cerah `#059669` (tebal 2.5px), isian warna `#10b981` dengan opacity reaktif (0.40 aktif, 0.12 non-aktif).

4. **Preservasi Fungsionalitas:**
   - Tidak ada perubahan pada logic API `/plots/batch-import-preview` maupun `/plots/batch-create`.
   - State management di React tetap terjaga (`batchRows`, `batchSummary`, `drawnCoords`, `activeTab`, `selectedDivisionId`).

---

## Testing Decisions

1. **Visual & Regression Testing:**
   - Inspeksi DOM untuk memastikan tidak ada lagi kelas `bg-slate-900` atau text putih di panel terang.
   - Verifikasi keutuhan form Petak Tunggal (menggambar titik di peta, tutup poligon, hitung luas, submit).
   - Verifikasi keutuhan form Impor Massal (dropzone KML multi-placemark, review table, inline edit, select all, submit batch).
2. **Backend Automated Test Verification:**
   - Seluruh 123 tes unit di `backend/tests/test_*.py` harus tetap 100% lulus (OK).

---

## Out of Scope

- Menambahkan tema gelap (Dark mode) — arahan tegas: antarmuka murni 100% Light Mode.
- Mengubah skema database atau arsitektur endpoint backend (hanya penyempurnaan UI/UX frontend).
