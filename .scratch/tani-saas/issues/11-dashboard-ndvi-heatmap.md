# 11: Dashboard Utama — Peta NDVI Heatmap + Tabel Ringkasan

**What to build:** Halaman dashboard utama yang menampilkan peta Mapbox dengan semua poligon petak di estate yang dipilih, diwarnai berdasarkan nilai NDVI terakhir (merah-kuning-hijau gradient). Di bawah peta, tabel ringkasan semua petak dengan kolom: nama, varietas, fase, HST, NDVI terakhir, jumlah alert aktif — bisa di-sort dan di-filter.

**Blocked by:** 07-gee-satellite-processor

**Status:** done

- [x] Endpoint `GET /api/estates/{id}/dashboard-summary` — mengembalikan semua petak beserta: latest NDVI, current_phase, current_hst, active_alert_count, variety_name, crop_type
- [x] Frontend: halaman `/dashboard` — dropdown pilih estate di atas
- [x] Frontend: komponen peta Mapbox — render poligon petak sebagai GeoJSON layer, fill color berdasarkan NDVI (gradient: merah < 0.30, kuning 0.30-0.60, hijau > 0.60)
- [x] Frontend: klik petak di peta menampilkan popup: nama, varietas, fase, HST, NDVI
- [x] Frontend: komponen tabel ringkasan di bawah peta — kolom: Nama Petak, Jenis Tanaman, Varietas, Fase, HST, NDVI Terakhir, Alert Aktif
- [x] Frontend: tabel bisa di-sort per kolom dan di-filter per crop_type / severity
- [x] Frontend: klik baris tabel navigasi ke halaman detail petak (`/petak/[id]`)
- [x] Sidebar navigasi: menu Dashboard, Peta, Admin (sub: Organisasi, Varietas, Petak Baru, Pengguna), Laporan
- [x] Semua teks dalam bahasa Indonesia
