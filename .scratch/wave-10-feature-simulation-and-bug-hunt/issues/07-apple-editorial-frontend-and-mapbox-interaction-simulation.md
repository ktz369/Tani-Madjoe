# 07: Worker 7 — Simulasi Antarmuka Apple Editorial UI, Komponen Beautiful UI & Mapbox

**What to test & simulate:**
Melakukan simulasi dan audit interaktivitas antarmuka frontend (100% Light Mode):
1. Verifikasi integrasi 5 komponen Beautiful UI di `/admin/petak-baru`:
   - `ModeSegmentedControl.tsx`: perpindahan tab halus antara mode Petak Tunggal dan Impor Massal.
   - `SpatialDropzone.tsx`: drag-and-drop file KML/KMZ/GeoJSON, indikator dragover, kartu detail file, reset file.
   - `BatchSummaryCard.tsx`: Task Row #06, metrik tabular 3 kolom, quick bulk controls (Komoditas, Varietas, Tanggal Tanam).
   - `BatchRecordsTable.tsx`: Records Table #12, toggle-all selection, inline editing nama petak, dropdown per baris, tombol fokus peta, tombol submit Beautiful UI.
   - `BatchCompletionModal.tsx`: modal approval post-submit, backdrop blur, tombol navigasi ke peta atau impor berkas lain.
2. Uji layer spasial Mapbox GL JS:
   - Sinkronisasi layer `batch-polygons-fill` dan `batch-polygons-line` saat baris di-toggle seleksinya (warna emerald jika aktif, abu-abu jika tidak aktif).
   - Fungsi `fitBounds` otomatis ke bounding box poligon.
   - Pengalihan mode peta (Satelit vs Vektor) tanpa kehilangan layer poligon yang telah dimuat.
3. Edge cases & bug hunting:
   - Form submission dengan field divisi kosong atau tanpa petak terpilih.
   - Deseleksi seluruh baris tabel (0 baris terpilih) dan penonaktifan tombol submit.
   - Zero dark classes audit: memastikan tidak ada elemen gelap tersisa di seluruh layar.

**Blocked by:** None (Worker 7 dapat langsung berjalan).

**Status:** completed

- [x] Lakukan audit sintaks TypeScript dan JSX pada seluruh komponen Beautiful UI di `frontend/src/components/plot/`.
- [x] Verifikasi penanganan state reaktif pada seleksi massal dan perubahan data inline di `BatchRecordsTable`.
- [x] Simulasikan alur navigasi dari dropzone -> review table -> submit batch -> popup completion modal.
- [x] Audit konsistensi styling Apple Editorial (skala Fibonacci, hairline border `border-black/[0.06]`, pure light theme).
- [x] Dokumentasikan temuan bug UI/UX dan rekomendasi penyempurnaan antarmuka.

---

### Hasil Audit, Simulasi & Bug Fixes:

1. **Perbaikan Kehilangan Poligon Saat Pengalihan Style Mapbox (Satelit vs Vektor):**
   - **Bug:** `map.setStyle(styleUrl)` di Mapbox GL JS menghapus seluruh layer dan source kustom. `setupLayers` yang dipanggil ulang hanya membuat source kosong tanpa menyinkronkan kembali poligon `drawnCoords` dan `batchRows` karena hook `useEffect` tidak mendengarkan perubahan style peta.
   - **Fix:** Menambahkan `batchRowsRef`, `drawnCoordsRef`, dan fungsi re-sinkronisasi (`syncBatchPolygons` & `syncDrawnPolygons`) yang dipanggil langsung pada event `style.load`, sehingga seluruh batas poligon dan warna seleksi tetap persisten 100% saat pengguna berpindah mode Satelit <-> Vektor.

2. **Perbaikan Sintaks Tailwind CSS v4 vs v3:**
   - **Bug:** Pada `BatchRecordsTable.tsx`, input teks dan select menggunakan kelas `outline-hidden` (spesifikasi Tailwind v4), sedangkan proyek mengonfigurasi Tailwind v3 (`^3.4.4`).
   - **Fix:** Mengganti seluruh kemunculan `outline-hidden` menjadi `outline-none` yang valid pada Tailwind v3.

3. **Penyempurnaan Reaktivitas Dropdown Varietas Per Baris:**
   - **Bug:** Saat `crop_type` suatu baris diubah (misal dari "padi" ke "jagung"), `variety_id` sebelumnya (varietas padi) tidak otomatis di-reset, berpotensi mengirim varietas yang tidak kompatibel ke backend.
   - **Fix:** Pada `handleUpdateRowField`, dilakukan pengecekan otomatis: jika varietas tidak sesuai dengan komoditas baru, `variety_id` di-reset ke `""` (varietas bawaan).

4. **Zero Dark Classes & Apple Editorial Design 100% Pure Light Theme:**
   - Menghapus residual `bg-slate-100` pada kontainer peta di `petak-baru/page.tsx`, menggantinya dengan pure canvas `bg-[#fbfbfb]`.
   - Mengonversi dark tooltip Recharts pada `PlotIndicesChart.tsx` (`bg-slate-900/95`, `border-slate-700`, `text-slate-200`) menjadi Apple Editorial frosted light card (`bg-white/95 text-[#09090b] border border-black/[0.08] backdrop-blur-md`).
   - Memvalidasi skala Fibonacci (`p-[13px]`, `rounded-[21px]`, `gap-[8px]`, `px-[21px]`, dll.) dan hairline border `border-black/[0.06]`.

5. **Aksesibilitas Modal:**
   - Menambahkan event listener tombol `Escape` pada `BatchCompletionModal.tsx` untuk UX desktop yang mulus.

6. **Verifikasi Suite Pengujian:**
   - `frontend/scripts/audit_apple_editorial_ui.cjs` & `audit_apple_editorial_ui.mjs`: **39/39 tests PASSED (100%)**.
   - `backend/tests/simulations/test_sim_apple_editorial_ui.py`: **7/7 tests PASSED (100%)**.
