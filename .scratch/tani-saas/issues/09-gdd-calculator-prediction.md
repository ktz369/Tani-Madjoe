# 09: GDD Calculator & Fase Prediction

**What to build:** Scheduled job yang berjalan setelah weather fetcher, menghitung GDD harian dan akumulatif per petak, menentukan fase fenologi aktif berdasarkan GDD akumulatif vs target varietas, memprediksi tanggal panen, dan menghitung ETc (kebutuhan air harian). Hasil tersimpan di tabel gdd_accumulation.

**Blocked by:** 07-gee-satellite-processor, 08-weather-fetcher-et0

**Status:** done

- [x] Model `GddAccumulation`: id, plot_id (FK), observation_date, gdd_daily, gdd_cumulative, etc_mm, predicted_phase, predicted_harvest_date
- [x] Alembic migration untuk tabel gdd_accumulation
- [x] Service `gdd_service.py`: fungsi `calculate_gdd_daily(tmax, tmin, tbase, crop_type)` — menghitung GDD harian dengan capping untuk jagung (Tmax cap 30°C, Tmin cap 10°C), tanpa capping untuk padi
- [x] Service `gdd_service.py`: fungsi `predict_phase(gdd_cumulative, variety_phases)` — lookup fase fenologi berdasarkan GDD akumulatif vs gdd_target per fase
- [x] Service `gdd_service.py`: fungsi `predict_harvest_date(gdd_cumulative, gdd_target_total, avg_daily_gdd)` — estimasi tanggal panen berdasarkan sisa GDD yang dibutuhkan
- [x] Service `gdd_service.py`: fungsi `calculate_etc(et0, kc)` — ETc = ET₀ × Kc (Kc diambil dari phenology_phase aktif)
- [x] Scheduled job: berjalan setelah weather fetcher (jam 05:30 WIB), iterasi semua petak aktif
- [x] Update kolom `plot.current_phase` dan `plot.current_hst` setelah perhitungan
- [x] Endpoint `GET /api/plots/{id}/gdd?start_date=&end_date=` — mengembalikan time-series GDD
- [x] Endpoint `GET /api/plots/{id}/prediction` — mengembalikan fase saat ini, predicted_harvest_date, GDD progress (persentase)
- [x] Unit test: GDD harian (termasuk capping), GDD akumulatif, ETc, prediksi fase
