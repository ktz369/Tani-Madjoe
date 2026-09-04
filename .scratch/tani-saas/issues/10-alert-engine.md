# 10: Alert Engine — 4 Aturan Deteksi

**What to build:** Scheduled job yang berjalan setelah GDD calculator, mengevaluasi 4 aturan deteksi anomali per petak yang memiliki musim tanam aktif: stres nitrogen (kuning), stres air (oranye), serangan hama (merah), panen optimal (hijau tua). Alert yang terpicu tersimpan ke tabel alerts dengan severity, rekomendasi, dan nilai trigger.

**Blocked by:** 09-gdd-calculator-prediction

**Status:** done

- [x] Model `Alert`: id, plot_id (FK), created_at, alert_type (nitrogen_stress/water_stress/pest_anomaly/harvest_ready), severity (kuning/oranye/merah/hijau_tua), title, description, recommendation, trigger_values (JSON), is_read, is_resolved
- [x] Alembic migration untuk tabel alerts (`backend/alembic/versions/0010_create_alerts_table.py`)
- [x] Service `alert_service.py`: aturan 1 — Stres Nitrogen: NDVI > 0.60 AND NDRE ≤ threshold_fase - 15%
- [x] Service `alert_service.py`: aturan 2 — Stres Air: ΔNDWI_7hari < -0.15 AND curah hujan 7 hari < 10mm
- [x] Service `alert_service.py`: aturan 3 — Hama/Rebah: varians piksel NDVI dalam poligon > 25% (memerlukan GEE per-pixel query, bukan hanya mean)
- [x] Service `alert_service.py`: aturan 4 — Panen: GDD akumulatif ≥ target varietas AND NDVI ≤ 0.35
- [x] Deduplikasi: jika alert tipe yang sama sudah ada dan belum resolved dalam 7 hari terakhir untuk petak yang sama, jangan buat duplikat
- [x] Threshold bisa di-override per varietas via kolom `alert_thresholds` di crop_varieties (JSON)
- [x] Scheduled job: berjalan setelah GDD calculator (jam 06:30 WIB)
- [x] Endpoint `GET /api/alerts?estate_id=&severity=&is_resolved=` — list alerts dengan filter
- [x] Endpoint `PUT /api/alerts/{id}` — update is_read, is_resolved
- [x] Endpoint `GET /api/plots/{id}/alerts` — alerts per petak
- [x] Unit test: setiap aturan ditest independen — input kondisi → output alert/no-alert (`backend/tests/test_alerts.py`, 18 tests passed)
