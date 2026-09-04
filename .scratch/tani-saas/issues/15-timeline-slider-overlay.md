# 15: Timeline Slider & Satellite Overlay

**What to build:** Di halaman peta, tambahkan (1) timeline slider temporal untuk melihat perubahan warna poligon NDVI dari waktu ke waktu (animasi historis), dan (2) toggle untuk menampilkan overlay citra satelit (true color dan false color) di atas peta.

**Blocked by:** 11-dashboard-ndvi-heatmap

**Status:** done

- [x] Endpoint `GET /api/estates/{id}/indices-timeline?start_date=&end_date=` — mengembalikan NDVI per petak per tanggal (untuk animasi)
- [x] Endpoint `GET /api/plots/{id}/satellite-tile?date=&type=true_color|false_color` — mengembalikan URL tile layer dari GEE (Map ID) untuk overlay citra satelit pada tanggal tertentu
- [x] Service `gee_service.py`: fungsi `get_map_tile(polygon, date, visualization)` — generate GEE map tiles untuk true color (B4/B3/B2) dan false color (B8/B4/B3)
- [x] Frontend: komponen `TimelineSlider` — range slider dengan tanggal, play/pause button untuk animasi, step = per observasi yang tersedia
- [x] Frontend: saat slider digeser, warna poligon di peta berubah sesuai NDVI pada tanggal tersebut
- [x] Frontend: toggle button "Citra Satelit" — menambahkan tile layer GEE di atas basemap
- [x] Frontend: dropdown pilih tipe citra: "Warna Asli (True Color)" atau "Inframerah (False Color)"
