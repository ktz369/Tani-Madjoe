# 01: Worker 1 — Simulasi Autentikasi, JWT, RBAC & Hierarki Organisasi

**What to test & simulate:**
Melakukan simulasi menyeluruh pada modul autentikasi dan hierarki perusahaan:
1. Uji siklus hidup token JWT: penerbitan saat login, payload claims (user_id, role, company_id), signature verification, expired token rejection, dan refresh token exchange.
2. Uji batasan Role-Based Access Control (RBAC): verifikasi bahwa Surveyor hanya dapat membaca/menulis petak lahan dan tidak dapat menghapus Estate/Perusahaan; Agronomist dapat memicu alert dan rekomendasi; Estate Manager mengelola divisi/estate; Superadmin memiliki akses menyeluruh.
3. Uji integritas hierarki Company -> Estate -> Division: buat entitas bertingkat, uji isolasi multi-tenant (pastikan user Company A tidak dapat melihat atau memodifikasi Estate Company B).
4. Edge cases & bug hunting: SQL injection pada username/email, password kosong/terlalu panjang, karakter non-standar, duplikasi nama estate dalam divisi, dan cascading delete behavior.

**Blocked by:** None (Worker 1 dapat langsung berjalan).

**Status:** completed

- [x] Bangun skrip simulasi `test_sim_auth_rbac.py` untuk menguji siklus hidup JWT, enkripsi bcrypt password, dan verifikasi role-based endpoint protection.
- [x] Uji multi-tenant isolation antara minimal 2 perusahaan independen dengan dataset estate & divisi masing-masing.
- [x] Lakukan stress test pada penanganan token rusak, token kedaluwarsa, dan token dengan signature palsu.
- [x] Periksa potensi celah otorisasi (IDOR) pada endpoint CRUD Estate dan Divisi.
- [x] Dokumentasikan temuan bug dan rekomendasi hardening keamanan.

### Hasil Simulasi & Audit:
- **Test Suite:** `backend/tests/simulations/test_sim_auth_rbac.py` (21/21 passed).
- **JWT Lifecyle & Cryptography:** Uji token issuance, tampered signature rejection, wrong secret key rejection, expired token rejection, dan refresh token exchange 100% valid.
- **RBAC Boundaries:** Superadmin, Estate Manager, Agronomist, Surveyor, dan unauthenticated access diuji pada seluruh boundary level (HTTP 401 & 403).
- **Multi-Tenant Segregation:** Isolasi Perusahaan A vs Perusahaan B pada level estate dan divisi terbukti kedap IDOR.
- **Hardening:** Ditambahkan sanitasi password, penanganan parameter query aman dari SQLi, dan cascading delete verification.
