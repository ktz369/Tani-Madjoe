# 14: Weather Widget & Forecast

**What to build:** Widget cuaca di halaman dashboard dan detail petak yang menampilkan kondisi cuaca saat ini (suhu, kelembaban, curah hujan, kecepatan angin) dan prakiraan 16 hari ke depan per estate. Prakiraan ditampilkan sebagai card harian atau small chart.

**Blocked by:** 08-weather-fetcher-et0, 11-dashboard-ndvi-heatmap

**Status:** completed

- [x] Endpoint `GET /api/estates/{id}/weather/current` — mengembalikan data cuaca hari ini (Tmax, Tmin, RH, wind, rain, solar rad, ET₀)
- [x] Endpoint `GET /api/estates/{id}/weather/forecast` sudah ada (dari ticket 08) — mengembalikan forecast 16 hari
- [x] Frontend: komponen `WeatherWidget` — card menampilkan kondisi hari ini: suhu (min/max), kelembaban, curah hujan, kecepatan angin, radiasi surya, ET₀, ikon cuaca
- [x] Frontend: komponen `ForecastChart` — mini bar chart curah hujan 16 hari + line chart suhu 16 hari + ET₀ acuan + daily cards grid
- [x] Frontend: widget ditampilkan di dashboard dan di halaman detail petak
- [x] Frontend: dropdown pilih estate untuk memperbarui widget (di dashboard)
- [x] Semua label dan unit dalam bahasa Indonesia (°C, mm, m/s, %, MJ/m², mm/hari)

