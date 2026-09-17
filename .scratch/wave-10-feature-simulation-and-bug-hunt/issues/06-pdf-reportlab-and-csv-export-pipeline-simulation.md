# 06: Worker 6 — Simulasi Generator Laporan PDF ReportLab & Ekspor CSV Telemetri

**What to test & simulate:**
Melakukan simulasi pada engine pelaporan dan ekstraksi data analitik:
1. Uji generator PDF agronomi ReportLab:
   - Pembuatan dokumen PDF multi-halaman berorientasi potret & lanskap.
   - Rendering elemen: header institusional, informasi petak (varietas, tanggal tanam, HST, luas Ha), tabel deret waktu telemetri satelit, dan tabel ringkasan cuaca.
   - Paginasi dinamis: dokumen dengan 5 observasi vs 50 observasi harus memecah halaman dengan rapi tanpa overflow teks atau tabel terpotong.
2. Uji format dan encoding ekspor CSV:
   - Header kolom standar (`tanggal`, `hst`, `ndvi`, `ndre`, `ndwi`, `savi`, `bsi`, `suhu_min`, `suhu_max`, `curah_hujan`, `et0`).
   - UTF-8 BOM encoding untuk memastikan kompatibilitas karakter dan angka saat dibuka di Microsoft Excel tanpa formatting error.
3. Edge cases & bug hunting:
   - Petak baru tanpa data telemetri (0 data points): generator PDF dan CSV tidak boleh melempar 500 Internal Server Error.
   - Karakter non-ASCII, simbol khusus (&, <, >, ", '), atau nama petak sangat panjang (> 100 karakter) yang dapat merusak canvas ReportLab.
   - Perhitungan rata-rata metrik saat data bernilai null.

**Blocked by:** None (Worker 6 dapat langsung berjalan).

**Status:** completed

- [x] Bangun skrip simulasi `test_sim_reporting_pipeline.py` yang memicu pembuatan PDF dan CSV pada berbagai variasi petak (kosong, normal, data sangat padat).
- [x] Uji ketahanan ReportLab canvas terhadap karakter khusus XML/HTML entity dalam nama petak dan estate.
- [x] Verifikasi format CSV dengan parsing validator dan pemeriksaan encoding UTF-8 BOM.
- [x] Uji penanganan memori saat mengekspor laporan petak dengan riwayat data 1 tahun.
- [x] Dokumentasikan temuan bug dan rekomendasi formatting dokumen.

### Hasil Simulasi & Audit:
- **Test Suite:** `backend/tests/simulations/test_sim_reporting_pipeline.py` (15/15 passed).
- **ReportLab PDF Generator:** Berhasil merender laporan multi-halaman potret & lanskap, paginasi dinamis (5 vs 50+ observasi) terpecah bersih tanpa tumpang tindih.
- **Entity Escaping & Robustness:** Tahan terhadap karakter khusus XML/HTML (`<`, `>`, `&`, `"`, `'`), nama petak ekstra panjang (>100 karakter), dan simbol Unicode.
- **CSV Encoding:** Validasi format RFC 4180 dengan UTF-8 BOM (`\xef\xbb\xbf`) terkonfirmasi sempurna untuk Microsoft Excel dan Google Sheets.
- **Batas Ekstrem:** Petak tanpa data telemetri (0 data points) dan petak raksasa (>10.000 Ha) menghasilkan dokumen valid tanpa error 500.
