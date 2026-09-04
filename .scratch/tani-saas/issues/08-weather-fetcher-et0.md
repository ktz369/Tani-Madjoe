# 08: Weather Fetcher & ET₀ Calculator

**What to build:** Scheduled job yang berjalan harian, mengambil data cuaca dari Open-Meteo API per koordinat estate (suhu min/max, kelembaban, kecepatan angin, radiasi solar, curah hujan), menghitung ET₀ menggunakan persamaan FAO-56 Penman-Monteith, dan menyimpan ke tabel weather_data. Juga mengambil forecast 16 hari ke depan.

**Blocked by:** 03-organization-hierarchy-crud

**Status:** done

- [x] Model `WeatherData`: id, estate_id (FK), observation_date, temp_max_c, temp_min_c, humidity_pct, wind_speed_ms, solar_radiation_mjm2, rainfall_mm, et0_mm, is_forecast (boolean)
- [x] Alembic migration untuk tabel weather_data
- [x] Service `weather_service.py`: fetch data dari Open-Meteo API (`https://api.open-meteo.com/v1/forecast`) — historical 1 hari + forecast 16 hari
- [x] Service `gdd_service.py` (partial): fungsi `calculate_et0()` — implementasi FAO-56 Penman-Monteith menggunakan suhu, RH, radiasi solar, kecepatan angin, dan elevasi/latitude
- [x] Scheduled job via APScheduler: berjalan setiap hari jam 05:00 WIB (sebelum satellite processor)
- [x] Upsert logic: jika data untuk tanggal+estate sudah ada, update; jika belum, insert. Forecast sebelumnya di-overwrite.
- [x] Endpoint `GET /api/estates/{id}/weather?start_date=&end_date=` — mengembalikan time-series cuaca
- [x] Endpoint `GET /api/estates/{id}/weather/forecast` — mengembalikan forecast 16 hari
- [x] Endpoint manual trigger `POST /api/jobs/weather` — untuk testing
- [x] Unit test: fungsi ET₀ Penman-Monteith divalidasi terhadap contoh perhitungan FAO-56 (Example 18, Irrigation & Drainage Paper 56)
