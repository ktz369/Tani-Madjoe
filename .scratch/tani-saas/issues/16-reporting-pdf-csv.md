# 16: Reporting — PDF & CSV Export

**What to build:** Fitur generate laporan: (1) PDF kesehatan lahan per estate/divisi (ringkasan NDVI, alert, fase per petak), (2) PDF prediksi panen, (3) PDF penggunaan air & rekomendasi irigasi, (4) Export CSV/Excel time-series data, (5) Histori perbandingan antar musim tanam. Laporan kesehatan dan penggunaan air auto-generate mingguan. Semua juga bisa on-demand.

**Blocked by:** 09-gdd-calculator-prediction, 13-plot-detail-timeseries

**Status:** done

- [x] Service `report_service.py`: fungsi `generate_health_report(estate_id, date_range)` — generate PDF menggunakan library ReportLab dengan template resmi Tani
- [x] PDF Kesehatan Lahan: header (nama estate, tanggal), tabel per petak (NDVI, fase, alert aktif, rekomendasi), ringkasan KPI eksekutif
- [x] PDF Prediksi Panen: daftar petak dengan GDD progress, predicted harvest date, estimasi yield (ton/ha & total), SOP pra-panen
- [x] PDF Penggunaan Air: ETc per petak, total kebutuhan air estate (m³), rekomendasi irigasi berdasarkan fase & metode AWD
- [x] Service: fungsi `export_timeseries_csv(estate_id, date_range)` — export data time-series lengkap (Tanggal, Petak, Varietas, HST, NDVI, NDRE, NDWI, SAVI, SAR, Cuaca, ETc, GDD) ke CSV
- [x] Service: fungsi `generate_season_comparison(plot_id)` — bandingkan metrik agronomi & iklim antar musim tanam untuk petak yang sama
- [x] Scheduled job: auto-generate laporan kesehatan + penggunaan air setiap Senin jam 07:00 WIB (`weekly_reports_monday_0700_wib`), simpan ke storage dan model `GeneratedReport`
- [x] Endpoint `POST /api/reports/health` — generate on-demand, return PDF file
- [x] Endpoint `POST /api/reports/harvest-prediction` — generate on-demand, return PDF file
- [x] Endpoint `POST /api/reports/water-usage` — generate on-demand, return PDF file
- [x] Endpoint `GET /api/reports/export-csv` — download CSV time-series
- [x] Endpoint `GET /api/reports/history` — list laporan auto-generate yang tersedia
- [x] Endpoint `GET /api/plots/{plot_id}/season-comparison` — analisis komparasi antar musim tanam
- [x] Frontend: halaman `/laporan` — 4 kartu generator laporan, filter estate & tanggal, analisis komparasi musim, riwayat arsip, tautan menu di `Navbar.tsx`
