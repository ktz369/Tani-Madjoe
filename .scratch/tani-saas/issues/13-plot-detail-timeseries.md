# 13: Detail Petak — Time-Series Chart + Fase Fenologi

**What to build:** Halaman detail petak (`/petak/[id]`) yang menampilkan: (1) grafik time-series NDVI, NDRE, NDWI menggunakan Recharts (line chart historis sejak tanam), (2) progress bar fase fenologi saat ini + daftar semua fase dengan status (selesai/aktif/belum), (3) info prediksi panen (tanggal, GDD progress), (4) tabel data terbaru (NDVI, NDRE, NDWI, GDD, ETc).

**Blocked by:** 09-gdd-calculator-prediction, 11-dashboard-ndvi-heatmap

**Status:** done

- [x] Endpoint `GET /api/plots/{id}/detail` — mengembalikan info lengkap petak: atribut, varietas, fase, GDD progress, prediksi panen, latest indices
- [x] Frontend: halaman `/petak/[id]` — header menampilkan nama petak, varietas, crop_type, HST, luas
- [x] Frontend: komponen Recharts line chart — 3 line (NDVI hijau, NDRE biru, NDWI cyan) dari planting_date sampai hari ini, x-axis = tanggal, y-axis = nilai indeks (0-1)
- [x] Frontend: komponen progress bar fase fenologi — horizontal bar menunjukkan semua fase (P0→V1→V2→...→P1), fase aktif di-highlight, fase selesai berwarna hijau
- [x] Frontend: card "Prediksi Panen" — GDD akumulatif / GDD target (persentase + bar), tanggal prediksi panen
- [x] Frontend: card "Kebutuhan Air" — ETc hari ini, ET₀ hari ini, Kc fase aktif
- [x] Frontend: tabel data observasi terbaru (tanggal, NDVI, NDRE, NDWI, SAVI, SAR VV/VH)
- [x] Frontend: section alert aktif untuk petak ini (reuse komponen dari ticket 12)
