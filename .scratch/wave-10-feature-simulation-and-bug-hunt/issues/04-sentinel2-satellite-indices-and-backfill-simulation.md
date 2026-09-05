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

**Status:** ready-for-agent

- [ ] Bangun skrip simulasi `test_sim_satellite_telemetry.py` untuk menguji formula 6 indeks vegetasi dan boundary check $[-1.0, 1.0]$.
- [ ] Uji fungsi backfill 30 hari terhadap plot riil dan plot non-eksistensi (error handling).
- [ ] Verifikasi bahwa kurva pertumbuhan NDVI/SAVI merefleksikan dinamika sigmoidal alami tanpa anomali penurunan mendadak non-historis.
- [ ] Uji konkurensi batch backfill untuk memastikan tidak ada race condition pada tabel `satellite_telemetry`.
- [ ] Dokumentasikan temuan bug dan rekomendasi optimasi indeks satelit.
