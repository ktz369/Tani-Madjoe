# 05: Plot CRUD + Draw Polygon di Peta

**What to build:** User bisa mendaftarkan petak lahan baru dengan menggambar poligon langsung di peta Mapbox, mengisi atribut agronomis (crop_type, varietas, tanggal tanam), dan melihat semua petak di peta estate. Poligon tersimpan di PostGIS. Luas dihitung otomatis dari geometri.

**Blocked by:** 03-organization-hierarchy-crud, 04-variety-phenology-crud

**Status:** done

- [x] Model `Plot`: id, division_id (FK), variety_id (FK), name, polygon (PostGIS Polygon geometry), area_hectares (auto-calculated), planting_date, crop_type, current_phase, current_hst
- [x] Alembic migration untuk tabel plots
- [x] CRUD endpoints: `POST/GET/PUT/DELETE /api/divisions/{id}/plots`, `GET /api/plots/{id}`
- [x] Endpoint `POST /api/plots` menerima GeoJSON polygon, menghitung luas (hektar) via PostGIS ST_Area (dengan transformasi ke UTM)
- [x] Endpoint `GET /api/estates/{id}/plots` mengembalikan semua petak dalam estate beserta GeoJSON geometrinya
- [x] Frontend: halaman `/admin/petak-baru` — Mapbox GL JS dengan Mapbox Draw plugin untuk menggambar poligon
- [x] Frontend: setelah menggambar poligon, form muncul untuk input nama petak, pilih division, pilih crop_type, pilih varietas (dropdown dari API), tanggal tanam
- [x] Frontend: halaman `/peta` — peta Mapbox menampilkan semua poligon petak untuk estate yang dipilih, klik petak menampilkan popup info ringkasan
- [x] current_hst otomatis dihitung dari planting_date terhadap hari ini
