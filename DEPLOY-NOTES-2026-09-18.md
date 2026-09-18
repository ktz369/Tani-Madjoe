# TANDUR — Deploy notes (host srv1081256) — 2026-09-18

Domain: **https://tandur.majestasolution.id** (IPv4 31.97.222.136, A-record ok)
Repo: `https://github.com/ktz369/Tani-Madjoe.git` → deployed at `/opt/tandur` (branch `main`, commit `2fec71a`)

## Architecture (docker, host nginx)
| Service | Container | Host bind | Notes |
| :-- | :-- | :-- | :-- |
| Postgres 16 + PostGIS 3.4 | `tandur_prod_db` | `127.0.0.1:5434` | 5432/5433 taken by other DBs |
| FastAPI (uvicorn 1 worker) | `tandur_prod_backend` | `127.0.0.1:8100` | build `backend/Dockerfile.prod` |
| Next.js 14 | `tandur_prod_frontend` | `127.0.0.1:3100` | 3000 taken by Grafana |
| nginx (host) | — | 80/443 | `/etc/nginx/sites-available/tandur.majestasolution.id` |

Compose file: `/opt/tandur/docker-compose.prod.yml` (the package's `deploy vps/docker-compose.yml` was NOT used —
its bundled nginx needs ports 80/443 which are owned by host nginx).
`setup_server.sh` from the package was NOT run (shared host: UFW/swap/hardening/Postgres already in place).

## Secrets (all root-only)
- GEE service account: `/opt/tandur/backend/credentials/paci-x-a7a003954fc1.json` (600, mounted ro into backend)
  master copy: `/root/creds/tandur/paci-x-a7a003954fc1.json`
- `/opt/tandur/.env` (600): POSTGRES_PASSWORD + SECRET_KEY (both random) + GEE vars + `MAPBOX_TOKEN=` (empty)
- `/root/creds/tandur/.generated-secrets` (600): DB password, SECRET_KEY, admin login
- `/root/creds/tandur/.admin-token` (600): current JWT for API smoke tests

**Admin login:** `admin@majestasolution.id` / password in `.generated-secrets` (role `superadmin`)
⚠️ Password default seed package (`admin@tani.local` / `admin123`) TIDAK bisa dipakai: `.local` ditolak EmailStr.

## Common commands
```bash
cd /opt/tandur
docker compose --env-file .env -f docker-compose.prod.yml ps
docker compose --env-file .env -f docker-compose.prod.yml logs -f backend
docker compose --env-file .env -f docker-compose.prod.yml build backend && \
docker compose --env-file .env -f docker-compose.prod.yml up -d backend
docker compose --env-file .env -f docker-compose.prod.yml exec -T backend alembic upgrade head
```
Redeploy code (later): `git -C /opt/tandur pull` → rebuild backend/frontend → `up -d`.
✅ **UPDATE 2026-09-18 14:35** — semua patch lokal (1–17) sudah **di-commit & di-push** ke `ktz369/Tani-Madjoe`
(branch `master` + `main`, commit `8364000`). Jadi `git pull` di `/opt/tandur` sekarang **aman**: patch ikut
terbawa, tidak perlu diterapkan ulang secara manual. Daftar di bawah tetap disimpan sebagai dokumentasi
apa saja yang berbeda dari commit upstream `2fec71a`.

⚠️ (historis, sebelum push) `git pull` akan menghapus/menimpa 3 patch lokal di bawah — terapkan ulang setelah pull.

## Local patches (BUKAN upstream — wajib dipakai ulang setiap pull)
1. `backend/alembic/versions/0005_create_plots_table.py`
   - `op.create_index("idx_plots_polygon", ...)` → `CREATE INDEX IF NOT EXISTS` (geoalchemy2 sudah auto-create index
     saat `op.create_table` → DuplicateTableError).
   - seed plot 4: `variety_id 5` → `3` (tidak ada variety id 5 → ForeignKeyViolation).
2. `backend/alembic/versions/0012_add_users_company_id.py` (**file baru**) — `users.company_id` tidak pernah dibuat
   migration 0002 padahal dipakai model User → semua query user (termasuk login) error
   `UndefinedColumnError: column users.company_id does not exist`.
3. Deploy files (baru, tidak upstream): `backend/Dockerfile.prod`, `frontend/Dockerfile.prod`,
   `backend/.dockerignore`, `frontend/.dockerignore`, `docker-compose.prod.yml`.

