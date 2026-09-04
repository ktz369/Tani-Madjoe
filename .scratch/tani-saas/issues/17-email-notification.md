# 17: Email Notification

**What to build:** Ringkasan alert harian dikirim via email (SMTP) ke semua user terdaftar. Email berisi: jumlah alert baru per severity, top 10 alert terpenting, dan link ke dashboard. Jika tidak ada alert baru, email tidak dikirim.

**Blocked by:** 10-alert-engine

**Status:** done

- [x] Service `email_service.py`: konfigurasi SMTP (host, port, username, password dari env vars)
- [x] Service `email_service.py`: fungsi `send_daily_alert_summary(user_email, alerts)` — compose dan kirim email HTML
- [x] Template email HTML: header "Ringkasan Alert Harian — Tani", tabel alert (severity icon, judul, petak, rekomendasi), link ke dashboard
- [x] Scheduled job: berjalan setiap hari jam 07:30 WIB, query alerts yang dibuat dalam 24 jam terakhir, kirim ke semua users
- [x] Jika tidak ada alert baru dalam 24 jam, skip pengiriman email
- [x] Env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM_EMAIL
- [x] `.env.example` diupdate dengan variabel SMTP
- [x] Endpoint `POST /api/test/send-email` — untuk testing pengiriman email (hanya di development)
- [x] Endpoint `GET /api/test/preview-email-html` — preview HTML di browser tanpa SMTP
- [x] Unit test lengkap di `backend/tests/test_email_service.py` (11 test case lulus)

