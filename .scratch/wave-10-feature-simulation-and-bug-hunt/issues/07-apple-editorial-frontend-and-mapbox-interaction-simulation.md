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

**Status:** ready-for-agent

- [ ] Lakukan audit sintaks TypeScript dan JSX pada seluruh komponen Beautiful UI di `frontend/src/components/plot/`.
- [ ] Verifikasi penanganan state reaktif pada seleksi massal dan perubahan data inline di `BatchRecordsTable`.
- [ ] Simulasikan alur navigasi dari dropzone -> review table -> submit batch -> popup completion modal.
- [ ] Audit konsistensi styling Apple Editorial (skala Fibonacci, hairline border `border-black/[0.06]`, pure light theme).
- [ ] Dokumentasikan temuan bug UI/UX dan rekomendasi penyempurnaan antarmuka.