## Onboarding a fresh DB (kalau volume dihapus)
`alembic_version.version_num` default-nya `varchar(32)`, sedangkan banyak revision id > 32 char
(`0007_create_planting_seasons_table` = 34) → upgrade head gagal `StringDataRightTruncationError` dan
**seluruh transaksi rollback**. Pre-create the table with a wider column:
```bash
docker compose --env-file .env -f docker-compose.prod.yml exec -T db \
  psql -U tandur_admin -d tandur_db -c \
  "CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(255) NOT NULL, CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num));"
docker compose --env-file .env -f docker-compose.prod.yml exec -T backend alembic upgrade head
```

## Verified 2026-09-18
- `GET /api/health` → `{"status":"ok","database":"connected"}` (via HTTPS)
- login admin → JWT ok · `GET /api/plots|companies|alerts` 200
- `GET /api/estates/1/weather/current` → data real (33°C, hujan sedang, ET0 4.05)
- `POST /api/jobs/satellite?plot_id=1` → **LIVE GEE**: 2 observasi (Sentinel-2 NDVI 0.5475 / NDRE 0.395 /
  cloud 5.8% + Sentinel-1 SAR VV -11.25 dB, VH -17.38 dB) → bukan mock
- Frontend Next.js `/`, `/login`, `/dashboard`, `/peta` → 200
- SSL Let's Encrypt valid s/d 2026-12-17 (auto-renew)

Catatan: `deploy vps/tandur_nginx.conf` punya path `/docs`,`/redoc`,`/openapi.json` yang tidak ada
(FastAPI pakai prefix `/api`), dan upstream-nya port 3000/8000 → sudah disesuaikan di vhost host.

## Patch tambahan (frontend, 2026-09-18)
4. `frontend/src/components/layout/AuthGuard.tsx` — auto-login demo hard-coded (`admin@tani.local`/`admin123`)
   dihapus; kalau tidak ada token sekarang langsung redirect ke `/login`.
5. `frontend/src/app/login/page.tsx` — prefill email/password dikosongkan + blok "Kredensial Default Sistem"
   / tombol "Isi Form Otomatis" dihapus (kredensial seed sudah tidak valid & tidak aman dipublikasikan).
   Keduanya wajib di-rebuild (`docker compose ... build frontend`) setelah `git pull`.

## Patch tambahan #2 (2026-09-18 13:2x)
6. `backend/app/api/plots.py` — di dalam `_handle_create_plot` ada `from datetime import date` lokal
   (dekat baseline spectral index) → `date` jadi nama lokal seluruh fungsi → `date.today()` di baris ~190
   error `UnboundLocalError`. Import lokal dihapus (modul sudah import `date` di atas).
   Dampak sebelum patch: **POST /api/plots 500** (menu "Petak Baru" tidak bisa menyimpan).
7. `backend/alembic/versions/0013_create_missing_operational_tables.py` (**file baru**) — 6 tabel ada di
   model tapi tidak ada migrasinya: `saprotan_items`, `pest_scouting_reports`, `plot_irrigation_logs`,
   `plot_labor_logs`, `plot_saprotan_applications`, `post_harvest_logs`. Selama tidak ada, DELETE plot
   error `UndefinedTableError: relation "plot_labor_logs" does not exist` (ORM cascade load).
   Migration memakai `Base.metadata.create_all()` (checkfirst → aman, tidak menyentuh tabel existing).

## Fitur baru: hapus petak (2026-09-18)
Backend `DELETE /api/plots/{id}` sudah ada, tapi UI-nya belum. Ditambahkan:
- `frontend/src/components/plot/PlotDetailHeader.tsx` → prop `onDelete` + tombol **Hapus** (rose) di baris aksi.
- `frontend/src/app/petak/[id]/page.tsx` → state + modal konfirmasi + `api.delete('/plots/{id}')` → toast + redirect `/peta`.
- `frontend/src/app/peta/page.tsx` → tombol trash di tiap kartu petak + modal konfirmasi + reload list.
E2E diuji (Playwright, plot uji "PETAK UJI HAPUS" id 5): tombol trash → modal → "Ya, Hapus Petak" → kartu hilang, DB bersih.
Cascade: planting_seasons, spectral_indices, gdd_accumulation, alerts (ON DELETE CASCADE).

