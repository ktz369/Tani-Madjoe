# 04: Varietas & Fase Fenologi CRUD

**What to build:** Admin bisa menambah dan mengelola database varietas tanaman (padi & jagung) beserta parameter fase fenologi masing-masing: GDD target, Kc, NDVI expected range, NDRE threshold. Data ini menjadi referensi untuk GDD calculator dan alert engine.

**Blocked by:** 02-auth-login-jwt

**Status:** done

- [x] Model `CropVariety`: id, crop_type (padi/jagung), name, cycle_days, t_base, created_at
- [x] Model `PhenologyPhase`: id, variety_id (FK), phase_code, phase_name, hst_start, hst_end, ndvi_expected_min, ndvi_expected_max, ndre_threshold, kc_value, gdd_target
- [x] Alembic migration untuk tabel crop_varieties dan phenology_phases
- [x] CRUD endpoints: `POST/GET/PUT/DELETE /api/varieties`, `GET /api/varieties/{id}/phases`, `POST /api/varieties/{id}/phases`
- [x] Seed data: minimal 2 varietas padi (Inpari 32, Ciherang) dan 2 varietas jagung (BISI 18, Pioneer P35) dengan lengkap seluruh fase fenologi dan parameter-parameternya
- [x] Frontend: halaman admin `/admin/varietas` — list varietas, form tambah/edit varietas
- [x] Frontend: di dalam detail varietas, tabel fase fenologi dengan form tambah/edit fase (phase_code, GDD target, Kc, NDVI range, NDRE threshold)
- [x] Validasi: phase_code unik per varietas, hst_start < hst_end, kc_value > 0
