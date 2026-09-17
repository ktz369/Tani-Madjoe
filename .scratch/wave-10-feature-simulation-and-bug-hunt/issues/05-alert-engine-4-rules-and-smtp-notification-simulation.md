# 05: Worker 5 — Simulasi Alert Engine 4 Aturan Agronomis & Dispatcher Notifikasi SMTP

**What to test & simulate:**
Melakukan simulasi mendalam pada sistem deteksi peringatan dini agronomis dan pengiriman notifikasi:
1. Uji evaluasi 4 aturan agronomis:
   - Aturan 1: *Water Stress* (NDWI < 0.15 dan $ET_0$ > 5.0 mm/hari).
   - Aturan 2: *Hama & Penyakit* (penurunan tajam NDVI > 15% dalam kurun 10 hari).
   - Aturan 3: *Defisiensi Nitrogen* (NDRE < 0.25 pada fase vegetatif aktif).
   - Aturan 4: *Kekeringan Ekstrem* (curah hujan 0 mm selama 7 hari berturut-turut + defisit kelembaban).
2. Uji mekanisme deduplikasi peringatan (*Alert Deduplication*):
   - Jika kondisi anomali masih berlanjut pada hari berikutnya, sistem tidak boleh membombardir user dengan puluhan alert identik untuk petak yang sama.
   - Peringatan harus berstatus `ACTIVE` dan diperbarui timestamp-nya, atau disatukan dalam ringkasan harian.
3. Uji dispatcher notifikasi email SMTP:
   - Penanganan timeout server SMTP, autentikasi gagal, atau koneksi terputus (*graceful error recovery*).
   - Rendering template email HTML: pastikan tabel petak, nilai indeks, dan tautan aksi tampil rapi.
4. Edge cases & bug hunting: Petak dengan riwayat data telemetri parsial (hanya 1 observasi), nilai float NaN pada $ET_0$/NDWI, dan injeksi template email.

**Blocked by:** None (Worker 5 dapat langsung berjalan).

**Status:** completed

- [x] Bangun skrip simulasi `test_sim_alert_engine_smtp.py` yang menginjeksi dataset sintetis pemicu 4 aturan peringatan agronomis.
- [x] Uji mekanisme deduplikasi peringatan untuk mencegah duplikasi alert aktif.
- [x] Simulasikan pengiriman email SMTP dengan server mock dan server offline untuk memverifikasi fallback logging tanpa crash.
- [x] Uji sanitasi teks input pada konten email peringatan guna mencegah email header injection.
- [x] Dokumentasikan temuan bug dan rekomendasi peningkatan alert engine.

### Hasil Simulasi & Audit:
- **Test Suite:** `backend/tests/simulations/test_sim_alert_engine_smtp.py` (30/30 passed).
- **Evaluasi 4 Aturan Agronomis:** Seluruh aturan deteksi (Water Stress, Hama/Rebah NDVI drop, Defisiensi Nitrogen NDRE, dan Kekeringan Ekstrem 7 hari) terpicu secara akurat sesuai ambang batas.
- **Mekanisme Deduplikasi:** Diverifikasi bahwa eksekusi berulang dalam jendela 7 hari tidak membuat alert baru, dan memperbolehkan alert berbeda berdampingan pada petak yang sama.
- **Resiliensi SMTP:** Simulasi kegagalan koneksi, timeout, dan otentikasi salah ditangani dengan graceful logging tanpa menghentikan worker scheduler.
- **Keamanan:** Sanitasi header injection (`\r\n`, `Bcc:`, `Subject:`) berhasil memblokir upaya eksfiltrasi email dan header tampering.