⚠️ Catatan: 2026-09-18 13:19-13:20 user menghapus **4 varietas** via `/admin/varietas` (DELETE 204).
Akibatnya `crop_varieties` & `phenology_phases` kosong dan `plots.variety_id` jadi NULL.
Data seed bisa dikembalikan dengan menambah varietas lagi di `/admin/varietas` atau re-seed migrasi 0004.

## Patch tambahan #3 — tab Agronomi kosong (2026-09-18 13:4x)
8. `frontend/src/lib/agronomyApi.ts` — semua call pakai prefix **`/v1/agronomy/...`**, padahal axios `baseURL="/api"`
   dan router backend di-mount di `/api/agronomy/...` → semua **404** → `Promise.all` di `DigitalAgronomyPanel`
   reject → banner "Gagal memuat data telemetri agronomi cloud", tidak ada data yang tampil.
   Fix: hapus prefix `/v1` (6 lokasi, termasuk URL unduh drone KML `/api/agronomy/plots/{id}/drone-mission.kml`).
   Verifikasi Playwright: 5/5 endpoint 200 (soil-characteristics, planting-window/simulate, water-balance, vrn, sar),
   banner error hilang, konten SoilGrids/Neraca Air/SAR/VRN tampil.
   ⚠️ `frontend/src/lib/operationsApi.ts` MASIH memakai `/v1/...` (10 lokasi) — dibiarkan karena endpoint
   labor/irrigation/saprotan/scouting/harvest/financial-summary **belum ada sama sekali** di backend.
   Kalau nanti endpoint-nya dibuat, path-nya juga harus dibetulkan (atau router dibuat di prefix `/v1`).

### Isi engine agronomi (bukan GeoLibre)
- Frontend: **mapbox-gl v3.4.0** (basemap raster Esri World Imagery / OSM karena token Mapbox kosong) +
  `@duckdb/duckdb-wasm` untuk analisis spasial in-browser (buffer karantina OPT). **Tidak ada GeoLibre.**
- Backend: soil → ISRIC SoilGrids REST v2.0 (+ Saxton-Rawls, fallback benchmark Pacitan);
  elevasi/teras → Open-Meteo & Open-Elevation API; SAR → regangan Sentinel-1 (VV/VH) dari record DB/GEE;
  VRN, neraca air terasiring, planting window FAO-56 → model komputasi internal.

## Patch tambahan #4 — modul Operasional TIDAK ADA di backend (2026-09-18 14:0x)

### Diagnosis
Audit sistematis: 71 pemanggilan API di frontend vs 98 route backend → **13 pemanggilan tidak punya
route sama sekali**, semuanya di `frontend/src/lib/operationsApi.ts` (prefix `/v1/...`). Model & tabel
ada (`app/models/operations.py`, migrasi 0013) tapi **tidak ada router**-nya. Trade-off: modul HOK,
irigasi, saprotan, OPT scouting, HPP, dan panen mustahil dijalankan (semua di-swallow `catch → []`).

### Yang ditambahkan
9. `backend/app/api/operations.py` (**baru**) — router prefix `/v1` (⇒ `/api/v1/...`, sesuai spesifikasi
   `new2.md` §6) + `backend/app/schemas/operations.py` (**baru**). Endpoint:
   - `GET/POST /v1/plots/{id}/labor` — HOK (total_cost auto: borongan=upah, harian=upah×orang)
   - `GET/POST /v1/plots/{id}/irrigation` — volume air, jam pompa, BBM (datetime dinormalkan UTC, output `Z`)
   - `GET/POST /v1/saprotan` — katalog & inventori
   - `POST /v1/plots/{id}/apply-saprotan` — aplikasi + **guardrail PHI** (blokir bila sisa hari < phi_days,
     HTTP 400 dengan teks manusiawi) + pengurangan stok (di-clamp ≥ 0)
   - `GET/POST /v1/plots/{id}/scouting` — laporan OPT (severity ringan/sedang/berat)
   - `GET /v1/plots/{id}/financial-summary` — HPP berjalan, proyeksi tonase, rasio efisiensi + status
   - `POST /v1/plots/{id}/harvest-closing` — rafaksi kadar air 14% (SNI), tutup musim aktif → `harvested`
   - `GET /v1/plots/{id}/post-harvest` — arsip panen + ROI/HPP aktual
   Terdaftar di `app/api/__init__.py`.
