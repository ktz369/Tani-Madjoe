# 03: Hierarki Organisasi CRUD (Company → Estate → Division)

**What to build:** User bisa membuat dan mengelola hierarki organisasi lahan: Company → Estate → Division. Setiap entitas memiliki CRUD endpoint dan halaman admin di frontend. Estate menyimpan koordinat lokasi (titik) untuk kebutuhan cuaca.

**Blocked by:** 02-auth-login-jwt

**Status:** done

- [x] Model `Company`: id, name, address, created_at
- [x] Model `Estate`: id, company_id (FK), name, location_point (PostGIS Point geometry), province, kabupaten
- [x] Model `Division`: id, estate_id (FK), name
- [x] Alembic migration untuk tabel companies, estates, divisions
- [x] CRUD endpoints: `POST/GET/PUT/DELETE /api/companies`, `/api/companies/{id}/estates`, `/api/estates/{id}/divisions`
- [x] Endpoint `GET /api/companies/{id}/estates` mengembalikan estates beserta jumlah divisi dan petak
- [x] Frontend: halaman admin `/admin/organisasi` — tree view Company → Estate → Division
- [x] Frontend: form untuk membuat/edit Company, Estate (dengan input koordinat atau klik di peta mini), Division
- [x] Semua endpoint terproteksi JWT
