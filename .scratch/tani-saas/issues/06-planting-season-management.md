# 06: Planting Season Management

**What to build:** User bisa mencatat musim tanam baru untuk setiap petak, melihat histori musim tanam sebelumnya, dan menandai status (active, harvested, failed). Hanya satu musim tanam yang boleh active per petak pada satu waktu.

**Blocked by:** 05-plot-crud-draw-polygon

**Status:** done

- [x] Model `PlantingSeason`: id, plot_id (FK), variety_id (FK), planting_date, harvest_date (nullable), status (active/harvested/failed), yield_estimate_ton_per_ha (nullable), notes, created_at
- [x] Alembic migration untuk tabel planting_seasons
- [x] CRUD endpoints: `POST/GET /api/plots/{id}/seasons`, `PUT /api/seasons/{id}` (update status, harvest_date, yield)
- [x] Validasi: hanya 1 season dengan status "active" per plot
- [x] Endpoint `POST /api/plots/{id}/seasons` otomatis update `plot.planting_date`, `plot.variety_id`, dan `plot.crop_type` berdasarkan season baru
- [x] Frontend: di halaman detail petak, section "Musim Tanam" — list histori seasons + tombol "Mulai Musim Baru"
- [x] Frontend: form untuk musim baru (pilih varietas, tanggal tanam), form update status (harvested + tanggal panen + estimasi yield, atau failed + catatan)