10. `backend/alembic/versions/0014_seed_saprotan_catalog.py` (**baru**) — seed 5 item katalog
    (Urea, NPK Phonsa 15-15-15, ZnSO4, Fipronil PHI 21h, Karbofuran PHI 30h). Tanpa ini picker
    Saprotan di UI kosong (tidak ada UI untuk membuat item). Idempotent.
11. `backend/app/api/plots.py` — `get_estate_plots_summary` **500** (`MissingGreenlet`): eager-load
    `Plot.division → Division.estate → Estate.company` (sebelumnya hanya `Plot.division`).
    Gejala lama: kartu ringkasan estate di `/peta` tidak pernah terisi.
12. `frontend/src/app/peta/page.tsx` — `fetchScoutingAndBuffer` fallback `|| 1` → request
    `/v1/plots/1/scouting` 404 saat daftar petak belum termuat. Sekarang skip bila belum ada petak.

### Verifikasi
- 16 uji API langsung: semua 2xx; validasi enum → 400, PHI lock → 400, financial/harvest → angka benar.
- Uji UI: tab Operasional & Keuangan plot 6 memuat (0 error console); modal Saprotan menampilkan
  5 item katalog + info PHI; **submit HOK dari UI → POST 201** dan baris muncul (Rp 380.000), lalu data uji dihapus.
- Crawl 12 halaman (/, dashboard, peta, laporan, agronomi, admin×3, petak 4 tab): **0 response ≥400, 0 error JS**.

## Restore seed varietas (permintaan user, 2026-09-18 14:1x)
13. `backend/alembic/versions/0015_restore_crop_variety_seed.py` (**baru**) — mengembalikan seed 0004
    (Inpari 32/Ciherang/BISI 18/Pioneer P35 + 9 fase fenologi masing-masing = 36 baris) yang terhapus
    via UI `/admin/varietas` pukul 13:19-13:20. **Idempotent**: varietas dilewati bila (crop_type, name)
    sudah ada; fase hanya dibuat bila varietas belum punya fase; id bawaan (1-4) dipakai kembali bila bebas.
    Verifikasi: `crop_varieties` = 4 baris dengan 9 fase masing-masing; halaman `/admin/varietas` tampil
    keempat varietas tanpa error (0 response ≥400).
    ⚠️ `plots.variety_id` petak `Bengkok 1` (id 6) masih NULL — bisa diisi lewat `PUT /api/plots/6`
    (`{"variety_id": 1}`) karena belum ada form edit petak di UI.

## Fitur baru: form edit petak (2026-09-18 14:2x)
14. `frontend/src/components/plot/EditPlotModal.tsx` (**baru**) — form edit petak yang memakai
    `PUT /api/plots/{id}` (endpoint sudah ada, tapi belum pernah dipakai UI). Field: nama petak,
    jenis tanaman (padi/jagung, filter ulang daftar varietas), varietas (dropdown per komoditas),
    tanggal tanam (memicu hitung ulang HST + fase fenologi), dan divisi/afdeling. Hanya field yang
    berubah yang dikirim (payload minimal); error API dinormalisasi ke string agar tak render objek.
    ⚠️ Batasan API: `variety_id`/`planting_date` hanya bisa diisi/diubah, belum bisa dikosongkan
    (`if payload.x is not None` di `update_plot`). Geometri poligon belum ada di form.
15. `frontend/src/components/plot/PlotDetailHeader.tsx` — tombol **Edit** (ikon pensil) di baris aksi.
16. `frontend/src/app/petak/[id]/page.tsx` — state `showEditModal`, render modal, toast + `fetchData()`
    setelah sukses.
17. `frontend/src/app/peta/page.tsx` — tombol pensil di **tiap kartu petak** (sebelah tombol hapus) +
    fetch master `/varieties` + render `EditPlotModal`; sukses → reload daftar petak.
    `frontend/src/components/plot/index.ts` — export komponen baru.
Verifikasi (Playwright, petak uji id 8): tombol Edit muncul di detail & di kartu `/peta`, modal prefill
benar (nama/varietas/tanggal), `PUT /api/plots/8` → 200, nama baru + varietas Inpari 32 + HST tampil,
0 error console; petak uji dihapus. Modal dari `/peta` untuk petak 6 prefill: "Bengkok 1",
opsi varietas padi (Ciherang/Inpari 32), tanggal 2026-10-01. Crawl 12 halaman: 0 error.
