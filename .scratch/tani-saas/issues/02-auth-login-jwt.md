# 02: Auth — Login & JWT

**What to build:** Sistem autentikasi sederhana (email + password) dengan JWT token. User bisa login via endpoint `/api/auth/login`, menerima access token, dan semua endpoint lain memvalidasi token. Di frontend, halaman login dengan form email/password, redirect ke dashboard setelah sukses. Seed 1 user default saat pertama kali migrasi.

**Blocked by:** 01-project-scaffolding

**Status:** done

- [x] Model `User` di database: id, email, password_hash (bcrypt), name, role, created_at
- [x] Alembic migration untuk tabel `users`
- [x] Endpoint `POST /api/auth/login` — menerima email+password, mengembalikan JWT access token (expire 7 hari)
- [x] Endpoint `GET /api/auth/me` — mengembalikan data user dari token
- [x] Endpoint `POST /api/auth/register` — membuat user baru (max 3 user, reject jika sudah 3)
- [x] Dependency `get_current_user` yang mem-validasi JWT di header Authorization
- [x] Seed script: buat 1 user default (admin@tani.local / admin123) saat migration pertama
- [x] Frontend: halaman `/login` dengan form email + password
- [x] Frontend: middleware/guard — redirect ke `/login` jika tidak ada token, redirect ke `/dashboard` jika sudah login
- [x] Frontend: simpan token di httpOnly cookie atau localStorage, sertakan di setiap API request
