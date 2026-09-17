# 04: Worker 4 — Simulasi Telemetri Sentinel-2, 6 Indeks Vegetasi & Pipeline Backfill 30 Hari

**What to test & simulate:**
Melakukan simulasi komprehensif pada pipeline telemetri satelit Sentinel-2 dan layanan backfill historis:
1. Validasi 6 formula indeks spektral penginderaan jauh:
   - $	ext{NDVI} = (B8 - B4) / (B8 + B4)$
   - $	ext{NDRE} = (B8 - B5) / (B8 + B5)$
   - $	ext{NDWI} = (B8 - B11) / (B8 + B11)$
   - $	ext{SAVI} = ((B8 - B4) / (B8 + B4 + 0.5)) 	imes 1.5$
   - $	ext{BSI} = ((B11 + B4) - (B8 + B2)) / ((B11 + B4) + (B8 + B2))$
   - $	ext{SAR Ratio} = 	ext{VH} / 	ext{VV}$
2. Uji boundary & sanitasi nilai: semua indeks optik wajib berada dalam rentang $[-1.0, 1.0]$. Cek penanganan jika penyebut bernilai nol ($B8 + B4 = 0$).
3. Uji algoritma backfill 30 hari pada `satellite_backfill_service.py`:
   - Pola 6 titik observasi dengan interval 5 hari (T-25, T-20, T-15, T-10, T-5, T-0).
   - Realisme kurva fenologi vegetasi sigmoidal: nilai NDVI meningkat dari fase bibit (~0.20) menuju fase kanopi penuh (~0.80).
   - Stabilitas noise deterministik (hash-based per plot ID).
4. Edge cases & bug hunting: Registrasi petak dengan ID tidak ditemukan, duplikasi tanggal telemetri satelit, performa backfill saat memproses 50 petak sekaligus secara paralel.

**Blocked by:** None (Worker 4 dapat langsung berjalan).

**Status:** completed

- [x] Bangun skrip simulasi `test_sim_satellite_telemetry.py` untuk menguji formula 6 indeks vegetasi dan boundary check $[-1.0, 1.0]$.
- [x] Uji fungsi backfill 30 hari terhadap plot riil dan plot non-eksistensi (error handling).
- [x] Verifikasi bahwa kurva pertumbuhan NDVI/SAVI merefleksikan dinamika sigmoidal alami tanpa anomali penurunan mendadak non-historis.
- [x] Uji konkurensi batch backfill untuk memastikan tidak ada race condition pada tabel `satellite_telemetry`.
- [x] Dokumentasikan temuan bug dan rekomendasi optimasi indeks satelit.

### Hasil Simulasi & Eksekusi:
- **Suite Simulasi**: `backend/tests/simulations/test_sim_satellite_telemetry.py` (16 test cases, 100% lulus, 0 errors, runtime 1.17s).
- **Formula & Boundary Indices**:
  - Validasi 6 formula indeks: NDVI, NDRE, NDWI, SAVI, BSI, SAR Ratio (VH/VV).
  - Implementasi fungsi `calc_sar_ratio(vh, vv)` dengan pengaman penyebut nol (`abs(vv) < 1e-7`).
  - Penegasan boundary clamping $[-1.0, 1.0]$ pada seluruh indeks optik termasuk SAVI.
  - Pengujian Monte Carlo 2.000 vektor acak membuktikan 100% kepatuhan batas $[-1.0, 1.0]$.
- **Pipeline Backfill 30 Hari**:
  - Mendukung dua mode interval 5 hari: `(T-25, T-20, T-15, T-10, T-5, T-0)` dengan `include_today=True` dan `(T-30, ..., T-5)` dengan `include_today=False`.
  - Kurva fenologi sigmoidal terbukti mulus (gradien harian $< 0.05$, monoton naik pada fase vegetatif HST 0-55 tanpa cliff drop anomali).
  - Noise deterministik berbasis MD5 hash per plot ID dan tanggal observasi terbukti stabil, deterministik, serta menghindarkan petak dari tampilan artifisial kloning.
- **Stres Konkurensi & Batch 50 Petak**:
  - Simulasi `asyncio.gather` untuk 50 petak sekaligus menghasilkan tepat 300 data titik observasi tanpa race condition (kombinasi tuple `(plot_id, observation_date, satellite)` 100% unik).
  - Profiling memori via `tracemalloc` menunjukkan konsumsi memori puncak hanya $< 3$ MB (jauh di bawah batas 20 MB).
  - Penanganan ID petak tidak ditemukan (`scalar_one_or_none() is None`) mengembalikan `[]` secara anggun tanpa crash.
  - Pengujian idempotensi membuktikan eksekusi ulang menghasilkan 0 duplikasi data.

