# 12: Panel Alert & In-App Notification

**What to build:** Panel alert di sidebar/header dashboard menampilkan peringatan aktif terbaru. Bell icon dengan badge count (jumlah alert unread). Klik bell membuka panel/drawer berisi list alert dengan severity color-coded, rekomendasi aksi, dan tombol mark as read/resolved.

**Blocked by:** 10-alert-engine

**Status:** completed

- [x] Endpoint `GET /api/alerts/unread-count` — mengembalikan jumlah alert yang belum dibaca
- [x] Endpoint `GET /api/alerts/recent?limit=20` — mengembalikan 20 alert terbaru (semua severity)
- [x] Endpoint `PUT /api/alerts/{id}/read` — mark as read
- [x] Endpoint `PUT /api/alerts/{id}/resolve` — mark as resolved
- [x] Frontend: bell icon di header dengan badge count (polling setiap 60 detik atau via API on page load)
- [x] Frontend: klik bell → slide-out drawer/panel menampilkan list alert terbaru
- [x] Frontend: setiap alert card menampilkan: severity icon+color (🟡🟠🔴🟢), judul, nama petak, waktu, rekomendasi aksi
- [x] Frontend: tombol "Tandai Dibaca" dan "Sudah Ditangani" per alert
- [x] Frontend: klik nama petak di alert navigasi ke halaman detail petak
- [x] Frontend: filter di panel alert: per severity, per estate
