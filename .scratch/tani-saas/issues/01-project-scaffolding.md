# 01: Project Scaffolding & Docker Compose

**What to build:** Dari nol, siapkan seluruh project skeleton sehingga `docker compose up` berhasil menjalankan 4 service: PostgreSQL+PostGIS, Python FastAPI backend, Next.js frontend, dan Nginx reverse proxy. Backend menyajikan endpoint `/api/health` yang mengembalikan `{"status": "ok"}`. Frontend menampilkan halaman placeholder. Nginx mem-proxy `/api/*` ke backend dan `/*` ke frontend.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] `docker-compose.yml` mendefinisikan 4 service: `db` (postgis/postgis image), `backend` (Python FastAPI), `frontend` (Next.js), `nginx`
- [x] Backend: FastAPI app dengan `main.py`, `config.py` (membaca env vars), `database.py` (SQLAlchemy async + PostGIS), `requirements.txt`, `Dockerfile`
- [x] Backend: endpoint `GET /api/health` mengembalikan `{"status": "ok", "database": "connected"}`
- [x] Backend: Alembic tersetup dengan initial migration (kosong, hanya memastikan koneksi)
- [x] Frontend: Next.js (App Router) project tersetup dengan `package.json`, `Dockerfile`, halaman `app/page.tsx` placeholder
- [x] `nginx.conf` mem-proxy `/api/` ke backend:8000 dan `/` ke frontend:3000
- [x] `.env.example` berisi semua environment variables yang diperlukan (DATABASE_URL, SECRET_KEY, GEE_KEY_PATH, MAPBOX_TOKEN)
- [x] `docker compose up --build` berhasil tanpa error, health endpoint bisa diakses via Nginx
